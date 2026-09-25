import os
import time
import json
import logging
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from .config import (
        MODEL_SIZE, DEVICE, COMPUTE_TYPE, BEAM_SIZE, HOST, PORT, DEFAULT_LANGUAGE,
        GEMINI_API_KEY, GEMINI_MODEL
    )
    from .stt_service import STTService
    from .gemini_service import GeminiInterviewService
except ImportError:
    from config import (
        MODEL_SIZE, DEVICE, COMPUTE_TYPE, BEAM_SIZE, HOST, PORT, DEFAULT_LANGUAGE,
        GEMINI_API_KEY, GEMINI_MODEL
    )
    from stt_service import STTService
    from gemini_service import GeminiInterviewService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("voice-companion-backend")

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
        logger.error(f"Failed to preload STT model on startup: {e}")

    # Log Gemini initialization status (without leaking secrets)
    gemini = GeminiInterviewService.get_instance()
    if gemini.get_api_key():
        logger.info(f"Gemini LLM Service initialized successfully with model: {GEMINI_MODEL}")
    else:
        logger.warning(
            "Gemini LLM Service: GEMINI_API_KEY is not set in backend/.env. "
            "Please provide a key to enable AI interview responses."
        )

    yield
    logger.info("Shutting down Voice Companion Backend.")

app = FastAPI(
    title="Pal Voice Companion Backend",
    description="Speech-to-Text (faster-whisper) and Conversational AI Interviewer (Gemini)",
    version="1.3.0",
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
    transcription: Optional[str] = None
    ai_response: Optional[str] = None
    language: str
    language_probability: float
    duration: float
    processing_time_ms: float
    inference_time_ms: Optional[float] = None
    timings: Optional[StageTimings] = None
    model: str
    segments: Optional[List[SegmentInfo]] = None
    interview_error: Optional[str] = None

class InitialQuestionRequest(BaseModel):
    job_role: Optional[str] = "Software Developer"
    attached_documents: Optional[List[Dict[str, Any]]] = None

class FollowupRequest(BaseModel):
    user_answer: str
    job_role: Optional[str] = "Software Developer"
    conversation_history: Optional[List[Dict[str, str]]] = None
    attached_documents: Optional[List[Dict[str, Any]]] = None

class ConversationTurn(BaseModel):
    role: str  # "user", "model", "pal", "assistant"
    text: str

class InterviewChatRequest(BaseModel):
    message: str
    history: Optional[List[ConversationTurn]] = None
    job_role: Optional[str] = None
    context_docs: Optional[List[str]] = None
    system_instruction: Optional[str] = None

class InterviewChatResponse(BaseModel):
    text: str
    model: str
    latency_ms: float

@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
async def health_check():
    gemini_ready = bool(GeminiInterviewService.get_instance().get_api_key())
    return {
        "status": "healthy",
        "stt": {
            "service": "faster-whisper-stt",
            "model": MODEL_SIZE,
            "device": DEVICE,
            "compute_type": COMPUTE_TYPE,
            "beam_size": BEAM_SIZE,
            "language": DEFAULT_LANGUAGE,
        },
        "gemini": {
            "configured": gemini_ready,
            "model": GEMINI_MODEL,
            "brain": "enabled"
        }
    }

@app.post("/interview/initial-question", tags=["Interview Brain"])
async def initial_question(req: InitialQuestionRequest):
    """
    Generate an opening interview question tailored to the job role and attached candidate documents.
    """
    gemini = GeminiInterviewService.get_instance()
    question = await gemini.generate_initial_question(
        job_role=req.job_role,
        attached_docs=req.attached_documents
    )
    return {
        "job_role": req.job_role,
        "question": question,
        "ai_response": question
    }

@app.post("/interview/followup", tags=["Interview Brain"])
async def generate_followup(req: FollowupRequest):
    """
    Generate the next follow-up question given a user answer and conversation history.
    """
    gemini = GeminiInterviewService.get_instance()
    ai_question = await gemini.generate_interview_followup(
        user_answer=req.user_answer,
        conversation_history=req.conversation_history,
        job_role=req.job_role,
        attached_docs=req.attached_documents
    )
    return {
        "transcription": req.user_answer,
        "ai_response": ai_question
    }

@app.post("/transcribe", response_model=TranscribeResponse, tags=["Speech-to-Text & Interview Brain"])
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file to transcribe (e.g. wav, mp3, webm, m4a, ogg)"),
    language: Optional[str] = Form(None, description="Optional language code (default: 'en')"),
    beam_size: Optional[int] = Form(None, description="Optional beam size override (default: 1 for speed)"),
    job_role: Optional[str] = Form(None, description="Target job role for interview context"),
    history: Optional[str] = Form(None, description="JSON encoded previous conversation turns"),
    attached_docs: Optional[str] = Form(None, description="JSON encoded attached candidate documents"),
    generate_ai_response: Optional[bool] = Form(True, description="Whether to trigger Gemini interview brain")
):
    """
    Transcribe an uploaded audio file using faster-whisper, and automatically pass the transcription
    to Gemini to analyze the candidate's answer and generate the next interview question.
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

        transcribed_text = (result.get("text") or "").strip()
        result["transcription"] = transcribed_text

        # 3. Stage: Gemini Interview Brain Integration
        ai_response_text: Optional[str] = None
        interview_error: Optional[str] = None

        if transcribed_text and generate_ai_response:
            # Parse history and attached docs if provided as JSON strings
            parsed_history: Optional[List[Dict[str, str]]] = None
            if history:
                try:
                    parsed_history = json.loads(history)
                except Exception as parse_err:
                    logger.warning(f"Could not parse conversation history JSON: {parse_err}")

            parsed_docs: Optional[List[Dict[str, Any]]] = None
            if attached_docs:
                try:
                    parsed_docs = json.loads(attached_docs)
                except Exception as parse_err:
                    logger.warning(f"Could not parse attached docs JSON: {parse_err}")

            try:
                gemini = GeminiInterviewService.get_instance()
                ai_response_text = await gemini.generate_interview_followup(
                    user_answer=transcribed_text,
                    conversation_history=parsed_history,
                    job_role=job_role,
                    attached_docs=parsed_docs
                )
                logger.info(f"Gemini generated interview follow-up: \"{ai_response_text}\"")
            except Exception as gemini_err:
                logger.error(f"Gemini processing error: {gemini_err}", exc_info=True)
                interview_error = str(gemini_err)
                ai_response_text = "Thank you for sharing that. Could you tell me more about how you would apply those skills in this role?"

        result["ai_response"] = ai_response_text
        result["interview_error"] = interview_error

        total_req_ms = round((time.perf_counter() - request_start) * 1000, 2)
        logger.info(
            f"Completed /transcribe request in {total_req_ms}ms "
            f"(Upload: {upload_write_ms}ms, Decode: {result['timings']['audio_decode_ms']}ms, "
            f"Inference: {result['timings']['inference_ms']}ms) | "
            f"User: \"{transcribed_text}\" -> AI: \"{ai_response_text}\""
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

@app.post("/interview/chat", response_model=InterviewChatResponse, tags=["AI Interviewer"])
async def interview_chat(payload: InterviewChatRequest):
    """
    Generate an AI interviewer response via Gemini using conversational history and role context.
    """
    if not payload.message or not payload.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content cannot be empty."
        )

    gemini_svc = GeminiInterviewService.get_instance()

    # Check if configured
    if not gemini_svc.get_api_key():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API is not configured. Please set GEMINI_API_KEY in backend/.env."
        )

    try:
        history_list = [{"sender": h.role, "text": h.text} for h in payload.history] if payload.history else None
        ai_text = await gemini_svc.generate_interview_followup(
            user_answer=payload.message.strip(),
            conversation_history=history_list,
            job_role=payload.job_role,
        )
        return {"text": ai_text, "model": gemini_svc.get_model_name(), "latency_ms": 0.0}
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Interview response generation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gemini generation error: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)

