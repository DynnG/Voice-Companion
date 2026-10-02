# Pal Voice Companion — STT Backend (faster-whisper)

Vercel STT deployment policy and disk investigation: see
[STT_DEPLOYMENT.md](STT_DEPLOYMENT.md). Vercel never preloads or downloads local
Whisper weights; configure `STT_SERVICE_URL` for dedicated inference. Local
Whisper behavior is preserved, including optional startup preload.

A high-performance Speech-to-Text (STT) backend service powered by [FastAPI](https://fastapi.tiangolo.com/) and [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (CTranslate2-optimized Whisper engine) designed for interview dialogue recognition.

---

## Key Capabilities & Optimizations

- **Engine**: `faster-whisper` (CTranslate2 INT8 quantization on CPU).
- **Default Model**: `"small"` (`beam_size=1`) for high vocabulary accuracy across interview terms (`"mock interview"`, `"Computer Science student"`, `"Software Developer"`, `"React"`, `"Node.js"`, `"backend APIs"`).
- **In-Memory Audio Decoding**: Uses PyAV directly on buffered audio streams in RAM, eliminating temporary disk file locks and race conditions.
- **Robust WebM & Audio Validation**: Validates stream headers and container integrity, returning clear HTTP `400 Bad Request` messages on corrupt/empty recordings instead of unhandled `500` server errors.
- **Stage-by-Stage Latency Metrics**: Measures and reports `upload_write_ms`, `audio_decode_ms`, `inference_ms`, and `total_processing_ms`.
- **English-Optimized Pipeline**: Explicitly defaults to `language="en"` to skip unnecessary language identification passes, and sets `condition_on_previous_text=False` to eliminate multi-segment latency penalties.

---

## Configuration (Environment Variables)

| Variable | Default | Options | Description |
| :--- | :--- | :--- | :--- |
| `WHISPER_MODEL_SIZE` | `small` | `tiny`, `base`, `small`, `medium`, `large-v3` | Whisper model size |
| `WHISPER_DEVICE` | `cpu` | `cpu`, `cuda` | Inference device |
| `WHISPER_COMPUTE_TYPE` | `int8` | `int8`, `float16`, `float32` | Weight quantization type |
| `WHISPER_BEAM_SIZE` | `1` | `1`, `2`, `5` | Beam search size (1 = greedy, lowest latency) |
| `WHISPER_LANGUAGE` | `en` | `en`, `es`, `fr`, etc. | Target language (avoids language ID overhead) |
| `WHISPER_CPU_THREADS` | `4` | Integer | CPU thread allocation |
| `WHISPER_VAD_FILTER` | `false` | `true`, `false` | Silero Voice Activity Detection filter |
| `WHISPER_CONDITION_ON_PREV` | `false` | `true`, `false` | Text conditioning across segments |
| `TTS_ENABLED` | `true` | `true`, `false` | Enable/disable Kokoro ONNX TTS engine |
| `KOKORO_MODEL` | `onnx-community/Kokoro-82M-v1.0-ONNX` | Model identifier | ONNX model source |
| `KOKORO_VOICE` | `af_bella` | 54 available voices | Default voice for interview responses |
| `KOKORO_MODEL_PATH` | *(auto)* | File path | Optional custom path to `.onnx` file |
| `KOKORO_VOICES_PATH` | *(auto)* | File path | Optional custom path to `voices.bin` |
| `PORT` | `8000` | Integer | Server port |

---

## API Reference

### 1. Health Check
- **Endpoint**: `GET /health` or `GET /`
- **Response**:
```json
{
  "status": "healthy",
  "service": "faster-whisper-stt",
  "model": "small",
  "device": "cpu",
  "compute_type": "int8",
  "beam_size": 1,
  "language": "en"
}
```

---

### 2. Transcribe Audio
- **Endpoint**: `POST /transcribe`
- **Content-Type**: `multipart/form-data`
- **Parameters**:
  - `file` (*required*, binary audio file: `.webm`, `.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`)
  - `language` (*optional*, default: `"en"`)
  - `beam_size` (*optional*, integer override)
- **Response**:
```json
{
  "text": "I am ready for the mock interview.",
  "language": "en",
  "language_probability": 1.0,
  "duration": 2.54,
  "processing_time_ms": 29140.68,
  "inference_time_ms": 28517.71,
  "timings": {
    "upload_write_ms": 0.18,
    "audio_decode_ms": 622.79,
    "inference_ms": 28517.71,
    "total_processing_ms": 29140.68
  },
  "model": "small",
  "segments": [
    {
      "id": 1,
      "start": 0.0,
      "end": 2.54,
      "text": "I am ready for the mock interview."
    }
  ]
}
```

---

### 3. Text-to-Speech (Kokoro-82M ONNX)
- **Endpoint**: `POST /tts`
- **Content-Type**: `application/json`
- **Request Body**:
```json
{
  "text": "Hello, welcome to your mock interview.",
  "voice": "af_bella",
  "speed": 1.0
}
```
- **Response**: `200 OK` with binary `audio/wav` (24kHz 16-bit PCM WAV) for direct browser playback.

### 4. TTS Status
- **Endpoint**: `GET /tts/status`
- **Response**:
```json
{
  "enabled": true,
  "loaded": true,
  "default_voice": "af_bella",
  "model": "onnx-community/Kokoro-82M-v1.0-ONNX",
  "available_voices": ["af_bella", "af_heart", "af_sarah", "..."],
  "error": null
}
```

---

## Running Benchmarks and Tests

```powershell
# Run comprehensive Kokoro ONNX TTS verification suite
& backend\.venv\Scripts\python.exe backend\test_kokoro_tts.py

# Run comprehensive pipeline latency, reliability & accuracy test suite
& backend\.venv\Scripts\python.exe backend\test_pipeline.py

# Run accuracy benchmark across models & beam sizes
& backend\.venv\Scripts\python.exe backend\accuracy_benchmark.py

# Run standard endpoint tests
& backend\.venv\Scripts\python.exe backend\test_stt.py
```

### Transcription storage in serverless production

The Speak button posts multipart audio to `/api/transcribe` (also available at
`/transcribe`). PyAV decodes uploaded bytes in memory and faster-whisper receives
a NumPy array; neither step creates an audio file in the project directory.

`runtime_storage.py` runs before multipart/speech-library imports. On Vercel,
Python upload spooling and Hugging Face model, tokenizer and Xet caches are
redirected beneath `/tmp/savi-transcription`, regardless of a project-relative
TMPDIR. Elsewhere the platform temporary directory is used. Whisper also gets
an explicit download_root so its model downloads cannot fall back to a home or
project cache. UploadFile is closed in a finally block immediately after reading,
removing any spilled audio even on failed requests. Model caches intentionally
remain for warm invocation reuse; they are ephemeral, not candidate audio.

Filesystem audit: Starlette uses SpooledTemporaryFile for multipart audio;
PyAV uses BytesIO; faster-whisper's download_model uses Hugging Face
snapshot_download; a missing tokenizer can cause Tokenizer.from_pretrained to
download to the configured Hugging Face cache. VAD reads bundled model assets.

Serverless runtime paths:

| Runtime output | Vercel path | Local development |
| --- | --- | --- |
| Audio/document upload spools | /tmp/savi-transcription | OS temporary directory/savi-transcription |
| Whisper, tokenizer, Hugging Face/Xet caches | /tmp/savi-transcription/huggingface | OS temporary directory/savi-transcription/huggingface |
| Generic XDG cache | /tmp/savi-transcription/cache | OS temporary directory/savi-transcription/cache |
| Kokoro downloaded model | /tmp/savi-kokoro/kokoro-v1.0.int8.onnx | OS temporary directory/savi-kokoro/kokoro-v1.0.int8.onnx |
| Kokoro downloaded voices | /tmp/savi-kokoro/voices-v1.0.bin | OS temporary directory/savi-kokoro/voices-v1.0.bin |
| Database records | Remote hosted Turso/libSQL (no local replica) | backend/voice_companion.db when DATABASE_URL is unset |

Kokoro checks configured paths and bundled backend/models/kokoro and kokoro_hf
files as read-only inputs. It never creates or modifies those directories.
Missing files download to unique .part files in savi-kokoro, publish atomically
only on success, and delete partial files on failure. Completed model files remain
for warm reuse. There are no model extraction steps. ONNX Runtime, tokenizers and
espeak-ng read bundled assets; synthesized WAV data remains in BytesIO.
Both audio and document UploadFiles are closed after reading. SQLite temp tables
use memory, SQLITE_TMPDIR points to transcription scratch storage, and SQLite
journals stay beside the database in local development; Vercel uses remote-only libSQL. Python bytecode writes are disabled on Vercel.
Environment files are only read. Logging uses stderr, not project log files.

IMPORTANT: /tmp is ephemeral and instance-local; it contains upload spools and
model caches only. Production session/document/message records use hosted Turso.
No /tmp SQLite fallback or embedded replica is allowed on Vercel. Local SQLite
remains available outside Vercel. Existing local records are not automatically
copied, deleted or migrated. Back up/import them separately if they must be retained.

Remaining operational risks: downloaded models/caches share Vercel's 500 MB /tmp
allowance. Verify model size, cold-start time, memory, native Linux dependencies,
database network access and credential expiry in the deployed environment.
Python's automatic import bytecode writes should also be disabled before startup
with PYTHONDONTWRITEBYTECODE=1 in Vercel. The backend additionally disables them
when configuring runtime storage. The developer-only benchmark_models.py can
download backend/test_sample_jfk.flac; it is not imported by or run in the API.
No vector store, original-document directory, long-term audio file store, generated
report directory or project log file exists in the serving path.

Regression checks (from backend):
`python -m unittest test_transcription_storage -v`
`python test_hesitation_pauses.py`

Additional path regressions: `python -m unittest test_serverless_storage -v`

### Persistent Turso database setup on Vercel

1. Create a **libSQL** database in Turso (compatible with the SQLAlchemy libSQL
   dialect). For example: `turso db create savi`.
2. Get the URL with `turso db show --url savi` and create an authentication token
   with `turso db tokens create savi`. Keep the token private.
3. In Vercel Project → Settings → Environment Variables, set:

   - DATABASE_URL: the libsql://your-database.turso.io URL, without a token/query.
   - DATABASE_AUTH_TOKEN: the database authentication token.
   - PYTHONDONTWRITEBYTECODE: 1, to prevent import-time writes before app startup.

   Apply these to Production and the desired Preview environments. Never prefix
   database credentials with VITE_ or expose them to the frontend.
4. Redeploy with the updated backend requirements. Vercel's Linux environment
   installs sqlalchemy-libsql; Windows local development skips that native
   dependency and continues using standard SQLite. Hosted development on Windows
   requires Linux/WSL; do not configure DATABASE_URL for normal Windows local dev.
5. Schema initialization runs on cold start and before the first database request
   using CREATE TABLE/INDEX IF NOT EXISTS. No manual schema creation is required.
   This creates missing tables/indexes; future column changes still require migrations.
6. Verify creation and retrieval in separate requests: POST /api/interviews,
   POST /api/interviews/{id}/documents, then GET /api/interviews/{id} from another
   client/request. Confirm the records also survive a redeploy/new function instance.
   Start an interview and confirm POST /api/interview/initial-question returns 200;
   test POST /api/transcribe with a valid multipart audio upload.

get_db and SessionLocal preserve their existing signatures. Remote access uses TLS,
a separate auth-token argument and no local sync file. DATABASE_URL is required on
Vercel; invalid/missing configuration fails startup with a specific safe error.
Connection/schema/query failures return HTTP 503 with a redacted database target;
missing stored sessions return 404 rather than silently dropping their documents.
Log messages include the operation/host and error class, never credentials or SQL.

The initial-question endpoint registers frontend-generated session-… IDs and
persists supplied extracted document text before calling Gemini. Retries reuse the
session and document entries. Existing /api/interviews CRUD endpoints store their
records in the same hosted database. Anonymous requests without an interview ID
remain stateless. Conversation messages continue to be saved through the existing
message API; this change does not add automatic transcript saving. In-memory turn
tracking still supplements the supplied conversation history; it is not a durable
distributed session-state store.

Original document/audio binaries are not retained: uploaded files are processed in
memory (or temporary multipart spools) and closed. PDF reviews are generated on the
client. Vercel Blob/S3 is therefore unnecessary for this change; if retention is
added later, store originals there and keep only their keys/URLs in the database.

Run regressions from backend:
`python -m unittest test_hosted_database test_serverless_storage test_transcription_storage -v`

Hosted connectivity cannot be verified without real DATABASE_URL and
DATABASE_AUTH_TOKEN. Local tests check configuration, schema idempotence,
cross-connection data retention, session/document registration and safe 404/503
responses. They do not substitute for the Vercel smoke test above.

Official integration: https://docs.turso.tech/sdk/python/orm/sqlalchemy

### Kokoro speech performance

Kokoro uses a CPU-only ONNX session with two intra-op threads by default, one inter-op thread, and worker spinning disabled. Set KOKORO_CPU_THREADS between 1 and 8 to tune the deployment after measuring synthesis latency. The TTS endpoint runs in FastAPI's worker pool so synthesis does not block the event loop used by interview requests. This does not guarantee low latency on a CPU-constrained host; benchmark real speech before switching the frontend to Kokoro.
