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
                        responseModalities: ['AUDIO'],
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
                    }
                }
            };

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

                // Handle server content (audio response)
                if (message.serverContent) {
                    const parts = message.serverContent.modelTurn?.parts || [];

                    for (const part of parts) {
                        if (part.inlineData) {
                            // Audio data
                            onAudio(part.inlineData.data);
                        }
                        if (part.text) {
                            // Text response
                            onText(part.text);
                        }
                    }

                    // Check if turn is complete
                    if (message.serverContent.turnComplete) {
                        console.log('Gemini turn complete');
                    }
                }

                // Handle tool calls (if any)
                if (message.toolCall) {
                    console.log('Tool call received:', message.toolCall);
                }

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
