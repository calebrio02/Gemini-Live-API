/**
 * Gemini Voice Chat - Frontend Application
 * Handles WebSocket connection, audio capture, playback, and visual interface
 */

class GeminiVoiceChat {
    constructor() {
        // DOM Elements
        this.talkButton = document.getElementById('talkButton');
        this.buttonText = document.getElementById('buttonText');
        this.cameraStartBtn = document.getElementById('cameraStartBtn');
        this.switchCameraBtn = document.getElementById('switchCameraBtn');
        this.toggleTranscriptBtn = document.getElementById('toggleTranscriptBtn');
        this.localVideo = document.getElementById('localVideo');
        this.videoCanvas = document.getElementById('videoCanvas');
        this.cameraPreview = document.getElementById('cameraPreview');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.visualizer = document.getElementById('visualizer');
        this.visualizerContainer = document.querySelector('.active-interaction-area');

        // Settings Elements
        this.settingsToggle = document.getElementById('settingsToggle');
        this.settingsPanel = document.getElementById('settingsPanel');
        this.closeSettings = document.getElementById('closeSettings');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.systemPrompt = document.getElementById('systemPrompt');

        // Chat Elements
        this.chatContainer = document.getElementById('chatContainer');
        this.transcriptVisible = true;

        // State
        this.isActive = false;
        this.isVideoActive = false;
        this.currentFacingMode = 'user'; // 'user' or 'environment'
        this.ws = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.videoStream = null;
        this.videoInterval = null;
        this.audioWorklet = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.nextPlayTime = 0;

        // Load config and setup
        this.init();
    }

    async init() {
        await this.loadConfig();
        this.setupEventListeners();
        this.loadSettings();
        this.setupSpeechRecognition();
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();

            config.voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice;
                option.textContent = voice;
                if (voice === config.defaultVoice) option.selected = true;
                this.voiceSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load config:', error);
            this.setStatus('error', 'Ready (Offline)');
        }
    }

    setupEventListeners() {
        this.talkButton.addEventListener('click', () => this.toggleConversation());
        this.cameraStartBtn.addEventListener('click', () => this.toggleCamera());
        this.switchCameraBtn.addEventListener('click', () => this.switchCamera());
        this.settingsToggle.addEventListener('click', () => this.toggleSettings(true));
        this.closeSettings.addEventListener('click', () => this.toggleSettings(false));
        this.settingsPanel.addEventListener('click', (e) => {
            if (e.target === this.settingsPanel) this.toggleSettings(false);
        });
        this.toggleTranscriptBtn.addEventListener('click', () => this.toggleTranscript());

        this.voiceSelect.addEventListener('change', () => this.saveSettings());
        this.systemPrompt.addEventListener('input', () => this.saveSettings());
    }

    setupSpeechRecognition() {
        // Disabled local recognition to prevent mobile beeping and conflicts.
        // We now rely on server-side transcription from Gemini.
        console.log("Local speech recognition disabled in favor of server-side to fix mobile experience.");
    }

    startRecognition() {
        // No-op
    }

    stopRecognition() {
        // No-op
    }

    loadSettings() {
        const saved = localStorage.getItem('gemini-voice-settings');
        if (saved) {
            const settings = JSON.parse(saved);
            if (settings.voice) this.voiceSelect.value = settings.voice;
            if (settings.systemPrompt) this.systemPrompt.value = settings.systemPrompt;
        }
        if (!this.systemPrompt.value) {
            this.systemPrompt.value = 'You are a helpful and friendly assistant. Keep your responses concise and natural.';
        }
    }

    saveSettings() {
        const settings = {
            voice: this.voiceSelect.value,
            systemPrompt: this.systemPrompt.value
        };
        localStorage.setItem('gemini-voice-settings', JSON.stringify(settings));
    }

    toggleSettings(show) {
        if (show) this.settingsPanel.classList.add('active');
        else this.settingsPanel.classList.remove('active');
    }

    setStatus(type, text) {
        this.statusDot.className = 'status-dot ' + type;
        this.statusText.textContent = text;
    }

    async toggleConversation() {
        if (this.isActive) {
            this.stopConversation();
        } else {
            await this.startConversation();
        }
    }

    async startConversation() {
        try {
            this.setStatus('', 'Connecting...');

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
            });

            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

            this.ws.onopen = () => {
                this.ws.send(JSON.stringify({
                    type: 'start',
                    voice: this.voiceSelect.value,
                    systemPrompt: this.systemPrompt.value
                }));
            };

            this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.setStatus('error', 'Connection error');
            };
            this.ws.onclose = () => {
                if (this.isActive) {
                    this.setStatus('error', 'Connection lost');
                    this.stopConversation();
                }
            };

        } catch (error) {
            console.error('Failed to start conversation:', error);
            this.setStatus('error', 'Failed to start');
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'status':
                if (message.status === 'connected') this.onConnected();
                else if (message.status === 'disconnected') this.stopConversation();
                break;
            case 'audio':
                this.playAudio(message.data);
                break;
            case 'text': // AI Transcript (from text part)
                // NOTE: If responseModalities=['AUDIO'], this text part is the transcript or thought.
                // We display it as AI message.
                if (message.data && message.data.trim().length > 0) {
                    this.addMessage(message.data, 'ai');
                }
                break;
            case 'user_transcript': // User Transcript from Server (New!)
                if (message.data && message.data.trim().length > 0) {
                    this.addMessage(message.data, 'user');
                }
                break;
            case 'error':
                this.setStatus('error', message.message);
                break;
        }
    }

    onConnected() {
        this.isActive = true;
        this.setStatus('connected', 'Connected');
        this.talkButton.classList.add('active');
        this.buttonText.textContent = 'End Chat';

        this.startAudioCapture();
        /* this.startRecognition(); // Disabled local recognition */

        if (this.isVideoActive) {
            this.startVideoTransmission();
        }
    }

    async startAudioCapture() {
        try {
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            await this.audioContext.audioWorklet.addModule('/js/audio-processor.js');
            this.audioWorklet = new AudioWorkletNode(this.audioContext, 'audio-processor');

            this.audioWorklet.port.onmessage = (event) => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const base64 = this.arrayBufferToBase64(event.data);
                    this.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
                }
            };

            source.connect(this.audioWorklet);
        } catch (error) {
            console.error('Audio worklet failed, falling back...');
        }
    }

    async toggleCamera() {
        if (this.isVideoActive) this.stopCamera();
        else await this.startCamera();
    }

    async startCamera() {
        try {
            const constraints = {
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: this.currentFacingMode }
            };
            this.videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localVideo.srcObject = this.videoStream;
            this.isVideoActive = true;
            this.cameraStartBtn.classList.add('active');
            this.cameraPreview.classList.add('active');
            this.switchCameraBtn.style.display = 'flex';

            if (this.isActive) this.startVideoTransmission();
        } catch (error) {
            console.error('Camera access failed:', error);
        }
    }

    async switchCamera() {
        if (!this.isVideoActive) return;
        this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
        if (this.videoStream) this.videoStream.getTracks().forEach(track => track.stop());
        await this.startCamera();

        if (this.currentFacingMode === 'user') this.localVideo.style.transform = 'scaleX(-1)';
        else this.localVideo.style.transform = 'none';
    }

    stopCamera() {
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }
        if (this.videoInterval) clearInterval(this.videoInterval);

        this.localVideo.srcObject = null;
        this.isVideoActive = false;
        this.cameraStartBtn.classList.remove('active');
        this.cameraPreview.classList.remove('active');
        this.switchCameraBtn.style.display = 'none';
    }

    startVideoTransmission() {
        if (this.videoInterval) clearInterval(this.videoInterval);
        this.videoInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isVideoActive) {
                this.sendVideoFrame();
            }
        }, 1000);
    }

    sendVideoFrame() {
        const context = this.videoCanvas.getContext('2d');
        const video = this.localVideo;
        if (video.videoWidth === 0) return;

        this.videoCanvas.width = video.videoWidth;
        this.videoCanvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, this.videoCanvas.width, this.videoCanvas.height);

        const base64Data = this.videoCanvas.toDataURL('image/jpeg', 0.5);
        this.ws.send(JSON.stringify({ type: 'video', data: base64Data.split(',')[1] }));
    }

    // Chat UI Methods
    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.textContent = text;
        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    toggleTranscript() {
        this.transcriptVisible = !this.transcriptVisible;
        const chatContainer = document.getElementById('chatContainer');

        if (this.transcriptVisible) {
            chatContainer.style.display = 'flex';
            this.scrollToBottom();
            this.toggleTranscriptBtn.classList.add('active');
        } else {
            chatContainer.style.display = 'none';
            this.toggleTranscriptBtn.classList.remove('active');
        }
    }

    // Audio Helpers
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    async playAudio(base64Data) {
        this.setStatus('speaking', 'Gemini speaking...');
        this.visualizerContainer.classList.add('active'); // Show visualizer in center

        try {
            const pcmData = this.base64ToArrayBuffer(base64Data);
            const int16View = new Int16Array(pcmData);
            const float32Data = new Float32Array(int16View.length);
            for (let i = 0; i < int16View.length; i++) float32Data[i] = int16View[i] / 32768.0;

            const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
            audioBuffer.getChannelData(0).set(float32Data);
            this.scheduleAudioBuffer(audioBuffer);
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    }

    scheduleAudioBuffer(audioBuffer) {
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        if (!this.nextPlayTime || this.nextPlayTime < this.audioContext.currentTime) {
            this.nextPlayTime = this.audioContext.currentTime;
        }
        source.start(this.nextPlayTime);
        this.nextPlayTime += audioBuffer.duration;

        source.onended = () => {
            if (this.audioContext && this.audioContext.currentTime >= this.nextPlayTime - 0.1) {
                this.setStatus('connected', 'Listening...');
                this.visualizerContainer.classList.remove('active');
            }
        };
    }

    stopConversation() {
        this.isActive = false;
        this.setStatus('', 'Ready');
        this.talkButton.classList.remove('active');
        this.buttonText.textContent = 'Start Chat';
        this.visualizerContainer.classList.remove('active');

        if (this.ws) {
            this.ws.send(JSON.stringify({ type: 'stop' }));
            this.ws.close();
            this.ws = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        this.stopCamera();

        // Disabled local recognition cleanup
        // this.stopRecognition();

        if (this.audioContext) {
            this.audioContext.close();
        }

        this.nextPlayTime = 0;
    }
}

document.addEventListener('DOMContentLoaded', () => new GeminiVoiceChat());
