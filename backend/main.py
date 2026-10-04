# Configure writable storage before multipart and speech-library imports.
try:
    from .runtime_storage import TRANSCRIPTION_STORAGE
except ImportError:
    from runtime_storage import TRANSCRIPTION_STORAGE

import os
import time
import json
import logging
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

try:
    from .config import (
        MODEL_SIZE, DEVICE, COMPUTE_TYPE, BEAM_SIZE, HOST, PORT, DEFAULT_LANGUAGE,
        GEMINI_API_KEY, GEMINI_MODEL,
        TTS_ENABLED, KOKORO_MODEL, KOKORO_VOICE
    )
    from .stt_service import STTService, STTUnavailable, should_preload_stt
    from .gemini_service import (
        GeminiInterviewService, extract_conversational_text,
        classify_gemini_error, get_user_friendly_error_message,
        sanitize_error_message, HARD_INTERVIEW_TURN_LIMIT,
        HARD_LIMIT_ENDING_MESSAGE
    )
    from .tts_service import TTSService, DEFAULT_KOKORO_SPEED
    from .document_service import extract_document_text
    from .database import engine, Base, get_db, init_db, DatabaseUnavailable, database_failure
    from .models import Interview, Document, Message
    from .schemas import (
        InterviewCreate, InterviewUpdate, InterviewSummaryResponse,
        InterviewDetailResponse, DocumentCreate, DocumentResponse,
        MessageCreate, MessageResponse
    )
except ImportError:
    from config import (
        MODEL_SIZE, DEVICE, COMPUTE_TYPE, BEAM_SIZE, HOST, PORT, DEFAULT_LANGUAGE,
        GEMINI_API_KEY, GEMINI_MODEL,
        TTS_ENABLED, KOKORO_MODEL, KOKORO_VOICE
    )
    from stt_service import STTService, STTUnavailable, should_preload_stt
    from gemini_service import (
        GeminiInterviewService, extract_conversational_text,
        classify_gemini_error, get_user_friendly_error_message,
        sanitize_error_message, HARD_INTERVIEW_TURN_LIMIT,
        HARD_LIMIT_ENDING_MESSAGE
    )
    from tts_service import TTSService, DEFAULT_KOKORO_SPEED
    from document_service import extract_document_text
    from database import engine, Base, get_db, init_db, DatabaseUnavailable, database_failure
    from models import Interview, Document, Message
    from schemas import (
        InterviewCreate, InterviewUpdate, InterviewSummaryResponse,
        InterviewDetailResponse, DocumentCreate, DocumentResponse,
        MessageCreate, MessageResponse
    )

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
try:
    from .gemini_service import configure_sensitive_data_logging
    configure_sensitive_data_logging()
except ImportError:
    try:
        from gemini_service import configure_sensitive_data_logging
        configure_sensitive_data_logging()
    except Exception:
        pass
logger = logging.getLogger("voice-companion-backend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        f"Initializing STT Service (Model: {MODEL_SIZE}, Device: {DEVICE}, "
        f"Compute: {COMPUTE_TYPE}, Beam: {BEAM_SIZE}, DefaultLang: {DEFAULT_LANGUAGE})..."
    )
    if should_preload_stt():
        try:
            STTService.get_instance().load_model()
            logger.info("STT Model is preloaded and ready for ultra-low latency transcription.")
        except Exception as e:
            logger.error(f"Failed to preload STT model on startup: {e}")
    else:
        logger.info("STT startup preload skipped (external service, Vercel, or STT_PRELOAD=false).")

    # Initialize Kokoro-82M ONNX TTS Service (Local CPU)
    if TTS_ENABLED:
        logger.info(
            f"Initializing Kokoro TTS Service (Model: {KOKORO_MODEL}, Voice: {KOKORO_VOICE})..."
        )
        try:
            TTSService.get_instance().load_model()
            if TTSService.get_instance().is_loaded():
                logger.info("Kokoro ONNX TTS Model is preloaded and ready for CPU speech synthesis.")
            else:
                logger.warning(f"Kokoro TTS model could not be loaded: {TTSService.get_instance().get_error()}")
        except Exception as e:
            logger.error(f"Failed to preload Kokoro TTS model on startup: {e}")
    else:
        logger.info("Kokoro TTS is disabled via configuration (TTS_ENABLED=false).")

    # A failed database startup is retried by get_db and returns HTTP 503.
    try:
        init_db()
        logger.info("Database schema initialized successfully.")
    except DatabaseUnavailable as error:
        logger.error("%s", error)

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

# Allow the deployed Savi frontend and local development origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://frontend-fawn-gamma-48.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SegmentInfo(BaseModel):
    id: int
    start: float
    end: float
    text: str
    words: Optional[List[Dict[str, Any]]] = None

class StageTimings(BaseModel):
    upload_write_ms: float
    audio_decode_ms: float
    inference_ms: float
    total_processing_ms: float

class TranscribeResponse(BaseModel):
    text: str
    transcription: Optional[str] = None
    raw_text: Optional[str] = None
    ai_response: Optional[str] = None
    should_end: Optional[bool] = False
    reason: Optional[str] = None
    language: str
    language_probability: float
    duration: float
    processing_time_ms: float
    inference_time_ms: Optional[float] = None
    timings: Optional[StageTimings] = None
    model: str
    segments: Optional[List[SegmentInfo]] = None
    words: Optional[List[Dict[str, Any]]] = None
    hesitation_evidence: Optional[Dict[str, Any]] = None
    interview_error: Optional[str] = None

class InitialQuestionRequest(BaseModel):
    interview_id: Optional[str] = None
    job_role: Optional[str] = "Software Developer"
    attached_documents: Optional[List[Dict[str, Any]]] = None

class FollowupRequest(BaseModel):
    interview_id: Optional[str] = None
    user_answer: str
    job_role: Optional[str] = "Software Developer"
    conversation_history: Optional[List[Dict[str, str]]] = None
    attached_documents: Optional[List[Dict[str, Any]]] = None

class FollowupResponse(BaseModel):
    transcription: str
    ai_response: str
    should_end: bool = False
    reason: Optional[str] = None
    status: str = "success"
    error_type: Optional[str] = None
    error_message: Optional[str] = None

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

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = DEFAULT_KOKORO_SPEED

class AnswerNotesRequest(BaseModel):
    interview_id: Optional[str] = None
    question: str
    user_answer: str
    job_role: Optional[str] = "Software Developer"
    attached_documents: Optional[List[Dict[str, Any]]] = None
    duration_seconds: Optional[float] = None
    hesitation_evidence: Optional[Dict[str, Any]] = None
    input_method: Optional[str] = None

class AnswerNotesResponse(BaseModel):
    status: str = "success"
    notes: List[str] = []
    error_type: Optional[str] = None
    error_message: Optional[str] = None

class AnswerComparisonRequest(BaseModel):
    interview_id: Optional[str] = None
    question: str
    attempt1_answer: str
    attempt1_duration_seconds: Optional[float] = None
    attempt2_answer: str
    attempt2_duration_seconds: Optional[float] = None
    job_role: Optional[str] = "Software Developer"
    attached_documents: Optional[List[Dict[str, Any]]] = None

class AnswerComparisonResponse(BaseModel):
    status: str = "success"
    improvements: List[str] = []
    still_improve: List[str] = []
    attempt2_notes: List[str] = []
    error_type: Optional[str] = None
    error_message: Optional[str] = None
# Session-only in-memory interview session tracking (Zero DB persistence)
ACTIVE_INTERVIEW_SESSIONS: Dict[str, Dict[str, Any]] = {}


def get_effective_interview_documents(
    interview_id: Optional[str],
    attached_documents: Optional[List[Dict[str, Any]]] = None,
    db: Optional[Session] = None
) -> List[Dict[str, Any]]:
    """
    Resolve and load complete extracted document text for an interview.
    Prioritizes hosted database document records for the specific interview_id,
    and merges with any frontend-attached documents, ensuring extracted_text
    is fully populated for every turn.
    """
    docs_by_key: Dict[str, Dict[str, Any]] = {}

    # 1. Load authoritative document records; distinguish missing sessions from outages.
    if interview_id and db is not None:
        try:
            interview = db.query(Interview).filter(Interview.id == interview_id).first()
            if interview is None:
                raise HTTPException(status_code=404, detail=f"Interview '{interview_id}' not found. Create or start the session first.")
            db_docs = db.query(Document).filter(Document.interview_id == interview_id).all()
            for d in db_docs:
                key = (d.filename or "").lower().strip()
                docs_by_key[key] = {
                    "id": d.id,
                    "name": d.filename,
                    "filename": d.filename,
                    "category": d.category or "resume",
                    "content": d.extracted_text or "",
                    "extracted_text": d.extracted_text or "",
                    "size": d.size or ""
                }
        except HTTPException:
            raise
        except Exception as error:
            raise database_failure('document lookup', error) from None

    # 2. Merge with attached_documents from payload
    if attached_documents:
        for doc in attached_documents:
            fname = doc.get("filename") or doc.get("name") or "Document"
            key = fname.lower().strip()
            content = (
                doc.get("content")
                or doc.get("extracted_text")
                or doc.get("extractedText")
                or doc.get("text")
                or ""
            ).strip()

            if key in docs_by_key:
                # If existing has no text but incoming has text, or vice versa, keep the longer text
                existing_content = docs_by_key[key].get("content") or ""
                if len(content) > len(existing_content):
                    docs_by_key[key]["content"] = content
                    docs_by_key[key]["extracted_text"] = content
            else:
                docs_by_key[key] = {
                    "id": doc.get("id", ""),
                    "name": fname,
                    "filename": fname,
                    "category": doc.get("category", "resume"),
                    "content": content,
                    "extracted_text": content,
                    "size": doc.get("size", "")
                }

    effective_docs = list(docs_by_key.values())
    total_chars = sum(len(d.get("content") or "") for d in effective_docs)
    doc_included = total_chars > 0

    # Diagnostic logging (requirement 14)
    logger.info(
        f"[Interview Context Diagnostic] interview_id='{interview_id or 'none'}' | "
        f"number of attached documents={len(effective_docs)} | "
        f"extracted text character count={total_chars} | "
        f"document context included in Gemini request={doc_included}"
    )

    return effective_docs


@app.exception_handler(DatabaseUnavailable)
async def database_unavailable_handler(request, error):
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.exception_handler(SQLAlchemyError)
async def database_query_error_handler(request, error):
    failure = database_failure('query', error)
    return JSONResponse(status_code=503, content={"detail": str(failure)})


def register_initial_session(req, db):
    """Persist frontend-generated session IDs and supplied extracted document text."""
    if not req.interview_id or db is None:
        return
    interview = db.query(Interview).filter(Interview.id == req.interview_id).first()
    if interview is None:
        if not req.interview_id.startswith('session-'):
            raise HTTPException(status_code=404, detail=f"Interview '{req.interview_id}' not found.")
        interview = Interview(id=req.interview_id, job_role=req.job_role or 'Software Developer',
                              title=f"Interview - {req.job_role or 'Software Developer'}", status='active')
        db.add(interview)
        try:
            db.commit()
        except IntegrityError:
            # Concurrent retries may have created the same primary key already.
            db.rollback()
            interview = db.query(Interview).filter(Interview.id == req.interview_id).first()
            if interview is None:
                raise
    existing = {doc.filename.lower().strip(): doc for doc in interview.documents}
    for supplied in req.attached_documents or []:
        filename = supplied.get('filename') or supplied.get('name') or 'Document'
        content = (supplied.get('content') or supplied.get('extracted_text') or supplied.get('extractedText') or supplied.get('text') or '').strip()
        key = filename.lower().strip()
        if key not in existing:
            document = Document(interview_id=interview.id, filename=filename,
                                category=supplied.get('category') or 'resume',
                                size=supplied.get('size') or '', extracted_text=content)
            db.add(document)
            existing[key] = document
        elif len(content) > len(existing[key].extracted_text or ''):
            existing[key].extracted_text = content
    db.commit()


@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
@app.get("/api", tags=["Health"])
@app.get("/", tags=["Health"])
def health_check():
    """
    Service health check reporting faster-whisper, Gemini, and Kokoro TTS status.
    """
    stt = STTService.get_instance()
    gemini = GeminiInterviewService.get_instance()
    tts = TTSService.get_instance()
    return {
        "status": "healthy",
        "service": "faster-whisper-stt",
        "model": MODEL_SIZE,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "language": DEFAULT_LANGUAGE,
        "beam_size": BEAM_SIZE,
        "vad_filter": stt.vad_filter,
        "gemini": {
            "configured": bool(gemini.get_api_key()),
            "model": GEMINI_MODEL
        },
        "tts": {
            "enabled": tts.is_enabled(),
            "loaded": tts.is_loaded()
        }
    }


@app.post("/interview/initial-question", tags=["Interview Brain"])
@app.post("/api/interview/initial-question", tags=["Interview Brain"])
async def initial_question(req: InitialQuestionRequest, db: Session = Depends(get_db)):
    """
    Generate an opening interview question tailored to the job role and attached candidate documents.
    """
    register_initial_session(req, db)
    effective_docs = get_effective_interview_documents(req.interview_id, req.attached_documents, db)

    # Initialize warm-instance turn tracking; session/documents are stored in the database
    if req.interview_id:
        ACTIVE_INTERVIEW_SESSIONS[req.interview_id] = {
            "status": "active",
            "turns_used": 0,
            "max_turns": HARD_INTERVIEW_TURN_LIMIT,
            "created_at": time.time()
        }

    role = req.job_role
    if req.interview_id and db is not None:
        try:
            intv = db.query(Interview).filter(Interview.id == req.interview_id).first()
            if intv and intv.job_role:
                role = intv.job_role
        except Exception as error:
            raise database_failure("session lookup", error) from None

    gemini = GeminiInterviewService.get_instance()
    question = await gemini.generate_initial_question(
        job_role=role,
        attached_docs=effective_docs,
        interview_id=req.interview_id
    )
    clean_question = extract_conversational_text(question)
    is_error = clean_question.startswith("AI interviewer is temporarily unavailable")
    if "usage limit" in clean_question:
        err_type = "quota_exceeded"
    elif "connection error" in clean_question:
        err_type = "connection_error"
    elif "unauthorized" in clean_question or "invalid" in clean_question:
        err_type = "authentication_error"
    elif is_error:
        err_type = "ai_service_error"
    else:
        err_type = None
    response_data = {
        "job_role": role,
        "question": clean_question,
        "ai_response": clean_question,
        "status": "error" if is_error else "success",
        "error_type": err_type,
        "error_message": clean_question if is_error else None
    }
    
    if is_error:
        status_code = 500
        if err_type == "quota_exceeded":
            status_code = 429
        elif err_type == "authentication_error":
            status_code = 401
        elif err_type == "connection_error":
            status_code = 503
        return JSONResponse(status_code=status_code, content=response_data)
    
    return response_data


@app.post("/interview/followup", response_model=FollowupResponse, tags=["Interview Brain"])
@app.post("/api/interview/followup", response_model=FollowupResponse, tags=["Interview Brain"])
async def generate_followup(req: FollowupRequest, db: Session = Depends(get_db)):
    """
    Generate the next follow-up question or concluding statement given a user answer and conversation history.
    Strictly enforces session availability and maximum turn limit without calling Gemini if completed.
    """
    session_id = req.interview_id
    session_data = ACTIVE_INTERVIEW_SESSIONS.get(session_id) if session_id else None

    # Check 1: In-memory session completed guard - reject without calling Gemini
    if session_data and session_data.get("status") == "completed":
        logger.info(f"[/interview/followup] Rejected Gemini call: session {session_id} is already completed.")
        return FollowupResponse(
            transcription=req.user_answer,
            ai_response=HARD_LIMIT_ENDING_MESSAGE,
            should_end=True,
            reason="session_limit_reached",
            status="completed",
            error_type="session_limit_reached",
            error_message="Interview session limit reached. No further Gemini requests allowed."
        )

    # Check 2: Calculate candidate turn count from history (excluding Attempt 2 retries)
    candidate_turns = 0
    if req.conversation_history:
        candidate_turns = sum(
            1 for m in req.conversation_history
            if m.get("sender", "").lower() in ("you", "user")
            and not str(m.get("text", "")).startswith("(Attempt 2)")
        )

    # If already at or beyond maximum turn limit (8 candidate turns)
    if candidate_turns >= HARD_INTERVIEW_TURN_LIMIT or (session_data and session_data.get("turns_used", 0) >= HARD_INTERVIEW_TURN_LIMIT):
        if session_id:
            if session_id not in ACTIVE_INTERVIEW_SESSIONS:
                ACTIVE_INTERVIEW_SESSIONS[session_id] = {}
            ACTIVE_INTERVIEW_SESSIONS[session_id]["status"] = "completed"
            ACTIVE_INTERVIEW_SESSIONS[session_id]["turns_used"] = HARD_INTERVIEW_TURN_LIMIT
        logger.info(f"[/interview/followup] Session limit reached ({candidate_turns}/{HARD_INTERVIEW_TURN_LIMIT}). Returning final message without Gemini call.")
        return FollowupResponse(
            transcription=req.user_answer,
            ai_response=HARD_LIMIT_ENDING_MESSAGE,
            should_end=True,
            reason="turn_limit_reached",
            status="completed",
            error_type="session_limit_reached",
            error_message="Interview session limit reached. No further Gemini requests allowed."
        )

    effective_docs = get_effective_interview_documents(req.interview_id, req.attached_documents, db)

    role = req.job_role
    if req.interview_id and db is not None:
        try:
            intv = db.query(Interview).filter(Interview.id == req.interview_id).first()
            if intv and intv.job_role:
                role = intv.job_role
        except Exception as error:
            raise database_failure("session lookup", error) from None

    gemini = GeminiInterviewService.get_instance()
    result = await gemini.generate_interview_followup(
        user_answer=req.user_answer,
        conversation_history=req.conversation_history,
        job_role=role,
        attached_docs=effective_docs,
        interview_id=req.interview_id
    )
    clean_response = extract_conversational_text(result["response"])
    should_end = result.get("should_end", False)

    # Update in-memory session availability
    if session_id:
        if session_id not in ACTIVE_INTERVIEW_SESSIONS:
            ACTIVE_INTERVIEW_SESSIONS[session_id] = {
                "status": "active",
                "turns_used": candidate_turns + 1,
                "max_turns": HARD_INTERVIEW_TURN_LIMIT
            }
        else:
            ACTIVE_INTERVIEW_SESSIONS[session_id]["turns_used"] = max(
                ACTIVE_INTERVIEW_SESSIONS[session_id].get("turns_used", 0),
                candidate_turns + 1
            )

        if should_end or ACTIVE_INTERVIEW_SESSIONS[session_id]["turns_used"] >= HARD_INTERVIEW_TURN_LIMIT:
            ACTIVE_INTERVIEW_SESSIONS[session_id]["status"] = "completed"

    response_data = {
        "transcription": req.user_answer,
        "ai_response": clean_response,
        "should_end": should_end,
        "reason": result.get("reason"),
        "status": result.get("status", "success"),
        "error_type": result.get("error_type"),
        "error_message": result.get("error_message")
    }

    if response_data["status"] == "error":
        status_code = 500
        err_type = response_data.get("error_type", "")
        if err_type == "quota_exceeded":
            status_code = 429
        elif err_type == "authentication_error" or err_type == "api_key_missing":
            status_code = 401
        elif err_type == "connection_error":
            status_code = 503
        return JSONResponse(status_code=status_code, content=response_data)

    return response_data


@app.post("/interview/replay/notes", response_model=AnswerNotesResponse, tags=["Answer Replay"])
@app.post("/api/interview/replay/notes", response_model=AnswerNotesResponse, tags=["Answer Replay"])
async def get_answer_notes(req: AnswerNotesRequest, db: Session = Depends(get_db)):
    """
    Generate short, actionable coaching notes for a candidate's answer (Session-only, no DB writes).
    """
    effective_docs = get_effective_interview_documents(req.interview_id, req.attached_documents, db)
    gemini = GeminiInterviewService.get_instance()
    res = await gemini.generate_answer_ai_notes(
        question=req.question,
        user_answer=req.user_answer,
        job_role=req.job_role,
        attached_docs=effective_docs,
        interview_id=req.interview_id,
        duration_seconds=req.duration_seconds,
        hesitation_evidence=req.hesitation_evidence,
        input_method=req.input_method
    )
    response_data = {
        "status": res.get("status", "success"),
        "notes": res.get("notes", []),
        "error_type": res.get("error_type"),
        "error_message": res.get("error_message")
    }
    
    if response_data["status"] == "error":
        status_code = 500
        err_type = response_data.get("error_type", "")
        if err_type == "quota_exceeded":
            status_code = 429
        elif err_type == "authentication_error" or err_type == "api_key_missing":
            status_code = 401
        elif err_type == "connection_error":
            status_code = 503
        return JSONResponse(status_code=status_code, content=response_data)
        
    return response_data


@app.post("/interview/replay/compare", response_model=AnswerComparisonResponse, tags=["Answer Replay"])
@app.post("/api/interview/replay/compare", response_model=AnswerComparisonResponse, tags=["Answer Replay"])
async def compare_answers(req: AnswerComparisonRequest, db: Session = Depends(get_db)):
    """
    Compare Attempt 1 and Attempt 2 for the same interview question (Session-only, no DB writes).
    """
    effective_docs = get_effective_interview_documents(req.interview_id, req.attached_documents, db)
    gemini = GeminiInterviewService.get_instance()
    res = await gemini.generate_answer_comparison(
        question=req.question,
        attempt1_answer=req.attempt1_answer,
        attempt1_duration=req.attempt1_duration_seconds,
        attempt2_answer=req.attempt2_answer,
        attempt2_duration=req.attempt2_duration_seconds,
        job_role=req.job_role,
        attached_docs=effective_docs,
        interview_id=req.interview_id
    )
    return AnswerComparisonResponse(
        status=res.get("status", "success"),
        improvements=res.get("improvements", []),
        still_improve=res.get("still_improve", []),
        attempt2_notes=res.get("attempt2_notes", []),
        error_type=res.get("error_type"),
        error_message=res.get("error_message")
    )


@app.post("/tts", tags=["Text-to-Speech"])
@app.post("/api/tts", tags=["Text-to-Speech"])
# FastAPI runs this CPU-bound handler in its worker pool, keeping the event loop free.
def text_to_speech(req: TTSRequest):
    """
    Synthesize speech from text using Kokoro-82M ONNX on CPU.
    Returns 24kHz 16-bit PCM WAV audio for direct browser playback.
    """
    if not req.text or not req.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text content cannot be empty."
        )

    tts = TTSService.get_instance()
    if not tts.is_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Text-to-speech is disabled (TTS_ENABLED=false)."
        )

    if not tts.is_loaded():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Kokoro TTS model is not available: {tts.get_error() or 'Model failed to load'}"
        )

    try:
        wav_bytes, sample_rate = tts.synthesize(
            text=req.text.strip(),
            voice=req.voice,
            speed=req.speed or DEFAULT_KOKORO_SPEED
        )
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "inline; filename=speech.wav",
                "X-Sample-Rate": str(sample_rate)
            }
        )
    except Exception as e:
        logger.error(f"TTS synthesis error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TTS synthesis failed: {str(e)}"
        )


@app.get("/tts/status", tags=["Text-to-Speech"])
@app.get("/api/tts/status", tags=["Text-to-Speech"])
def get_tts_status():
    """
    Check Kokoro TTS engine status, default voice, and available voices.
    """
    tts = TTSService.get_instance()
    return {
        "enabled": tts.is_enabled(),
        "loaded": tts.is_loaded(),
        "default_voice": tts.default_voice,
        "model": tts.model_name,
        "available_voices": tts.get_available_voices(),
        "error": tts.get_error()
    }


@app.post("/documents/extract", tags=["Document Processing"])
@app.post("/api/documents/extract", tags=["Document Processing"])
async def extract_document(
    file: UploadFile = File(..., description="Document file to extract text from (.pdf, .docx, .txt, .md)")
):
    """
    Extract readable text from uploaded candidate materials (PDF, DOCX, TXT, MD).
    Returns the extracted text, character count, and detected file type.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is missing from upload."
        )

    try:
        content_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file bytes: {e}"
        )

    finally:
        await file.close()

    result = extract_document_text(content_bytes, file.filename)
    return result

@app.post("/transcribe", response_model=TranscribeResponse, tags=["Speech-to-Text & Interview Brain"])
@app.post("/api/transcribe", response_model=TranscribeResponse, tags=["Speech-to-Text & Interview Brain"])
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file to transcribe (e.g. wav, mp3, webm, m4a, ogg)"),
    language: Optional[str] = Form(None, description="Optional language code (default: 'en')"),
    beam_size: Optional[int] = Form(None, description="Optional beam size override (default: 1 for speed)"),
    job_role: Optional[str] = Form(None, description="Target job role for interview context"),
    interview_id: Optional[str] = Form(None, description="Optional interview ID to load document context from database"),
    history: Optional[str] = Form(None, description="JSON encoded previous conversation turns"),
    attached_docs: Optional[str] = Form(None, description="JSON encoded attached candidate documents"),
    generate_ai_response: Optional[bool] = Form(True, description="Whether to trigger Gemini interview brain"),
    db: Session = Depends(get_db)
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

    finally:
        # Close/unlink multipart spool files on success and read failures alike.
        await file.close()

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
        should_end: bool = False
        completion_reason: Optional[str] = None
        interview_error: Optional[str] = None
        followup_status: str = "success"
        followup_error_type: Optional[str] = None

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

            effective_docs = get_effective_interview_documents(interview_id, parsed_docs, db)

            session_data = ACTIVE_INTERVIEW_SESSIONS.get(interview_id) if interview_id else None
            candidate_turns = 0
            if parsed_history:
                candidate_turns = sum(
                    1 for m in parsed_history
                    if m.get("sender", "").lower() in ("you", "user")
                    and not str(m.get("text", "")).startswith("(Attempt 2)")
                )

            if (session_data and session_data.get("status") == "completed") or candidate_turns >= HARD_INTERVIEW_TURN_LIMIT:
                logger.info(f"[/transcribe] Session limit reached ({candidate_turns}/{HARD_INTERVIEW_TURN_LIMIT}). Returning final message without Gemini call.")
                if interview_id:
                    if interview_id not in ACTIVE_INTERVIEW_SESSIONS:
                        ACTIVE_INTERVIEW_SESSIONS[interview_id] = {}
                    ACTIVE_INTERVIEW_SESSIONS[interview_id]["status"] = "completed"
                    ACTIVE_INTERVIEW_SESSIONS[interview_id]["turns_used"] = HARD_INTERVIEW_TURN_LIMIT
                ai_response_text = HARD_LIMIT_ENDING_MESSAGE
                should_end = True
                completion_reason = "turn_limit_reached"
                followup_status = "completed"
            else:
                try:
                    gemini = GeminiInterviewService.get_instance()
                    followup_dict = await gemini.generate_interview_followup(
                        user_answer=transcribed_text,
                        conversation_history=parsed_history,
                        job_role=job_role,
                        attached_docs=effective_docs,
                        interview_id=interview_id
                    )
                    ai_response_text = extract_conversational_text(followup_dict["response"])
                    should_end = followup_dict["should_end"]
                    completion_reason = followup_dict["reason"]
                    followup_status = followup_dict.get("status", "success")
                    followup_error_type = followup_dict.get("error_type")

                    if interview_id:
                        if interview_id not in ACTIVE_INTERVIEW_SESSIONS:
                            ACTIVE_INTERVIEW_SESSIONS[interview_id] = {
                                "status": "active",
                                "turns_used": candidate_turns + 1,
                                "max_turns": HARD_INTERVIEW_TURN_LIMIT
                            }
                        else:
                            ACTIVE_INTERVIEW_SESSIONS[interview_id]["turns_used"] = max(
                                ACTIVE_INTERVIEW_SESSIONS[interview_id].get("turns_used", 0),
                                candidate_turns + 1
                            )
                        if should_end or ACTIVE_INTERVIEW_SESSIONS[interview_id]["turns_used"] >= HARD_INTERVIEW_TURN_LIMIT:
                            ACTIVE_INTERVIEW_SESSIONS[interview_id]["status"] = "completed"

                    if followup_status == "error":
                        interview_error = followup_dict.get("error_message") or ai_response_text
                    logger.info(f"Gemini generated interview follow-up (status={followup_status}, should_end={should_end}): \"{ai_response_text}\"")
                except Exception as gemini_err:
                    err_type = classify_gemini_error(gemini_err)
                    ai_response_text = get_user_friendly_error_message(err_type)
                    should_end = False
                    completion_reason = f"gemini_{err_type}"
                    followup_status = "error"
                    followup_error_type = err_type
                    sanitized_err = sanitize_error_message(str(gemini_err))
                    logger.error(f"Gemini processing error [{err_type}]: {sanitized_err}")
                    interview_error = sanitized_err

        result["ai_response"] = ai_response_text
        result["should_end"] = should_end
        result["reason"] = completion_reason
        result["status"] = followup_status
        result["error_type"] = followup_error_type
        result["interview_error"] = interview_error

        total_req_ms = round((time.perf_counter() - request_start) * 1000, 2)
        logger.info(
            f"Completed /transcribe request in {total_req_ms}ms "
            f"(Upload: {upload_write_ms}ms, Decode: {result['timings']['audio_decode_ms']}ms, "
            f"Inference: {result['timings']['inference_ms']}ms) | "
            f"User: \"{transcribed_text}\" -> AI: \"{ai_response_text}\""
        )

        if result["status"] == "error":
            status_code = 500
            err_type = result.get("error_type", "")
            if err_type == "quota_exceeded":
                status_code = 429
            elif err_type == "authentication_error" or err_type == "api_key_missing":
                status_code = 401
            elif err_type == "connection_error":
                status_code = 503
            return JSONResponse(status_code=status_code, content=result)
        return result

    except STTUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (HTTPException, DatabaseUnavailable):
        raise
    except ValueError as ve:
        # Clear client error when audio is invalid, empty, or corrupted
        logger.warning(f"Invalid audio format rejected: {ve}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or corrupted audio payload: {str(ve)}"
        )
    except Exception as e:
        logger.error("Unexpected transcription failure (%s), file=%s", type(e).__name__, getattr(e, "filename", None))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transcription processing failed. Check backend model storage and configuration."
        )

@app.post("/interview/chat", response_model=InterviewChatResponse, tags=["AI Interviewer"])
@app.post("/api/interview/chat", response_model=InterviewChatResponse, tags=["AI Interviewer"])
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


# ==============================================================================
# Database Persistence: Interview History, Attached Documents, and Message Turns
# ==============================================================================

@app.get("/api/interviews", response_model=List[InterviewSummaryResponse], tags=["Interviews Database"])
def list_interviews(db: Session = Depends(get_db)):
    """
    List all saved interviews ordered chronologically by updated_at descending.
    """
    interviews = db.query(Interview).order_by(Interview.updated_at.desc()).all()
    results = []
    for intv in interviews:
        doc_count = len(intv.documents)
        msg_count = len(intv.messages)
        last_msg = intv.messages[-1].content if intv.messages else None
        results.append(InterviewSummaryResponse(
            id=intv.id,
            title=intv.title,
            job_role=intv.job_role,
            status=intv.status,
            created_at=intv.created_at,
            updated_at=intv.updated_at,
            document_count=doc_count,
            message_count=msg_count,
            last_message=last_msg
        ))
    return results

@app.post("/api/interviews", response_model=InterviewDetailResponse, status_code=status.HTTP_201_CREATED, tags=["Interviews Database"])
def create_interview(req: InterviewCreate, db: Session = Depends(get_db)):
    """
    Create a new interview record in the database.
    """
    role = (req.job_role or "Software Developer").strip()
    title = (req.title or f"Interview - {role}").strip()
    
    new_intv = Interview(
        title=title,
        job_role=role,
        status=req.status or "setup"
    )
    if req.id:
        new_intv.id = req.id

    db.add(new_intv)
    db.commit()
    db.refresh(new_intv)
    return new_intv

@app.get("/api/interviews/{interview_id}", response_model=InterviewDetailResponse, tags=["Interviews Database"])
def get_interview(interview_id: str, db: Session = Depends(get_db)):
    """
    Retrieve an interview with its attached documents and complete ordered messages.
    """
    intv = db.query(Interview).filter(Interview.id == interview_id).first()
    if not intv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview '{interview_id}' not found."
        )
    return intv

@app.patch("/api/interviews/{interview_id}", response_model=InterviewDetailResponse, tags=["Interviews Database"])
def update_interview(interview_id: str, req: InterviewUpdate, db: Session = Depends(get_db)):
    """
    Update an interview's status, title, or job role.
    """
    intv = db.query(Interview).filter(Interview.id == interview_id).first()
    if not intv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview '{interview_id}' not found."
        )
    
    if req.title is not None:
        intv.title = req.title.strip()
    if req.job_role is not None:
        intv.job_role = req.job_role.strip()
    if req.status is not None:
        intv.status = req.status.strip()

    db.commit()
    db.refresh(intv)
    return intv

@app.delete("/api/interviews/{interview_id}", tags=["Interviews Database"])
def delete_interview(interview_id: str, db: Session = Depends(get_db)):
    """
    Delete an interview session and automatically cascade-delete all its documents and messages.
    """
    intv = db.query(Interview).filter(Interview.id == interview_id).first()
    if not intv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview '{interview_id}' not found."
        )
    
    db.delete(intv)
    db.commit()
    return {"success": True, "deleted_id": interview_id}

@app.post("/api/interviews/{interview_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED, tags=["Interviews Database"])
def add_interview_document(interview_id: str, doc: DocumentCreate, db: Session = Depends(get_db)):
    """
    Attach a document with its extracted text to an interview session.
    """
    intv = db.query(Interview).filter(Interview.id == interview_id).first()
    if not intv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview '{interview_id}' not found."
        )

    new_doc = Document(
        interview_id=interview_id,
        filename=doc.filename,
        category=doc.category or "resume",
        size=doc.size or "",
        extracted_text=doc.extracted_text or ""
    )
    if doc.id:
        new_doc.id = doc.id

    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc

@app.post("/api/interviews/{interview_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED, tags=["Interviews Database"])
def add_interview_message(interview_id: str, msg: MessageCreate, db: Session = Depends(get_db)):
    """
    Persist an interview message turn (user transcript or interviewer follow-up) in chronological sequence.
    """
    intv = db.query(Interview).filter(Interview.id == interview_id).first()
    if not intv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview '{interview_id}' not found."
        )

    new_msg = Message(
        interview_id=interview_id,
        role=msg.role,
        content=msg.content
    )
    if msg.id:
        new_msg.id = msg.id

    db.add(new_msg)
    # Update interview updated_at timestamp
    intv.updated_at = func.now()
    db.commit()
    db.refresh(new_msg)
    return new_msg

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)


class JobTitleValidationRequest(BaseModel):
    job_role: str

@app.post("/interview/validate-job-title", tags=["Interview Brain"])
@app.post("/api/interview/validate-job-title", tags=["Interview Brain"])
async def validate_job_title_endpoint(req: JobTitleValidationRequest):
    """
    Validate whether the manually entered job title is a legitimate job role.
    """
    gemini = GeminiInterviewService.get_instance()
    is_valid = await gemini.validate_job_title(req.job_role)
    return {"is_valid": is_valid}
