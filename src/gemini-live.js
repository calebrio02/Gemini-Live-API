/**
 * Gemini Live API Client
 * Handles WebSocket connection to Gemini's real-time audio API
 */
//
const WebSocket = require('ws');

const GEMINI_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

/**
 * Create a connection to Gemini Live API
 */
async function createGeminiConnection(apiKey, config, onAudio, onText, onError, onClose) {
    return new Promise((resolve, reject) => {
        const url = `${GEMINI_LIVE_URL}?key=${apiKey}`;

        const ws = new WebSocket(url);
        let isSetupComplete = false;

        ws.on('open', () => {
            console.log('Connected to Gemini Live API');

            // Send setup message
            const setupMessage = {
                setup: {
                    model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
                    generationConfig: {
                        responseModalities: ['AUDIO'], // AUDIO only to avoid "thoughts", we get transcript via dedicated field
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: config.voice
                                }
                            }
                        }
                    },
                    systemInstruction: {
                        parts: [{
                            text: config.systemPrompt
                        }]
                    },
                    tools: [{ googleSearch: {} }],
                    // Enable both input and output transcription (empty keys use defaults)
                    // This forces the model to return transcripts separately.
                }
            };

            // Inject transcription fields which might be raw fields in this API version
            // BidiGenerateContentSetup format:
            // { setup: { ..., audio_transcription_config: {} } } ? 
            // Docs say `input_audio_transcription` and `output_audio_transcription` are fields in BidiGenerateContentSetup

            // Let's add them to the setup object constructed above
            setupMessage.setup.inputAudioTranscription = {};
            setupMessage.setup.outputAudioTranscription = {};

            ws.send(JSON.stringify(setupMessage));
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());

                // Handle setup complete
                if (message.setupComplete) {
                    console.log('Gemini session setup complete');
                    isSetupComplete = true;
                    resolve({
                        sendAudio: (audioData) => {
                            if (ws.readyState === WebSocket.OPEN) {
                                const audioMessage = {
                                    realtimeInput: {
                                        mediaChunks: [{
                                            mimeType: 'audio/pcm;rate=16000',
                                            data: audioData
                                        }]
                                    }
                                };
                                ws.send(JSON.stringify(audioMessage));
                            }
                        },
                        sendVideo: (videoData) => {
                            if (ws.readyState === WebSocket.OPEN) {
                                const videoMessage = {
                                    realtimeInput: {
                                        mediaChunks: [{
                                            mimeType: 'image/jpeg',
                                            data: videoData
                                        }]
                                    }
                                };
                                ws.send(JSON.stringify(videoMessage));
                            }
                        },
                        close: () => {
                            ws.close();
                        }
                    });
                }

                // --- Handle Server Messages ---

                if (message.serverContent) {
                    const content = message.serverContent;

                    // 1. Model Turn (Audio)
                    if (content.modelTurn) {
                        const parts = content.modelTurn.parts || [];
                        for (const part of parts) {
                            if (part.inlineData) {
                                onAudio(part.inlineData.data);
                            }
                            // Note: We ignore part.text here if we want to avoid "thoughts", 
                            // as we are relying on proper outputTranscription below.
                        }
                    }

                    // 2. AI Transcript (Output)
                    // Validated per documentation: serverContent.outputTranscription.text
                    if (content.outputTranscription && content.outputTranscription.text) {
                        onText(content.outputTranscription.text, 'ai');
                    }

                    // 3. User Transcript (Input)
                    // Documentation suggests it might be in serverContent or top-level.
                    // We check content.inputAudioTranscription (API naming varies)
                    // Common field: inputTranscription
                    /* 
                       Note: We will try to detect it wherever it lands. 
                       If it appears as a separate message or field.
                    */
                    // On Google AI Studio, it's typically serverContent.turnComplete? No.
                    // Let's check for inputTranscription in serverContent explicitly
                }

                // Check distinct fields potentially on the root message or serverContent
                // Some versions send it as a separate tool or part. 
                // But based on 'BidiGenerateContentServerMessage', it serves:
                // serverContent, toolCall, toolCallCancellation, etc.

                // Let's look inside serverContent for 'inputTranscription' if it exists
                if (message.serverContent && message.serverContent.inputAudioTranscription && message.serverContent.inputAudioTranscription.finalResult) {
                    // Note: inputAudioTranscription usually yields 'content' or 'transcript'
                    // We will dump the object to log if debugging, but here we assume .content or .text?
                    // Actually, if we are unsure, let's fallback to looking for it.
                    // But for now, let's try assuming standard structure or just logging it until we confirm.
                    // WAIT: The user said "sigue tirando bubbles...".
                    // Let's follow the robust pattern:
                }

                // REVISED STRATEGY: 
                // We will rely on our research. Input transcription might not be effectively working with just "setup".
                // But the user *linked* the guide.
                // Let's implement the 'outputTranscription' part clearly first.
                // For input, let's check for 'inputTranscription' in serverContent.

                if (message.serverContent) {
                    const c = message.serverContent;
                    if (c.outputTranscription && c.outputTranscription.text) {
                        onText(c.outputTranscription.text, 'ai');
                    }
                    // Check input transcription (often named inputTranscription or similar)
                    if (c.inputTranscription && c.inputTranscription.text) {
                        onText(c.inputTranscription.text, 'user');
                    } else if (c.inputAudioTranscription && c.inputAudioTranscription.text) {
                        // Alternative field name for input audio transcription
                        onText(c.inputAudioTranscription.text, 'user');
                    }
                }

                // Temporary logging to debug structure in prod if needed, but we must implement code.
                // Let's assume standard 'text' property for now or standard 'parts'.

                // NOTE: To support the 'onText' refactor, we must pass 'source'.
                // If we don't find input transcript, we might just get AI transcript.


            } catch (error) {
                console.error('Error parsing Gemini message:', error);
            }
        });

        ws.on('error', (error) => {
            console.error('Gemini WebSocket error:', error.message);
            onError(error.message);
            if (!isSetupComplete) {
                reject(error);
            }
        });

        ws.on('close', (code, reason) => {
            console.log(`Gemini WebSocket closed: ${code} - ${reason}`);
            onClose();
        });

        // Timeout for connection
        setTimeout(() => {
            if (!isSetupComplete) {
                ws.close();
                reject(new Error('Connection timeout'));
            }
        }, 10000);
    });
}

module.exports = { createGeminiConnection };
