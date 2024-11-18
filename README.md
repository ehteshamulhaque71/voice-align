# VoiceAlign

VoiceAlign is an LLM-assisted shimming layer to convert users natural voice commands to a fixed-format command that can be understood by the underlying system. 

## Installation and Development

1. Install an http server: 
```bash
npm install -g http-server
```

2. Open a terminal/powershell and navigate to the project directory.
```bash
cd path/to/VoiceAlign
```

3. Run the server: 
```
http-server
```

4. Open a browser and navigate to the development URL shown in the terminal.

## Usage
1. Tweak the prompt and the API in the `voicealign.js` file as per your requirement. The current prompt has been tested to work with Claude 3.5 Sonnet API and VoiceControl on iOS.

2. Replace `YOUR_API_KEY` with your Claude API key in the `voicealign.js` file at line 22.
```javascript
const API_KEY = "YOUR_API_KEY";
```

3. Run the server and open the development URL in a browser.

4. Select a TTS voice from the dropdown. We recommend using the `Samantha` voice for the best results.

5. Click `Start Listening` button to start the voice recognition.