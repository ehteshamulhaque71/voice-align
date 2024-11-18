const startRecording = document.getElementById('startRecording');
const result = document.getElementById('result');
const speechIcon = document.getElementById('speechIcon');
const selection = document.getElementById('selection');
const history = document.getElementById('history');
const commandResult = document.getElementById('commandResult');
const playCommand = document.getElementById('playCommand');
const voiceSelect = document.getElementById('voiceSelect');
let recognition;
let isRecording = false;
let fullTranscript = "";
const TIMEOUT_DURATION = 3000;
let voices = [];
let silenceTimer;
let hasSpeechStarted = false;
let currentSelection = "";
let commandCreatingTags = "";
let utteredCommand = selection.value;
let commandHistory = history.value;
let startTime = new Date();
let endTime = new Date();
let API_KEY = "YOUR_API_KEY";

function populateVoiceList() {
	voices = window.speechSynthesis.getVoices();
	if (voices.length === 0) {
		setTimeout(populateVoiceList, 10);
		return;
	}

	voiceSelect.innerHTML = '';
	voices.forEach((voice, i) => {
		const option = document.createElement('option');
		option.textContent = `${voice.name} (${voice.lang})`;
		option.setAttribute('data-lang', voice.lang);
		option.setAttribute('data-name', voice.name);
		voiceSelect.appendChild(option);
	});

	if (voiceSelect.options.length > 0) {
		voiceSelect.selectedIndex = 0;
	}
}

populateVoiceList();

if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
	speechSynthesis.onvoiceschanged = populateVoiceList;
}

function getSelectedVoice() {
	const selectedOption = voiceSelect.selectedOptions[0];
	if (selectedOption) {
		const voiceName = selectedOption.getAttribute('data-name');
		return voices.find(voice => voice.name === voiceName);
	}
	return null;
}

function stopSpeaking() {
	if (speechSynthesis.speaking) {
		speechSynthesis.cancel();
	}
}

function processSpeech() {
	stopRecording();
	sendToLLM().then(() => {
		if (isRecording) {
			startRecording();
		}
	});
}

function startSilenceTimer() {
	clearTimeout(silenceTimer);
	silenceTimer = setTimeout(() => {
		if (fullTranscript.trim() === "") {
			startSilenceTimer();
		} else {
			processSpeech();
		}
	}, TIMEOUT_DURATION);
}

function initializeSpeechRecognition() {
	if (!('webkitSpeechRecognition' in window)) {
		startRecording.style.display = 'none';
		result.value = 'Web Speech API is not supported in this browser.';
		return;
	}

	recognition = new webkitSpeechRecognition();
	recognition.continuous = true;
	recognition.interimResults = true;

	recognition.onresult = (event) => {
		let interimTranscript = '';

		for (let i = event.resultIndex; i < event.results.length; ++i) {
			const transcriptPart = event.results[i][0].transcript;
			if (event.results[i].isFinal) {
				fullTranscript = (fullTranscript.trim() + ' ' + transcriptPart.trim()).trim();
			} else {
				interimTranscript += transcriptPart;
			}
		}

		if (isRecording) {
			result.value = fullTranscript.trim() + ' ' + interimTranscript.trim();
		}
	};

	recognition.onstart = () => {
		speechIcon.style.visibility = 'visible';
		speechIcon.classList.add('pulse');
		isRecording = true;
		fullTranscript = "";
		// result.value = "";
		playCommand.disabled = true;
		hasSpeechStarted = false;
		startRecording.textContent = 'Stop Listening';
	};

	recognition.onspeechstart = () => {
		if (!hasSpeechStarted) {
			hasSpeechStarted = true;
			startSilenceTimer();
		}
	};

	recognition.onend = () => {

		if (isRecording) {
			recognition.start();
		}
	};

	recognition.onerror = (event) => {
		if (isRecording) {
			recognition.stop();
			setTimeout(() => {
				if (isRecording) {
					recognition.start();
				}
			}, 1000);
		}
	};
}

function record() {
	stopSpeaking();
	fullTranscript = "";
	//result.value = "";
	isRecording = true;
	recognition.start();
}

function stopRecording() {
	clearTimeout(silenceTimer);
	recognition.stop();
	startRecording.textContent = 'Start Listening';
	speechIcon.style.visibility = 'hidden';
	speechIcon.classList.remove('pulse');
	isRecording = false;
	hasSpeechStarted = false;
}

async function sendToLLM() {
	utteredCommand = fullTranscript.trim();
	if (!utteredCommand) {
		commandResult.value = "No speech detected.";
		playCommand.disabled = true;
		return;
	}
	utteredCommand = utteredCommand.toLowerCase()
	if (utteredCommand === 'wake up' || utteredCommand === 'go to sleep' || utteredCommand === 'command mode' || utteredCommand === 'dictation mode') {
		commandResult.textContent = `Command: ${utteredCommand}`;

		playCommand.disabled = false;
		const utterance = new SpeechSynthesisUtterance(utteredCommand);

		const voice = getSelectedVoice();
		if (voice) {
			utterance.voice = voice;
		}

		utterance.onend = function (event) {
			if (!isRecording) {
				record();
			}
		};
		speechSynthesis.speak(utterance);

		return;
	}

	try {
		currentSelection = selection.value;
		commandHistory = history.value;
		const CORS_PROXY = "https://vc-wrapper-1e7780224357.herokuapp.com/";
		const API_URL = "https://api.anthropic.com/v1/messages";
		const response = await fetch(CORS_PROXY + API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-API-Key': API_KEY,
				'anthropic-version': '2023-06-01',
				"anthropic-dangerous-direct-browser-access": true
			},
			body: JSON.stringify({
				model: "claude-3-5-sonnet-20240620",
				max_tokens: 1000,
				temperature: 0,
				system: `You are an advanced Command Corrector tasked with processing and correcting text editing voice commands. Accuracy is paramount, as misinterpreting user intent could result in unintended text changes. Follow these steps for each command:

Analyze the user's command
Determine the command type
Identify required arguments
Extract arguments following guidelines
Construct the corrected command

Command Types and arguments

SELECT <phrase>
SELECT PREVIOUS WORD (no argument)
SELECT NEXT WORD (no argument)
DELETE <phrase>
DELETE THAT
INSERT <new_phrase> BEFORE <phrase>
INSERT <new_phrase> AFTER <phrase>
REPLACE <phrase> WITH <new_phrase>
CHOOSE <number>
CORRECT <phrase>
CORRECT THAT
UNDO THAT (no argument)
REDO THAT (no argument)

Argument Extraction Guidelines
<phrase> and <new_phrase> Extraction:

Extract exactly as spoken, including articles and common words.
- If a <phrase> contains a spelling mistake, keep the mistake, but add spaces after each character (aple -> a p l e)
- Remove meta-words like 'the word', 'the phrase' or natural utterances such as 'please' or 'can you' if they're not part of the intended command
- For commands with two arguments(e.g., INSERT, REPLACE), the <new_phrase> must be in the command
			- Only use current_selection as <phrase> (not the <new_phrase>) in INSERT and REPLACE commands if not mentioned or if the command uses 'THAT' or 'SELECTION' or similar deictic references to the current selection.
				- For any other command type THAT must not be changed to the current_selection

				Special Cases:
				- For SELECT commands, if the argument is a number or numeric phrase, CONVERT to CHOOSE (e.g., "SELECT two" to "CHOOSE 2")
				- For CHOOSE commands, if the argument is not a number or numeric phrase, CONVERT to SELECT (e.g., "CHOOSE apple" to "SELECT apple").
- For INSERT, the location of insertion BEFORE or AFTER must be in the command, or there must be sufficient information to infer it (e.g., previous to -> BEFORE)
- For REPLACE, the preposition WITH must be in the command, or there must be sufficient information to infer it (e.g., using/to/by -> WITH)
				- Convert number words to digits (e.g., "two" to 2)
				- Convert ordinal to cardinal numbers (e.g., "first" to 1)

				Detailed Guidelines and Examples for Argument Extraction

				SELECT <phrase>

					Examples:
"SELECT the quick brown fox" -> <phrase> = "the quick brown fox
"SELECT the" -> <phrase> = "the"
"SELECT a large green apple" -> <phrase> = "a large green apple"
"SELECT  word happy" -> <phrase> = "happy"
"SELECT aple" -> <phrase> = "a p l e"


										DELETE <phrase>

											Examples:
											<phrase> can be extracted in the same as the SELECT command

												CORRECT <phrase>
													Examples:
													<phrase> can be extracted in the same as the SELECT command


														INSERT <new_phrase> BEFORE/AFTER <phrase>

															Both arguments are required.
															Use current selection as <phrase> if unspecified
																Examples:
"insert hello before world" -> <new_phrase> = "hello", <phrase> = "world"
"insert the before quick brown fox" -> <new_phrase> = "the", <phrase> = "quick brown fox"
"insert the word apple before red ball" -> <new_phrase> = "apple", <phrase> = "red ball"
"insert the word apple before that" -> <new_phrase> = "apple", <phrase> = [current_selection]


																				REPLACE <phrase> WITH <new_phrase>

																					Both arguments are required.
																					Use current selection as <phrase> if unspecified
																						Examples:
"replace apple with orange" -> <phrase> = "apple", <new_phrase> = "orange"
"replace that with banana" -> <phrase> = [current_selection], <new_phrase> = "banana"


																								CHOOSE <number>

Example: "choose two" -> <number> = "2"



																										Examples of Incorrect Commands and How to Correct

																										SELECT Command Corrections:

																										Incorrect: "CHOOSE the red ball"
																										Correction: "SELECT the red ball"
																										Incorrect: "SELECT WORD happy"
																										Correction: "SELECT happy"
																										Incorrect: "SELECT THE PHRASE once upon a time"
																										Correction: "SELECT once upon a time"


																										DELETE Command Corrections:

																										Incorrect: "REMOVE the red ball"
																										Correction: "DELETE the red ball"
																										Incorrect: "DELETE WORD happy"
																										Correction: "DELETE happy"
																										Incorrect: "DELETE the" (This is actually correct, not incomplete)
																										Correction: "DELETE the"
																										Incorrect: "DELETE THAT" (This is actually correct, not incomplete and does not require any current selection)
																										Correction: "DELETE THAT"



																										INSERT Command Corrections:

																										Incorrect: "ADD hello BEFORE world"
																										Correction: "INSERT hello BEFORE world"
																										Incorrect: "INSERT hello BEFORE THE WORD world"
																										Correction: "INSERT hello BEFORE world"
																										Incorrect: "INSERT hello AFTER"/"INSERT hello AFTER THAT"/"INSERT hello AFTER SELECTION"/"INSERT hello AFTER THAT WORD"
																										Correction: "INSERT hello AFTER word" (here, current_selection = 'world')
																										Incorrect: "INSERT hello AFTER"/"INSERT hello AFTER THAT"/"INSERT hello AFTER SELECTION"/"INSERT hello AFTER THAT WORD"
																										Correction: [cannot correct, suggest 1-3 potential commands] (here current selection = '')


																										REPLACE Command Corrections:

																										Incorrect: "REPLACE apple TO orange"
																										Correction: "REPLACE apple WITH orange"
																										Incorrect: "REPLACE THE WORD apple WITH orange"
																										Correction: "REPLACE apple WITH orange"
																										Incorrect: "REPLACE THAT WITH banana"/"REPLACE SELECTION WITH banana"/"REPLACE THE WORD WITH banana"/"REPLACE WITH banana"
																										Correction: "REPLACE apple WITH banana" (here, current_selection = 'apple')
																										Incorrect: "REPLACE THAT WITH banana"/"REPLACE SELECTION WITH banana"/"REPLACE THE WORD WITH banana"/"REPLACE WITH banana"
																										Correction: "cannot correct, suggest 1-3 potential commands" (here, current selection = '')


																										CHOOSE Command Corrections:

																										Incorrect: "CHOOSE first"
																										Correction: "CHOOSE 1"
																										Incorrect: "SELECT two"
																										Correction: "CHOOSE 2"
																										Incorrect: "SELECT number two"
																										Correction: "CHOOSE 2"
																										Incorrect: "number two"
																										Correction: "CHOOSE 2"
																										Incorrect: "second"
																										Correction: "CHOOSE 2"
																										Incorrect: "two"
																										Correction: "CHOOSE 2"


																										CORRECT Command Corrections:
																										Incorrect: "FIX the red ball"
																										Correction: "CORRECT the red ball"
																										Incorrect: "CORRECT the" (This is actually correct, not incomplete)
																										Correction: "CORRECT the"
																										Incorrect: "EDIT THAT"
																										Correction: "CORRECT THAT"
																										Incorrect: "CORRECT"
																										Correction: "CORRECT THAT"
																										Incorrect: "CORRECT THAT" (This is actually correct, not incomplete and does not require any current selection)
																										Correction: "CORRECT THAT"

																										UNDO/REDO Corrections:

																										Incorrect: "UNDO"
																										Correction: "UNDO THAT"
																										Incorrect: "REDO"
																										Correction: "REDO THAT"



																										Additional Guidelines for Handling Incorrect Commands

																										- Always prioritize preserving the user's intended phrase, even if the command structure is incorrect.
																										- For commands with missing arguments, provide suggestions rather than attempting to correct them.
																										- When dealing with extra words (like "THE WORD" or "THE PHRASE"), remove them only if they're clearly meta-instructions and not part of the intended phrase.
																										- For ambiguous commands, provide multiple suggestions if possible.
																										- Maintain high confidence for clear corrections, even if the original command was incorrect.

																										Command Processing Steps

																										1. Analyze the command:

																										Identify keywords indicating command type.
																										Note any potential arguments.


																										2. Determine command type:

																										Match to one of the listed command types
																										If ambiguous, prepare suggestions
																										Assign a high confidence value (0 - 100) if users use exact command keywords or very clear synonyms (e.g., FIX instead of CORRECT)


																										3. Identify required arguments:

																										Refer to the command type list for the required arguments.


																										4. Extract arguments:
																										For no argument commands, you do not need to extract any arguments and do not need to consider current_selection
																										Follow <phrase> and <new_phrase> extraction guidelines
																											For two-phrase commands, ensure the first phrase is explicitly stated
																											Handle special cases as noted
																											Update your confidence value (0 - 100). The updated value should be high if you can extract all the arguments.


																											5. Construct corrected command:
																											Already correct commands should stay the same (e.g., CORRECT THAT must remain CORRECT THAT)
																											If you cannot construct the correct command because required arguments are missing or the command is too vague, provide the 1-3 most relevant suggestions.
																											Combine command type with extracted arguments and represent them in the current syntax (e.g., "WITH" in REPLACE commands)
For no-command arguments, match correct syntax if the command is not correct (e.g., DELETE -> DELETE THAT)

																											6. Update Selection
																											If you cannot correct a command, do not change the current_selection
																											After a command is executed, the system should update the selection according to the following rules:

																											SELECT <phrase> commands:
																												The selection must be updated to the <phrase>.

																													CHOOSE commands:
																													If the command at index 0 of command history is a SELECT <phrase> command, do not change the selection.


																														For all other cases:
																														the selection must be cleared and set to an "" (empty string).


																														7. Update Command History
																														Do not include CHOOSE commands in the command history.
																														Do not change the history if you cannot correct a command.
																														If you can correct it, add it to the beginning of the history list and remove the oldest command if the list exceeds five commands.



																														Output Format
For confident corrections (confidence > 80%):
																														{
																															"reasoning": "string",
																														"error": false,
																														"corrected_command": "string",
																														"confidence": number,
																														"updated_selection": "string",
																														"updated_command_history": ["string", "string", "string", "string", "string"]
}
																														For low confidence or insufficient information (confidence ≤ 80%):
																														{
																															"reasoning": "string",
																														"error": true,
																														"corrected_command": "None",
																														"confidence": number,
																														"suggested_commands": ["string", "string", "string"],
																														"updated_selection": "string",
																														"updated_command_history": ["string", "string", "string", "string", "string"]
}

																														Input Format
																														The system receives input in the following format:
																														{
																															"current_selection": "string",
																														"command_history": ["string", "string", "string", "string", "string"],
																														"current_command": "string"
}
																														Where:

																														current_selection: A string representing the currently selected text, if any. If no text is selected, this will be an empty string.
																														command_history: An array of strings, each representing a previously executed command. This array:
																														Contains up to 5 most recent commands
																														Excludes any CHOOSE commands
																														Is ordered from most recent (index 0) to least recent (index 4)


																														current_command: A string representing the current voice command to be processed

			Remember to process each command according to these guidelines, prioritizing accuracy and user intent.`,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: `current_selection: ${currentSelection}\ncommand_history: ${commandHistory}\ncurrent_command: ${utteredCommand}`
							}
						]
					}
				]
			})
		});

		const data = await response.json();
		await handleLLMResponse(data);
	} catch (error) {
		console.error('Error:', error);
		commandResult.textContent = `Error: ${error.message}`;
		playCommand.disabled = true;
	}
}

async function handleLLMResponse(data) {
	try {
		const responseData = JSON.parse(data.content[0].text);

		if (!responseData.error) {

			commandResult.value = `Command: ${responseData.corrected_command.trim()}`;
			selection.value = responseData.updated_selection;
			history.value = responseData.updated_command_history;

			playCommand.disabled = false;
			const commandText = responseData.corrected_command.trim();
			const utterance = new SpeechSynthesisUtterance(commandText);

			const voice = getSelectedVoice();
			if (voice) {
				utterance.voice = voice;
			}

			return new Promise((resolve) => {
				utterance.onend = function (event) {
					resolve();
					if (!isRecording) {
						record();
					}
				};
				speechSynthesis.speak(utterance);
			});
		}

		else {

			let suggestionsHTML = "Suggestions:" + responseData.suggested_commands.join(", ");
			commandResult.value = suggestionsHTML;

			playCommand.disabled = true;

			setTimeout(() => {
				if (!isRecording) {
					record();
				}
			}, 100);
		}
	} catch (error) {
		console.error("Error parsing LLM response:", error);
		commandResult.value = "Error processing the command. Please try again.";
		playCommand.disabled = true;

		setTimeout(() => {
			if (isRecording) {
				record();
			}
		}, 100);
	}
}

startRecording.onclick = () => {
	if (!isRecording) {
		record();
	} else {
		stopRecording();
	}
};

playCommand.onclick = () => {
	const commandText = commandResult.value.replace('Command: ', '');
	const utterance = new SpeechSynthesisUtterance(commandText);

	const voice = getSelectedVoice();
	if (voice) {
		utterance.voice = voice;
	}

	utterance.onend = function (event) {
		if (isRecording) {
			record();
		}
	};

	speechSynthesis.speak(utterance);
};

initializeSpeechRecognition();
populateVoiceList();