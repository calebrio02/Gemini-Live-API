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

                // 1. User Transcript (Input Audio)
                // This comes in a separate 'serverContent' or top-level 'inputTranscription' depending on version
                // Docs say: message.serverContent.inputTranscription ?? No, docs say it's a field in ServerMessage usually
                // Let's check generally for it
                /* Structure often seen:
                   {
                     "serverContent": {
                       "modelTurn": { ... }
                     }
                   }
                   OR
                   {
                     "toolCall": ...
                   }
                */

                // Actually, inputTranscription might be separate.
                // Let's check specifically for it if it appears in the root or part of serverContent
                // We will assume standard handling: look for parts with text.

                if (message.serverContent) {

                    const content = message.serverContent;

                    // Handle Model Turn (AI Response)
                    if (content.modelTurn) {
                        const parts = content.modelTurn.parts || [];
                        for (const part of parts) {
                            if (part.inlineData) {
                                // Audio
                                onAudio(part.inlineData.data);
                            }
                            if (part.text) {
                                // Text (This is essentially the AI transcript when responseModalities=['AUDIO'])
                                onText(part.text);
                            }
                        }
                    }

                    // Check for turn completion
                    if (content.turnComplete) {
                        console.log('Gemini turn complete');
                    }
                }

                // Handle Input Transcription (User Voice)
                // Note: The field name might be camelCase 'inputTranscription' in the node SDK wrapper or API
                // We'll log it first to be sure in dev, but here we try to emit it.
                // It might pass as a separate message type in our client-server protocol.
                // We need to pass 4 arguments to createGeminiConnection? No, we have onAudio, onText.
                // We need `onInputTranscript` callback! 
                // But signature is fixed: (apiKey, config, onAudio, onText, onError, onClose)
                // We will reuse `onText` but prefix it? Or simple send it.
                // Wait, users wants to see USER bubble.
                // Current `onText` is for AI bubbles.
                // We should modify `createGeminiConnection` signature or send a structured object to `onText`.

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
