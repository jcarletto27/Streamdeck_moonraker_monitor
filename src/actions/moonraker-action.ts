import { action, SingletonAction, DidReceiveSettingsEvent, KeyDownEvent, WillAppearEvent, WillDisappearEvent, streamDeck, KeyAction } from "@elgato/streamdeck";
import * as fs from 'node:fs';
import * as path from 'node:path';

interface MoonrakerSettings {
    baseUrl?: string;
    port?: string;
    apiKey?: string;
    pollingInterval?: number;
    displayBedTemp?: boolean;
    displayHotendTemp?: boolean;
    displayPrintStatus?: boolean;
    displayPrintProgress?: boolean;
    displayLayerInfo?: boolean;
    [key: string]: any; // Index signature to satisfy JsonObject constraint
}

interface MoonrakerPrinterObjects {
    heater_bed?: { temperature: number; target: number };
    extruder?: { temperature: number; target: number }; // Assumes primary extruder is 'extruder'
    print_stats?: {
        state: string; // "standby", "printing", "paused", "complete", "error"
        filename?: string;
        info?: {
            current_layer?: number;
            total_layer?: number;
        };
    };
    virtual_sdcard?: { progress: number }; // 0.0 to 1.0
    display_status?: { message: string }; // Can sometimes contain layer info like "Layer X/Y"
}
@action({ UUID: 'com.jcarletto.moonraker-monitor.action'})
export class MoonrakerAction extends SingletonAction<MoonrakerSettings> {
    // Map to store state (settings and timerId) for each action instance
    private actionStates: Map<string, { settings: MoonrakerSettings, timerId?: NodeJS.Timeout }> = new Map();

    override async onWillAppear(event: WillAppearEvent<MoonrakerSettings>): Promise<void> {
        const actionId = event.action.id;
        const settings = event.payload.settings || {};
        this.actionStates.set(actionId, { settings });
        streamDeck.logger.info(`Action ${actionId} appeared. Initializing with settings.`);
        await this.applySettingsAndStartPolling(event.action as KeyAction<MoonrakerSettings>, settings);
    }

    override async onWillDisappear(event: WillDisappearEvent<MoonrakerSettings>): Promise<void> {
        const actionId = event.action.id;
        streamDeck.logger.info(`Action ${actionId} disappearing. Stopping polling and cleaning up state.`);
        this.stopPollingForAction(actionId);
        this.actionStates.delete(actionId);
    }

    override async onDidReceiveSettings(event: DidReceiveSettingsEvent<MoonrakerSettings>): Promise<void> {
        const actionId = event.action.id;
        const newSettings = event.payload.settings;
        let currentState = this.actionStates.get(actionId);

        if (currentState) {
            currentState.settings = newSettings;
        } else {
            // Should have been set by onWillAppear, but as a fallback:
            streamDeck.logger.warn(`Received settings for action ${actionId} but no prior state found. Initializing.`);
            currentState = { settings: newSettings };
            this.actionStates.set(actionId, currentState);
        }
        streamDeck.logger.info(`Received new settings for action ${actionId}. Applying and restarting polling.`);
        await this.applySettingsAndStartPolling(event.action as KeyAction<MoonrakerSettings>, newSettings);
    }

    override async onKeyDown(event: KeyDownEvent<MoonrakerSettings>): Promise<void> {
        const actionId = event.action.id;
        const state = this.actionStates.get(actionId);
        if (state) {
            streamDeck.logger.info(`Key pressed for action ${actionId}, forcing data fetch.`);
            await this.fetchDataAndUpdateKey(event.action as KeyAction<MoonrakerSettings>, state.settings);
        } else {
            streamDeck.logger.warn(`Key pressed for action ${actionId}, but no state found.`);
        }
    }

    private async applySettingsAndStartPolling(action: KeyAction<MoonrakerSettings>, settings: MoonrakerSettings): Promise<void> {
        const actionId = action.id;
        streamDeck.logger.debug(`Applying settings for action ${actionId} and attempting to start polling.`);
        this.stopPollingForAction(actionId); // Stop any existing timer for this action

        if (this.isValidSettings(settings)) {
            streamDeck.logger.info(`Settings for action ${actionId} are valid. Performing initial data fetch and starting polling.`);
            await this.fetchDataAndUpdateKey(action, settings); // Initial fetch
            const intervalSeconds = settings.pollingInterval || 5;
            streamDeck.logger.info(`Polling interval for action ${actionId} set to ${intervalSeconds} seconds.`);
            
            const timerId = setInterval(async () => {
                const currentActionState = this.actionStates.get(actionId);
                // Check if this timer is still the active one for this action
                if (currentActionState && currentActionState.timerId === timerId) {
                    streamDeck.logger.debug(`Polling timer (${timerId}) fired for action: ${actionId}. Fetching data.`);
                    await this.fetchDataAndUpdateKey(action, currentActionState.settings);
                } else if (!currentActionState) {
                    streamDeck.logger.warn(`Polling timer (${timerId}) fired for action ${actionId}, but its state was not found. This timer should have been cleared.`);
                } else { // currentActionState.timerId !== timerId
                    streamDeck.logger.warn(`Polling timer (${timerId}) fired for action ${actionId}, but it's an old timer. Active timer is ${currentActionState.timerId}. This old timer should have been cleared.`);
                }
            }, intervalSeconds * 1000);
            this.actionStates.get(actionId)!.timerId = timerId; // Store the new timerId
        } else {
            streamDeck.logger.warn(`Settings for action ${actionId} are invalid. Polling not started. Displaying "Settings Required".`);
            await action.setTitle('Settings\nRequired');
        }
    }

    private stopPollingForAction(actionId: string): void {
        const state = this.actionStates.get(actionId);
        if (state && state.timerId) {
            clearInterval(state.timerId);
            state.timerId = undefined;
            streamDeck.logger.info(`Stopped polling timer for action ${actionId}.`);
        }
    }

    private isValidSettings(settings: MoonrakerSettings): settings is Required<Pick<MoonrakerSettings, 'baseUrl' | 'pollingInterval'>> & MoonrakerSettings {
        return !!settings.baseUrl && !!settings.pollingInterval && settings.pollingInterval > 0;
    }

    private async fetchDataAndUpdateKey(action: KeyAction<MoonrakerSettings>, settings: MoonrakerSettings): Promise<void> {
        streamDeck.logger.debug(`fetchDataAndUpdateKey called for action: ${action.id} with settings: ${JSON.stringify(settings)}`);
        if (!this.isValidSettings(settings)) {
            await action.setTitle('Settings\nInvalid');
            streamDeck.logger.warn(`fetchDataAndUpdateKey for action ${action.id}: Settings invalid, aborting fetch.`);
            return;
        }

        let url = settings.baseUrl!; // Known to be valid due to isValidSettings
        if (settings.port) {
            if (url.endsWith('/')) {
                url = url.slice(0, -1);
            }
            url = `${url}:${settings.port}`;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `http://${url}`;
        }

        const endpoint = `${url}/printer/objects/query?print_stats&heater_bed&extruder&display_status&virtual_sdcard`;
        streamDeck.logger.info(`Action ${action.id}: Fetching from endpoint: ${endpoint}`);

        try {
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (settings.apiKey) {
                streamDeck.logger.debug(`Action ${action.id}: API key found in settings, adding to headers.`);
                headers['X-Api-Key'] = settings.apiKey;
            }

            const response = await fetch(endpoint, { headers });

            if (!response.ok) {
                await action.setTitle(`Error:\n${response.status}`);
                const errorText = await response.text();
                streamDeck.logger.error(`Action ${action.id}: Moonraker API Error: ${response.status} ${response.statusText} - Response: ${errorText}`);
                return;
            }

            const data = (await response.json()) as { result: { status: MoonrakerPrinterObjects } };
            streamDeck.logger.debug(`Action ${action.id}: Successfully fetched and parsed data from Moonraker.`);
            await this.updateKeyDisplay(data.result.status, action, settings);

        } catch (error: any) {
            await action.setTitle('Fetch\nError');
            streamDeck.logger.error(`Action ${action.id}: Exception during fetch or data processing:`, error.message, error.stack);
        }
    }

    private async getIconRelativePath(iconFileName: string): Promise<string | undefined> {
        // Construct the path relative to the plugin's root directory
        const relativePath = path.join('imgs', 'actions', 'moonraker', iconFileName);

        // We will directly return the relative path.
        // action.setImage() can handle relative paths from the plugin root.
        // This avoids issues with fs.existsSync if streamDeck.info.plugin.path is unreliable
        // and also simplifies the logic, potentially avoiding the TypeError.
        streamDeck.logger.debug(`Providing relative path for icon ${iconFileName}: ${relativePath}`);
        return relativePath;
    }
    private async updateKeyDisplay(status: MoonrakerPrinterObjects, action: KeyAction<MoonrakerSettings>, settings: MoonrakerSettings): Promise<void> {
        const {
            displayBedTemp,
            displayHotendTemp,
            displayPrintStatus,
            displayPrintProgress,
            displayLayerInfo
        } = settings;

        const titleLines: string[] = [];

        const currentPrintState = status.print_stats?.state?.toLowerCase();
        let displayablePrintState = currentPrintState ? currentPrintState.charAt(0).toUpperCase() + currentPrintState.slice(1) : "Unknown";
        if (displayablePrintState === "Standby") displayablePrintState = "Idle";
        if (displayPrintStatus && currentPrintState) {
            titleLines.push(displayablePrintState);
        }

        if (displayBedTemp && status.heater_bed) {
            titleLines.push(`B:${Math.round(status.heater_bed.temperature)}/${Math.round(status.heater_bed.target)}°`);
        }
        if (displayHotendTemp && status.extruder) {
            titleLines.push(`H:${Math.round(status.extruder.temperature)}/${Math.round(status.extruder.target)}°`);
        }

        // Display Print Progress if selected and applicable
        if (displayPrintProgress && status.virtual_sdcard?.progress !== undefined && (currentPrintState === "printing" || currentPrintState === "paused")) {
            const progressPercent = Math.round(status.virtual_sdcard.progress * 100);
            titleLines.push(`${progressPercent}%`);
        }

        // Display Layer Info if selected and applicable
        if (displayLayerInfo && (currentPrintState === "printing" || currentPrintState === "paused")) {
            let layerText: string | undefined;
            if (status.print_stats?.info?.current_layer !== undefined && status.print_stats?.info?.total_layer !== undefined) {
                layerText = `L:${status.print_stats.info.current_layer}/${status.print_stats.info.total_layer}`;
            } else if (status.display_status?.message && status.display_status.message.toLowerCase().includes("layer")) {
                const layerMatch = status.display_status.message.match(/Layer\s*(\d+)\s*\/\s*(\d+)/i);
                if (layerMatch) {
                    layerText = `L:${layerMatch[1]}/${layerMatch[2]}`;
                }
            }
            if (layerText) {
                titleLines.push(layerText);
            }
        }

        if (titleLines.length === 0) {
            //titleLines.push("Moonraker");
            if (currentPrintState) {
                titleLines.push(displayablePrintState);
            } else {
                titleLines.push("No Data");
            }
        }

        await action.setTitle(titleLines.join('\n'));

        // Set Icon based on state
        let iconFileName: string | undefined;
        switch (currentPrintState) {
            case 'standby':
            case 'idle': // Klipper often uses 'idle' for standby
                iconFileName = 'icon_printer_standby.png';
                break;
            case 'printing':
                iconFileName = 'icon_printer_printing.png';
                break;
            case 'paused':
                iconFileName = 'icon_printer_paused.png';
                break;
            case 'complete':
                iconFileName = 'icon_printer_complete.png';
                break;
            case 'error':
                iconFileName = 'icon_printer_error.png';
                break;
            default:
                streamDeck.logger.debug(`No specific icon for print state: ${currentPrintState}. Reverting to default.`);
                // Revert to default manifest icon if state is unknown or unhandled
                await action.setImage(undefined); 
                break;
        }

        if (iconFileName) {
            const iconPath = await this.getIconRelativePath(iconFileName);
            if (iconPath) {
                await action.setImage(iconPath);
            } else {
                // Fallback if icon file is not found, revert to default manifest icon
                await action.setImage(undefined);
                streamDeck.logger.warn(`Icon ${iconFileName} not found for state: ${currentPrintState}. Reverted to default icon.`);
            }
        }
    }
}