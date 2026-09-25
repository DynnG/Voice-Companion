import os
import time
import logging
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from .config import MODEL_SIZE, DEVICE, COMPUTE_TYPE, BEAM_SIZE, HOST, PORT, DEFAULT_LANGUAGE
    from .stt_service import STTService
except ImportError:
    from config import MODEL_SIZE, DEVICE, COMPUTE_TYPE, BEAM_SIZE, HOST, PORT, DEFAULT_LANGUAGE
    from stt_service import STTService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("voice-companion-stt")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        f"Initializing STT Service (Model: {MODEL_SIZE}, Device: {DEVICE}, "
        f"Compute: {COMPUTE_TYPE}, Beam: {BEAM_SIZE}, DefaultLang: {DEFAULT_LANGUAGE})..."
    )
    try:
        STTService.get_instance().load_model()
        logger.info("STT Model is preloaded and ready for ultra-low latency transcription.")
    except Exception as e:
        logger.error(f"Failed to preload model on startup: {e}")
    yield
    logger.info("Shutting down STT Backend.")

app = FastAPI(
    title="Pal Voice Companion STT Backend",
    description="Speech-to-Text service powered by faster-whisper",
    version="1.2.0",
    lifespan=lifespan
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SegmentInfo(BaseModel):
    id: int
    start: float
    end: float
    text: str

class StageTimings(BaseModel):
    upload_write_ms: float
    audio_decode_ms: float
    inference_ms: float
    total_processing_ms: float

class TranscribeResponse(BaseModel):
    text: str
    language: str
    language_probability: float
    duration: float
    processing_time_ms: float
    inference_time_ms: Optional[float] = None
    timings: Optional[StageTimings] = None
    model: str
    segments: Optional[List[SegmentInfo]] = None

@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "faster-whisper-stt",
        "model": MODEL_SIZE,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "beam_size": BEAM_SIZE,
        "language": DEFAULT_LANGUAGE
    }

@app.post("/transcribe", response_model=TranscribeResponse, tags=["Speech-to-Text"])
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file to transcribe (e.g. wav, mp3, webm, m4a, ogg)"),
    language: Optional[str] = Form(None, description="Optional language code (default: 'en')"),
    beam_size: Optional[int] = Form(None, description="Optional beam size override (default: 1 for speed)")
):
    """
    Transcribe an uploaded audio file using faster-whisper with in-memory decoding and stage timing metrics.
    """
    request_start = time.perf_counter()

    # 1. Stage: Read & Validate Upload Payload
    try:
        file_bytes = await file.read()
    except Exception as read_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read audio file upload stream: {str(read_err)}"
        )

    upload_write_ms = round((time.perf_counter() - request_start) * 1000, 2)

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty (0 bytes)."
        )

    if len(file_bytes) < 32:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio payload is too small to contain valid audio data."
        )

    # 2. Stage: In-Memory Decode, Validation & Whisper Inference
    try:
        stt = STTService.get_instance()
        result = stt.transcribe_audio_payload(
            audio_input=file_bytes,
            beam_size=beam_size,
            language=language,
            upload_write_ms=upload_write_ms
        )

        total_req_ms = round((time.perf_counter() - request_start) * 1000, 2)
        logger.info(
            f"Completed /transcribe request in {total_req_ms}ms "
            f"(Upload: {upload_write_ms}ms, Decode: {result['timings']['audio_decode_ms']}ms, "
            f"Inference: {result['timings']['inference_ms']}ms)"
        )

        return result

    except ValueError as ve:
        # Clear client error when audio is invalid, empty, or corrupted
        logger.warning(f"Invalid audio format rejected: {ve}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or corrupted audio payload: {str(ve)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error during transcription: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription processing error: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
