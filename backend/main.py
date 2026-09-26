import os
import time
import json
import logging
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

try:
    from .config import (
        MODEL_SIZE, DEVICE, COMPUTE_TYPE, BEAM_SIZE, HOST, PORT, DEFAULT_LANGUAGE,
        GEMINI_API_KEY, GEMINI_MODEL
    )
    from .stt_service import STTService
    from .gemini_service import (
        GeminiInterviewService, extract_conversational_text,
        classify_gemini_error, get_user_friendly_error_message,
        sanitize_error_message
    )
    from .document_service import extract_document_text
    from .database import engine, Base, get_db
    from .models import Interview, Document, Message
    from .schemas import (
        InterviewCreate, InterviewUpdate, InterviewSummaryResponse,
        InterviewDetailResponse, DocumentCreate, DocumentResponse,
        MessageCreate, MessageResponse
    )
except ImportError:
    from config import (
        MODEL_SIZE, DEVICE, COMPUTE_TYPE, BEAM_SIZE, HOST, PORT, DEFAULT_LANGUAGE,
        GEMINI_API_KEY, GEMINI_MODEL
    )
    from stt_service import STTService
    from gemini_service import (
        GeminiInterviewService, extract_conversational_text,
        classify_gemini_error, get_user_friendly_error_message,
        sanitize_error_message
    )
    from document_service import extract_document_text
    from database import engine, Base, get_db
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

    # Initialize SQLite database schema
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("SQLite database schema initialized successfully.")
    except Exception as dbe:
        logger.error(f"Failed to initialize SQLite database: {dbe}")

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


def get_effective_interview_documents(
    interview_id: Optional[str],
    attached_documents: Optional[List[Dict[str, Any]]] = None,
    db: Optional[Session] = None
) -> List[Dict[str, Any]]:
    """
    Resolve and load complete extracted document text for an interview.
    Prioritizes SQLite document records for the specific interview_id,
    and merges with any frontend-attached documents, ensuring extracted_text
    is fully populated for every turn.
    """
    docs_by_key: Dict[str, Dict[str, Any]] = {}

    # 1. Load authoritative document records from SQLite if interview_id is provided
    if interview_id and db is not None:
        try:
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
        except Exception as e:
            logger.warning(f"Could not load documents from SQLite for interview {interview_id}: {e}")

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


@app.post("/interview/initial-question", tags=["Interview Brain"])
async def initial_question(req: InitialQuestionRequest, db: Session = Depends(get_db)):
    """
    Generate an opening interview question tailored to the job role and attached candidate documents.
    """
    effective_docs = get_effective_interview_documents(req.interview_id, req.attached_documents, db)

    role = req.job_role
    if req.interview_id and db is not None:
        try:
            intv = db.query(Interview).filter(Interview.id == req.interview_id).first()
            if intv and intv.job_role:
                role = intv.job_role
        except Exception:
            pass

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
    elif is_error:
        err_type = "ai_service_error"
    else:
        err_type = None
    return {
        "job_role": role,
        "question": clean_question,
        "ai_response": clean_question,
        "status": "error" if is_error else "success",
        "error_type": err_type,
        "error_message": clean_question if is_error else None
    }


@app.post("/interview/followup", response_model=FollowupResponse, tags=["Interview Brain"])
async def generate_followup(req: FollowupRequest, db: Session = Depends(get_db)):
    """
    Generate the next follow-up question or concluding statement given a user answer and conversation history.
    """
    effective_docs = get_effective_interview_documents(req.interview_id, req.attached_documents, db)

    role = req.job_role
    if req.interview_id and db is not None:
        try:
            intv = db.query(Interview).filter(Interview.id == req.interview_id).first()
            if intv and intv.job_role:
                role = intv.job_role
        except Exception:
            pass

    gemini = GeminiInterviewService.get_instance()
    result = await gemini.generate_interview_followup(
        user_answer=req.user_answer,
        conversation_history=req.conversation_history,
        job_role=role,
        attached_docs=effective_docs,
        interview_id=req.interview_id
    )
    clean_response = extract_conversational_text(result["response"])
    return {
        "transcription": req.user_answer,
        "ai_response": clean_response,
        "should_end": result.get("should_end", False),
        "reason": result.get("reason"),
        "status": result.get("status", "success"),
        "error_type": result.get("error_type"),
        "error_message": result.get("error_message")
    }

@app.post("/documents/extract", tags=["Document Processing"])
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

    result = extract_document_text(content_bytes, file.filename)
    return result

@app.post("/transcribe", response_model=TranscribeResponse, tags=["Speech-to-Text & Interview Brain"])
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

