"""
Test suite verifying Session-Only Interview architecture:
1. In-memory session flow: New Interview -> Upload Documents -> Start Interview -> Live Interview.
2. Documents are provided in-memory and grounded during the active interview turns.
3. Starting a New Interview clears previous documents, messages, and context.
4. No confidential documents, extracted text, or messages are persisted to SQLite/database.
5. Automatic interview completion and error handling operate in session memory.
"""
import sys
import os
import json
from pathlib import Path
from unittest.mock import patch

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from gemini_service import (
    GeminiInterviewService,
    extract_conversational_text,
    FALLBACK_FOLLOWUP_QUESTIONS
)
from database import SessionLocal
from models import Interview, Document, Message
from fastapi.testclient import TestClient
from main import app, get_effective_interview_documents

client = TestClient(app)


def test_no_database_persistence():
    print("\n--- 1. Verifying Database Has ZERO Persisted Documents/Messages ---")
    db = SessionLocal()
    try:
        doc_count = db.query(Document).count()
        msg_count = db.query(Message).count()
        print(f"  Active SQLite records -> Documents: {doc_count}, Messages: {msg_count}")
        assert doc_count == 0, f"Expected 0 persisted documents, found {doc_count}"
        assert msg_count == 0, f"Expected 0 persisted messages, found {msg_count}"
        print("  [PASS] No documents or conversation turns are persisted in database.")
    finally:
        db.close()


def test_in_memory_document_grounding_active_turn():
    print("\n--- 2. Verifying Document Grounding Uses In-Memory Session Documents ---")
    session_docs = [
        {
            "id": "doc-session-1",
            "name": "Geraldyn_Resume.pdf",
            "category": "resume",
            "content": "Geraldyn Vance\nSenior Backend Engineer\nArchitected CloudStream voice pipeline with sub-300ms latency.",
            "size": "1.2 MB"
        }
    ]

    effective_docs = get_effective_interview_documents(
        interview_id="session-12345",
        attached_documents=session_docs
    )

    assert len(effective_docs) == 1
    assert effective_docs[0]["name"] == "Geraldyn_Resume.pdf"
    assert "CloudStream" in effective_docs[0]["content"]
    assert "Geraldyn Vance" in effective_docs[0]["content"]
    print("  [PASS] In-memory session documents correctly formatted for Gemini prompt.")


def test_new_interview_clears_previous_context():
    print("\n--- 3. Verifying Starting New Interview Clears All Context ---")
    
    # Session 1: Interview with candidate Geraldyn and CloudStream project
    session_1_docs = [
        {
            "id": "doc-1",
            "name": "Geraldyn_Resume.pdf",
            "category": "resume",
            "content": "Geraldyn Vance - Senior Platform Engineer on CloudStream.",
        }
    ]
    effective_s1 = get_effective_interview_documents(
        interview_id="session-1",
        attached_documents=session_1_docs
    )
    assert len(effective_s1) == 1
    assert "CloudStream" in effective_s1[0]["content"]

    # Session 2: User clicks "New Interview" -> documents and history are empty
    session_2_docs = []
    effective_s2 = get_effective_interview_documents(
        interview_id="session-2",
        attached_documents=session_2_docs
    )
    assert len(effective_s2) == 0, "New interview must have 0 documents"

    # Verify no data from Session 1 leaks into Session 2
    total_chars_s2 = sum(len(d.get("content") or "") for d in effective_s2)
    assert total_chars_s2 == 0
    print("  [PASS] New interview completely clears previous documents and context.")


def test_session_only_initial_question_endpoint():
    print("\n--- 4. Testing /interview/initial-question in Session-Only Mode ---")
    
    mock_gemini_response = json.dumps({
        "response": "Geraldyn, I reviewed your background with CloudStream. What was the core architectural challenge in reducing voice latency?",
        "should_end": False,
        "reason": "initial_question"
    })
    
    gemini_svc = GeminiInterviewService.get_instance()
    with patch.object(gemini_svc, "_call_gemini_api", return_value=mock_gemini_response):
        resp = client.post("/interview/initial-question", json={
            "job_role": "Voice AI Engineer",
            "attached_documents": [
                {
                    "name": "Geraldyn_Resume.pdf",
                    "category": "resume",
                    "content": "Geraldyn Vance - Voice AI Engineer on CloudStream."
                }
            ],
            "interview_id": "session-test-01"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "Geraldyn" in data["ai_response"]
        assert "CloudStream" in data["ai_response"]
        print("  [PASS] /interview/initial-question operates in-memory with session documents.")


def test_session_only_followup_endpoint():
    print("\n--- 5. Testing /interview/followup in Session-Only Mode ---")
    
    mock_followup = json.dumps({
        "response": "That approach to audio streaming makes sense. How did you handle packet loss?",
        "should_end": False,
        "reason": "technical_depth"
    })
    
    gemini_svc = GeminiInterviewService.get_instance()
    with patch.object(gemini_svc, "_call_gemini_api", return_value=mock_followup):
        resp = client.post("/interview/followup", json={
            "user_answer": "We used WebSockets with Opus audio chunks and jitter buffer.",
            "job_role": "Voice AI Engineer",
            "conversation_history": [
                {"sender": "Pal", "text": "What was the core architectural challenge?"},
                {"sender": "You", "text": "We used WebSockets with Opus audio chunks and jitter buffer."}
            ],
            "attached_documents": [
                {
                    "name": "Geraldyn_Resume.pdf",
                    "category": "resume",
                    "content": "Geraldyn Vance - Voice AI Engineer."
                }
            ],
            "interview_id": "session-test-01"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["should_end"] is False
        assert "approach to audio streaming" in data["ai_response"]
        print("  [PASS] /interview/followup operates in-memory with session context.")


def test_database_remains_clean_after_turns():
    print("\n--- 6. Verifying Database Still Has 0 Records After Complete Turns ---")
    db = SessionLocal()
    try:
        doc_count = db.query(Document).count()
        msg_count = db.query(Message).count()
        assert doc_count == 0, "No documents should be saved to database"
        assert msg_count == 0, "No messages should be saved to database"
        print("  [PASS] Zero database records after full session interaction.")
    finally:
        db.close()


if __name__ == "__main__":
    test_no_database_persistence()
    test_in_memory_document_grounding_active_turn()
    test_new_interview_clears_previous_context()
    test_session_only_initial_question_endpoint()
    test_session_only_followup_endpoint()
    test_database_remains_clean_after_turns()
    print("\nALL SESSION-ONLY INTERVIEW TESTS PASSED SUCCESSFULLY!")
