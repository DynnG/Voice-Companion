# STT & TTS Deployment Policy

This document covers the technical implementation, constraints, and deployment considerations for the Speech-to-Text (STT) and Text-to-Speech (TTS) engines used in the Savi backend.

## Architecture & Implementation
Savi uses local machine learning models for low-latency voice interactions:
- **STT Engine:** `faster-whisper` (CTranslate2 optimized INT8 quantization).
- **TTS Engine:** `Kokoro-82M-ONNX` (CPU-optimized ONNX session).

### In-Memory Processing
To maximize speed and prevent disk-locking race conditions, audio decoding is handled directly in RAM using `PyAV`. The `/api/transcribe` endpoint decodes uploaded binaries in memory without writing temp `.wav` files to disk. Synthesized TTS audio similarly returns in a `BytesIO` buffer.

## Deployment Considerations (Serverless)

When deploying to serverless platforms like Vercel, strict file system limitations apply.

### The 512 MB `/tmp` Limit
Serverless environments (like Vercel) limit writable storage to a volatile `/tmp` directory capped at 512 MB. 
- **Hugging Face Cache:** `faster-whisper` downloads the model weights via the Hugging Face Hub. 
- **Model Selection:** The `small` Whisper model (approx. 486 MB) barely fits within this quota alongside Kokoro and uploaded spools. In severely restricted environments, you may need to fallback to the `base` model (approx. 148 MB).

```env
WHISPER_MODEL_SIZE=base
```

### Xet Cache & File Reconstruction
The backend explicitly disables Hugging Face Xet caching and symlink warnings (`HF_HUB_DISABLE_XET=1`) before loading models. This forces downloaded `.bin` blobs to immediately resolve without caching duplicate chunk overheads, preserving precious `/tmp` storage.

### STT Preloading
Vercel's lifecycle prohibits heavy request-time downloads during cold starts. The `STT_SERVICE_URL` variable can be provided to offshore STT transcription to a dedicated microservice instead of running `faster-whisper` internally on Vercel. 
In local environments, STT and TTS models initialize lazily upon the first request or explicitly during startup depending on configuration.

## Environment Variables (Speech Tuning)
You can tune the deployment by adjusting the following optional variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `WHISPER_MODEL_SIZE` | `small` | Options: `tiny`, `base`, `small`, `medium` |
| `WHISPER_DEVICE` | `cpu` | Force inference device (`cpu` or `cuda`) |
| `WHISPER_COMPUTE_TYPE` | `int8` | `int8` prevents excessive RAM usage |
| `WHISPER_BEAM_SIZE` | `1` | Kept at 1 (greedy search) for maximum transcription speed |
| `WHISPER_LANGUAGE` | `en` | Forcing English bypasses language-ID overhead passes |
| `TTS_ENABLED` | `true` | Allows gracefully disabling TTS |
| `KOKORO_MODEL_PRECISION`| `int8` | Preserves memory. Change to `fp32` if native host requires full precision |
| `KOKORO_CPU_THREADS` | `2` | Tune Kokoro synthesis concurrency |

## Testing Models Locally
Developer-only verification scripts are provided to benchmark speech models without launching the full FastAPI server:

```sh
# Benchmark Kokoro ONNX TTS
python test_kokoro_tts.py

# Benchmark Faster-Whisper endpoints
python test_stt.py
```
