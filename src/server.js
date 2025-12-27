/**
 * Gemini Live Voice Chat Server
 * WebSocket proxy for real-time voice conversations with Gemini
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { createGeminiConnection } = require('./gemini-live');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3600;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_VOICE = process.env.DEFAULT_VOICE || 'Kore';

// Available Gemini voices
const VOICES = [
    'Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck', 'Zephyr',
    'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam',
    'Autonoe', 'Callirrhoe', 'Despina', 'Enceladus', 'Erinome',
    'Gacrux', 'Iapetus', 'Laomedeia', 'Leda', 'Orus',
    'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager',
    'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zubenelgenubi'
];

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// API endpoints
app.get('/api/config', (req, res) => {
    res.json({
        defaultVoice: DEFAULT_VOICE,
        voices: VOICES,
        hasApiKey: !!GEMINI_API_KEY
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'gemini-live' });
});

// WebSocket handling
wss.on('connection', (clientWs) => {
    console.log('Client connected');

    let geminiWs = null;
    let sessionConfig = null;

    clientWs.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());

            // Handle session start
            if (message.type === 'start') {
                sessionConfig = {
                    voice: message.voice || DEFAULT_VOICE,
                    systemPrompt: message.systemPrompt || 'You are a helpful assistant.'
                };

                console.log(`Starting session with voice: ${sessionConfig.voice}`);

                // Close existing connection if any
                if (geminiWs) {
                    geminiWs.close();
                }

                // Create new Gemini connection
                geminiWs = await createGeminiConnection(
                    GEMINI_API_KEY,
                    sessionConfig,
                    // On audio from Gemini
                    (audioData) => {
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                                type: 'audio',
                                data: audioData
                            }));
                        }
                    },
                    // On text from Gemini
                    (text) => {
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                                type: 'text',
                                data: text
                            }));
                        }
                    },
                    // On error
                    (error) => {
                        console.error('Gemini error:', error);
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                                type: 'error',
                                message: error
                            }));
                        }
                    },
                    // On close
                    () => {
                        console.log('Gemini connection closed');
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                                type: 'status',
                                status: 'disconnected'
                            }));
                        }
                    }
                );

                clientWs.send(JSON.stringify({
                    type: 'status',
                    status: 'connected'
                }));
            }

            // Handle audio from client
            if (message.type === 'audio' && geminiWs) {
                geminiWs.sendAudio(message.data);
            }

            // Handle video from client
            if (message.type === 'video' && geminiWs) {
                geminiWs.sendVideo(message.data);
            }

            // Handle stop
            if (message.type === 'stop') {
                if (geminiWs) {
                    geminiWs.close();
                    geminiWs = null;
                }
                clientWs.send(JSON.stringify({
                    type: 'status',
                    status: 'stopped'
                }));
            }

        } catch (error) {
            console.error('Error processing message:', error);
            clientWs.send(JSON.stringify({
                type: 'error',
                message: error.message
            }));
        }
    });

    clientWs.on('close', () => {
        console.log('Client disconnected');
        if (geminiWs) {
            geminiWs.close();
        }
    });

    clientWs.on('error', (error) => {
        console.error('Client WebSocket error:', error);
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Gemini Live server running at http://localhost:${PORT}`);
    if (!GEMINI_API_KEY) {
        console.warn('WARNING: GEMINI_API_KEY is not set!');
    }
});
