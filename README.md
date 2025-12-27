# Gemini Voice Chat

Real-time voice conversations with Google Gemini using native audio.

## ✨ Features

- 🎙️ **Real-time voice chat** - Natural conversations with barge-in support
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
- Microphone

## 💡 Usage Tips

1. Click "Start Conversation" to begin
2. Allow microphone access when prompted
3. Speak naturally - Gemini will respond with voice
4. Change voice or system prompt in Settings (changes apply on next start)
5. Click "End Conversation" when done

## 📄 License

MIT
