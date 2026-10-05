# Savi Backend

The backend for Savi is a high-performance REST API powered by [FastAPI](https://fastapi.tiangolo.com/). It handles everything required to drive the AI Voice Companion, including generative AI interviews, audio transcription, speech synthesis, and database state management.

## Key Responsibilities
- **Generative AI Integration:** Communicates with Google Gemini (`gemini-3.5-flash-lite`) to contextually generate interview questions, process candidate responses, and synthesize structured "AI Notes" (coaching feedback).
- **Speech-to-Text (STT):** Provides a fast transcription endpoint utilizing `faster-whisper` and in-memory PyAV decoding.
- **Text-to-Speech (TTS):** Uses the `Kokoro-82M-ONNX` engine to synthesize Savi's voice natively on CPU.
- **Session & State Management:** Handles CRUD operations for interview sessions, storing transcripts, attached resume documents, and metadata securely via SQLAlchemy.

## Environment Configuration
The backend requires certain environment variables. Create a `.env` file inside the `backend/` directory:

```env
# Required: Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key

# Optional STT/TTS Configuration
WHISPER_MODEL_SIZE=small
TTS_ENABLED=true
PORT=8000

# Optional Database overrides (defaults to local SQLite if unset)
DATABASE_URL=
DATABASE_AUTH_TOKEN=
```
> **Note:** Never commit `.env` containing real API keys or tokens.

## Local Development
The backend is built with Python 3.9+.

1. **Install Dependencies:**
   ```sh
   cd backend
   python -m pip install -r requirements.txt
   ```
2. **Start the API Server:**
   ```sh
   python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
   The backend will be available at `http://localhost:8000`. API documentation is automatically generated at `http://localhost:8000/docs`.

## Database Architecture
- **Local Development:** By default, the application provisions a standard local SQLite database (`voice_companion.db`) in the `backend/` directory.
- **Production (Serverless):** The backend uses the SQLAlchemy `libsql` dialect to connect to a remote Turso (libSQL) database. Configure `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in the production environment variables. Vercel serverless environments prohibit local embedded databases.

## Testing
The backend includes a comprehensive `pytest` and `unittest` suite. 
Install development requirements:
```sh
python -m pip install -r requirements-dev.txt
```

Run test suites:
```sh
python -m pytest -p no:cacheprovider
# Or run specific tests
python -m unittest test_transcription_storage test_database_api -v
```

## Documentation References
For detailed technical documentation on the Speech-to-Text and TTS deployment limitations (especially regarding Vercel serverless limits), see the [STT deployment policy](STT_DEPLOYMENT.md).
