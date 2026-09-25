# Pal Voice Companion — STT Backend (faster-whisper)

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

## Running Benchmarks and Tests

```powershell
# Run comprehensive pipeline latency, reliability & accuracy test suite
& backend\.venv\Scripts\python.exe backend\test_pipeline.py

# Run accuracy benchmark across models & beam sizes
& backend\.venv\Scripts\python.exe backend\accuracy_benchmark.py

# Run standard endpoint tests
& backend\.venv\Scripts\python.exe backend\test_stt.py
```
