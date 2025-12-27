/**
 * Gemini Voice Chat - Frontend Application
 * Handles WebSocket connection, audio capture, and playback
 */

class GeminiVoiceChat {
    constructor() {
        // DOM Elements
        this.talkButton = document.getElementById('talkButton');
        this.buttonText = document.getElementById('buttonText');
        this.cameraStartBtn = document.getElementById('cameraStartBtn');
        this.switchCameraBtn = document.getElementById('switchCameraBtn');
        this.localVideo = document.getElementById('localVideo');
        this.videoCanvas = document.getElementById('videoCanvas');
        this.cameraPreview = document.getElementById('cameraPreview');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.visualizer = document.getElementById('visualizer');
        this.aiAvatar = document.getElementById('aiAvatar');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.systemPrompt = document.getElementById('systemPrompt');
        this.settingsToggle = document.getElementById('settingsToggle');
        this.settingsContent = document.getElementById('settingsContent');
        this.transcript = document.getElementById('transcript');
        this.transcriptContent = document.getElementById('transcriptContent');

        // State
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
        // Load configuration
        await this.loadConfig();

        // Setup event listeners
        this.setupEventListeners();

        // Load saved settings
        this.loadSettings();
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();

            // Populate voice select
            config.voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice;
                option.textContent = voice;
                if (voice === config.defaultVoice) {
                    option.selected = true;
                }
                this.voiceSelect.appendChild(option);
            });

            if (!config.hasApiKey) {
                this.setStatus('error', 'API key not configured');
            }
        } catch (error) {
            console.error('Failed to load config:', error);
            this.setStatus('error', 'Failed to connect to server');
        }
    }

    setupEventListeners() {
        this.talkButton.addEventListener('click', () => this.toggleConversation());
        this.cameraStartBtn.addEventListener('click', () => this.toggleCamera());
        this.switchCameraBtn.addEventListener('click', () => this.switchCamera());
        this.settingsToggle.addEventListener('click', () => this.toggleSettings());

        // Save settings on change
        this.voiceSelect.addEventListener('change', () => this.saveSettings());
        this.systemPrompt.addEventListener('input', () => this.saveSettings());
    }

    loadSettings() {
        const saved = localStorage.getItem('gemini-voice-settings');
        if (saved) {
            const settings = JSON.parse(saved);
            if (settings.voice) {
                this.voiceSelect.value = settings.voice;
            }
            if (settings.systemPrompt) {
                this.systemPrompt.value = settings.systemPrompt;
            }
        }

        // Set default system prompt if empty
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

    toggleSettings() {
        this.settingsContent.classList.toggle('open');
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

            // Initialize audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000 // Gemini output sample rate
            });

            // Get microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            // Create WebSocket connection
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

            this.ws.onopen = () => {
                // Send start message with config
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
            this.setStatus('error', error.message || 'Failed to start');
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'status':
                if (message.status === 'connected') {
                    this.onConnected();
                } else if (message.status === 'disconnected' || message.status === 'stopped') {
                    this.stopConversation();
                }
                break;

            case 'audio':
                this.playAudio(message.data);
                break;

            case 'text':
                this.showTranscript(message.data);
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
        this.buttonText.textContent = 'End Conversation';

        // Start capturing audio
        this.startAudioCapture();

        // Start capturing video if active
        if (this.isVideoActive) {
            this.startVideoTransmission();
        }
    }

    async startAudioCapture() {
        try {
            // Create audio source from microphone
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Load audio worklet for processing
            await this.audioContext.audioWorklet.addModule('/js/audio-processor.js');

            this.audioWorklet = new AudioWorkletNode(this.audioContext, 'audio-processor');

            this.audioWorklet.port.onmessage = (event) => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    // Send audio data as base64
                    const base64 = this.arrayBufferToBase64(event.data);
                    this.ws.send(JSON.stringify({
                        type: 'audio',
                        data: base64
                    }));
                }
            };

            source.connect(this.audioWorklet);
            // Don't connect to destination to avoid feedback

        } catch (error) {
            console.error('Failed to start audio capture:', error);
            // Fallback: Use ScriptProcessorNode (deprecated but widely supported)
            this.startAudioCaptureFallback();
        }
    }

    async toggleCamera() {
        if (this.isVideoActive) {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }

    async startCamera() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: this.currentFacingMode
                }
            };

            this.videoStream = await navigator.mediaDevices.getUserMedia(constraints);

            this.localVideo.srcObject = this.videoStream;
            this.isVideoActive = true;
            this.cameraStartBtn.classList.add('active');
            this.cameraPreview.classList.add('active');

            // Show switch button if we have multiple cameras or just always show it on mobile
            // For simplicity, we'll show it whenever camera is active
            this.switchCameraBtn.style.display = 'flex';

            // Start sending frames if we are connected
            if (this.isActive) {
                this.startVideoTransmission();
            }

        } catch (error) {
            console.error('Failed to access camera:', error);
            this.setStatus('error', 'Camera access failed');
        }
    }

    async switchCamera() {
        if (!this.isVideoActive) return;

        // Toggle facing mode
        this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';

        // Stop current stream
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
        }

        // Restart with new facing mode
        await this.startCamera();

        // Update mirror effect (mirror only for user facing)
        if (this.currentFacingMode === 'user') {
            this.localVideo.style.transform = 'scaleX(-1)';
        } else {
            this.localVideo.style.transform = 'none';
        }
    }

    stopCamera() {
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }

        if (this.videoInterval) {
            clearInterval(this.videoInterval);
            this.videoInterval = null;
        }

        this.localVideo.srcObject = null;
        this.isVideoActive = false;
        this.cameraStartBtn.classList.remove('active');
        this.cameraPreview.classList.remove('active');
        this.switchCameraBtn.style.display = 'none';
    }

    startVideoTransmission() {
        if (this.videoInterval) clearInterval(this.videoInterval);

        // Send frames every 1000ms (1 FPS)
        this.videoInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isVideoActive) {
                this.sendVideoFrame();
            }
        }, 1000);
    }

    sendVideoFrame() {
        const context = this.videoCanvas.getContext('2d');
        const video = this.localVideo;

        if (video.videoWidth === 0 || video.videoHeight === 0) return;

        // Resize canvas to match video
        this.videoCanvas.width = video.videoWidth;
        this.videoCanvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0, this.videoCanvas.width, this.videoCanvas.height);

        // Convert to output JPEG
        const base64Data = this.videoCanvas.toDataURL('image/jpeg', 0.5);
        const data = base64Data.split(',')[1]; // Remove header

        this.ws.send(JSON.stringify({
            type: 'video',
            data: data
        }));
    }

    startAudioCaptureFallback() {
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (event) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const inputData = event.inputBuffer.getChannelData(0);

                // Resample to 16kHz and convert to 16-bit PCM
                const resampledData = this.resample(inputData, this.audioContext.sampleRate, 16000);
                const pcmData = this.floatTo16BitPCM(resampledData);

                const base64 = this.arrayBufferToBase64(pcmData.buffer);
                this.ws.send(JSON.stringify({
                    type: 'audio',
                    data: base64
                }));
            }
        };

        source.connect(processor);
        processor.connect(this.audioContext.destination);

        // Store for cleanup
        this.scriptProcessor = processor;
        this.audioSource = source;
    }

    resample(inputData, inputSampleRate, outputSampleRate) {
        const ratio = inputSampleRate / outputSampleRate;
        const outputLength = Math.round(inputData.length / ratio);
        const output = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
            const t = srcIndex - srcIndexFloor;
            output[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t;
        }

        return output;
    }

    floatTo16BitPCM(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async playAudio(base64Data) {
        // Show speaking state
        this.aiAvatar.classList.add('speaking');
        this.visualizer.classList.add('active');
        this.setStatus('speaking', 'Gemini is speaking...');

        try {
            // Decode base64 to PCM
            const pcmData = this.base64ToArrayBuffer(base64Data);

            // Convert 16-bit PCM to Float32 for Web Audio
            const int16View = new Int16Array(pcmData);
            const float32Data = new Float32Array(int16View.length);

            for (let i = 0; i < int16View.length; i++) {
                float32Data[i] = int16View[i] / 32768.0;
            }

            // Create audio buffer (24kHz mono)
            const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
            audioBuffer.getChannelData(0).set(float32Data);

            // Schedule for continuous playback
            this.scheduleAudioBuffer(audioBuffer);

        } catch (error) {
            console.error('Error playing audio:', error);
        }
    }

    scheduleAudioBuffer(audioBuffer) {
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Initialize nextPlayTime if not set
        if (!this.nextPlayTime || this.nextPlayTime < this.audioContext.currentTime) {
            this.nextPlayTime = this.audioContext.currentTime;
        }

        // Schedule to play at the next available time
        source.start(this.nextPlayTime);

        // Update next play time to after this buffer ends
        this.nextPlayTime += audioBuffer.duration;

        // Track that we're playing
        this.isPlaying = true;

        source.onended = () => {
            // Check if we're done playing all audio
            if (this.audioContext && this.audioContext.currentTime >= this.nextPlayTime - 0.1) {
                this.isPlaying = false;
                this.aiAvatar.classList.remove('speaking');
                this.visualizer.classList.remove('active');
                if (this.isActive) {
                    this.setStatus('connected', 'Listening...');
                }
            }
        };
    }

    showTranscript(text) {
        this.transcript.classList.add('visible');
        this.transcriptContent.innerHTML += `<span class="ai">${text}</span> `;
        this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;
    }

    stopConversation() {
        this.isActive = false;
        this.setStatus('', 'Ready');
        this.talkButton.classList.remove('active');
        this.buttonText.textContent = 'Start Conversation';
        this.aiAvatar.classList.remove('speaking');
        this.visualizer.classList.remove('active');

        // Close WebSocket
        if (this.ws) {
            this.ws.send(JSON.stringify({ type: 'stop' }));
            this.ws.close();
            this.ws = null;
        }

        // Stop media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Stop camera
        this.stopCamera();

        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        // Clear audio queue
        this.audioQueue = [];
        this.isPlaying = false;
        this.nextPlayTime = 0;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new GeminiVoiceChat();
});
