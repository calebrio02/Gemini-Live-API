# Gemini Voice Chat

Real-time voice conversations with Google Gemini using native audio.

## ✨ Features

- 🎙️ **Real-time voice chat** - Natural conversations with barge-in support
- 📹 **Multimodal Video** - Share your camera feed with Gemini for vision analysis
- 📸 **Camera Switching** - Support for front/back cameras on mobile devices
- 🔊 **30 HD voices** - Choose from Gemini's voice options
- 📝 **Editable system prompt** - Change AI personality from the UI
- 🐳 **Docker ready** - Easy deployment

## 🚀 Quick Start

### 1. Configure API Key

Create `.env` file:
```bash
GEMINI_API_KEY=your-api-key-here
```

### 2. Start with Docker

```bash
docker-compose up --build
```

### 3. Open in Browser

Navigate to `http://localhost:3600`

> ⚠️ **IMPORTANT: HTTPS Requirement**
> 
> To use the microphone and camera from a device other than your local computer (e.g., your phone on the same Wi-Fi), **you need a Secure Context (HTTPS)**.
> 
> Browsers block media access on `http://` unless it is `localhost`.
> 
> **Workarounds for Local Testing:**
> 1.  **Use Localhost**: Access only from the computer running the server.
> 2.  **Chrome Flags (Android/Desktop)**:
>     -   Go to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
>     -   Enable it and add your server IP: `http://192.168.1.X:3600`
> 3.  **Tunneling**: Use a tool like `ngrok` or `cloudflared` to get a temporary HTTPS URL.

## ⚙️ Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Gemini API key | Required |
| `PORT` | Server port | `3600` |
| `DEFAULT_VOICE` | Default voice | `Kore` |

## 🎤 Available Voices

Aoede, Charon, Fenrir, Kore, Puck, Zephyr, Achernar, Achird, Algenib, Algieba, Alnilam, Autonoe, Callirrhoe, Despina, Enceladus, Erinome, Gacrux, Iapetus, Laomedeia, Leda, Orus, Pulcherrima, Rasalgethi, Sadachbia, Sadaltager, Schedar, Sulafat, Umbriel, Vindemiatrix, Zubenelgenubi

## 📋 Requirements

- Docker
- Gemini API Key with access to native audio models
- Modern browser (Chrome/Edge recommended)
- Microphone & Camera

## 💡 Usage Tips

1. Click "Start Conversation" to begin
2. Allow microphone access when prompted
3. **Toggle Camera**: Click the camera icon to enable video vision
4. **Switch Camera**: On mobile, use the rotate button to switch between front/back cameras
5. Speak naturally - Gemini will respond with voice
6. Change voice or system prompt in Settings (changes apply on next start)

## 📄 License

MIT
