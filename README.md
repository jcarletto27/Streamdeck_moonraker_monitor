# Moonraker Monitor for Elgato Stream Deck

**Author:** John Carletto
**Version:** 0.1.0 (as per manifest.json)
**UUID:** `com.jcarletto.moonraker-monitor`

Monitor your Moonraker-enabled 3D printer directly from your Elgato Stream Deck! This plugin provides real-time status updates on your printer's key metrics, displayed conveniently on your Stream Deck keys.

## Features

* **Real-time Monitoring:** Fetches data from your Moonraker instance at a configurable polling interval.
* **Customizable Display:** Choose what information to display on your Stream Deck keys:
    * Bed Temperature (Actual/Target)
    * Hot End (Extruder) Temperature (Actual/Target)
    * Printing Status (e.g., Printing, Standby, Complete, Paused, Error)
    * Printing Progress (as a percentage)
    * Current Layer / Total Layers
* **Flexible Configuration:**
    * **Base URL (Mandatory):** The base HTTP/HTTPS address of your Moonraker instance (e.g., `http://mainsailos.local`, `http://192.168.1.100`).
    * **Port (Optional):** Specify a custom port if your Moonraker instance doesn't use the default HTTP/HTTPS ports or if it's not included in the Base URL.
    * **API Key (Optional):** If your Moonraker instance requires an API key for access.
    * **Polling Time (Mandatory):** How often (in seconds) the plugin should query Moonraker for updates.

## Requirements

* **Elgato Stream Deck Software:** Version 6.4 or higher.
* **Operating System:**
    * macOS 12 or higher.
    * Windows 10 or higher.
* **Moonraker Instance:** A running Moonraker server connected to your 3D printer.
* **Node.js and npm:** Required for building the plugin from source (see Development section).

## Installation

Currently, this plugin needs to be built from source and manually installed.

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/jcarletto27/Streamdeck_moonraker_monitor.git
    cd Streamdeck_moonraker_monitor
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Build the Plugin:**
    ```bash
    npm run build
    ```
    This command will compile the TypeScript code and package the plugin into a folder named `com.jcarletto.moonraker-monitor.sdPlugin` in your project's root directory.

4.  **Install the Plugin:**
    * Navigate to your Stream Deck plugins folder:
        * **macOS:** `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
        * **Windows:** `%APPDATA%\Elgato\StreamDeck\Plugins\`
    * Copy the entire `com.jcarletto.moonraker-monitor.sdPlugin` folder (created in step 3) into this Stream Deck plugins directory.
    * Restart the Stream Deck application if it's running.
    ** OR Using the Streamdeck cli
    * Install the streamdeck cli `npm install -g @elgato/cli`
    * Navigate to the `com.jcarletto.moonraker-monitor.sdPlugin` folder
    * execute the command `streamdeck link`
    * execute the command `streamdeck r com.jcarletto.moonraker-monitor`
  
    
The "Moonraker Monitor" plugin should now be available in your Stream Deck actions list under the "3D Printing" category (or as specified in your manifest).

## Configuration

1.  In the Stream Deck software, drag the "Moonraker Status" action onto a key.
2.  The Property Inspector will appear below the canvas. Configure the following settings:
    * **Base URL:** Enter the full base URL of your Moonraker instance (e.g., `http://fluidd.local`, `http://192.168.1.123`). This is mandatory.
    * **Port (Optional):** If your Moonraker instance runs on a non-standard port and it's not part of the Base URL, enter it here (e.g., `7125`).
    * **API Key (Optional):** If your Moonraker setup requires an API key for `/printer/objects/query` endpoint, enter it here.
    * **Polling Time (sec):** Enter the desired update frequency in seconds (e.g., `5` for every 5 seconds). This is mandatory.
    * **Display Options:** Check the boxes for the information you want to see on the Stream Deck key.
3.  The key should update with data from your Moonraker instance shortly after valid settings are provided.

## Development

This plugin is built using:

* TypeScript
* Elgato Stream Deck SDK (`@elgato/streamdeck`)
* Webpack for bundling
* Zod for data validation
* `sdpi-components.js` for some Property Inspector elements (though the current PI is custom HTML).



## Troubleshooting

* **Plugin Not Appearing:** Ensure you've copied the *entire* `com.jcarletto.moonraker-monitor.sdPlugin` folder to the correct Stream Deck plugins directory and restarted the Stream Deck application.
* **"Setup Req." on Key:** This means the Base URL or Polling Time is not set or is invalid. Check the Property Inspector.
* **"URL Error", "Fetch Fail", "Host Down?":**
    * Verify the Base URL and Port are correct and your Moonraker instance is accessible from the machine running Stream Deck.
    * Check for firewall issues.
    * Ensure Moonraker is running.
* **"API Key?":** Your Moonraker instance might require an API key, and it's either missing or incorrect.
* **"Parse Err":** The data received from Moonraker doesn't match the expected format. This could indicate an issue with the Moonraker API version or an unexpected response.
* **Build Errors:** Check the console output for specific TypeScript or Webpack errors. Ensure all dependencies are installed (`npm install`).

For more detailed debugging, the plugin logs messages to the Stream Deck logs. You can enable more verbose logging in the Stream Deck software or launch it with debug flags (see Elgato's developer documentation).

## License

This project is licensed under the MIT License.
