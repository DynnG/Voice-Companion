"""
Test suite verifying MockMate Answer Replay backend architecture:
1. /interview/replay/notes returns concise, actionable coaching notes based on actual question & answer.
2. No confidence metric or arbitrary scores are returned.
3. Gemini error handling (quota, connection error) returns clean unavailable message without breaking flow.
4. /interview/replay/compare properly compares Attempt 1 and Attempt 2 with improvements and still_improve points.
5. Privacy: ZERO audio, transcripts, or replay notes are persisted to SQLite database.
"""
import sys
import os
import json
from pathlib import Path
from unittest.mock import patch

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from gemini_service import GeminiInterviewService, GeminiQuotaExceededError
from database import SessionLocal
from models import Interview, Document, Message
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_replay_notes_success():
    print("\n--- 1. Testing /interview/replay/notes with Mocked Gemini Success ---")
    mock_notes_json = json.dumps({
        "notes": [
            "Strong technical explanation of LRU cache mechanism",
            "Clearly articulated memory footprint reduction",
            "Result could be more specific with measurable throughput numbers",
            "Answer was 42 seconds with steady pace"
        ]
    })

    gemini_svc = GeminiInterviewService.get_instance()
    with patch.object(gemini_svc, "_call_gemini_api", return_value=mock_notes_json) as mock_call:
        resp = client.post("/interview/replay/notes", json={
            "interview_id": "test-session-01",
            "question": "How did you optimize memory usage in the mobile application?",
            "user_answer": "I implemented an LRU cache with eviction based on heap thresholds, cutting GC pauses.",
            "job_role": "Mobile Engineer",
            "duration_seconds": 42.0,
            "attached_documents": [
                {
                    "name": "Resume.pdf",
                    "category": "resume",
                    "content": "Optimized memory in Aura Mobile app."
                }
            ]
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["notes"]) == 4
        assert "LRU cache" in data["notes"][0]
        # Verify no confidence metric
        assert not any("confidence" in n.lower() for n in data["notes"])
        assert "score" not in data

        # Verify Gemini prompt received the actual question and answer
        prompt_sent = mock_call.call_args[1]["contents"][0]["parts"][0]["text"]
        assert "How did you optimize memory usage" in prompt_sent
        assert "LRU cache with eviction" in prompt_sent
        assert "Aura Mobile" in prompt_sent
        print("  [PASS] /interview/replay/notes generated grounded coaching notes with zero confidence metrics.")


def test_replay_notes_gemini_error_handling():
    print("\n--- 2. Testing /interview/replay/notes Gemini Error Handling (Quota Exceeded) ---")
    gemini_svc = GeminiInterviewService.get_instance()
    with patch.object(gemini_svc, "_call_gemini_api", side_effect=GeminiQuotaExceededError("RESOURCE_EXHAUSTED")):
        resp = client.post("/interview/replay/notes", json={
            "interview_id": "test-session-02",
            "question": "Explain how you handle thread contention.",
            "user_answer": "We used lock-free queues with atomic compare-and-swap operations.",
            "job_role": "Backend Engineer",
            "duration_seconds": 35.0
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "error"
        assert data["error_type"] == "quota_exceeded"
        assert data["error_message"] == "AI notes are unavailable right now."
        assert len(data["notes"]) == 0
        print("  [PASS] Gemini quota error returns graceful fallback message without inventing fake notes.")


def test_replay_comparison_success():
    print("\n--- 3. Testing /interview/replay/compare Success ---")
    mock_compare_json = json.dumps({
        "improvements": [
            "Added concrete metrics (reduced p99 latency from 120ms to 45ms)",
            "Clearer architectural explanation of lock-free ring buffer",
            "More concise and structured delivery"
        ],
        "still_improve": [
            "Explain the memory reclamation strategy under high load more clearly"
        ],
        "attempt2_notes": [
            "Strong measurable impact stated upfront",
            "Direct answer addressing the concurrency bottleneck"
        ]
    })

    gemini_svc = GeminiInterviewService.get_instance()
    with patch.object(gemini_svc, "_call_gemini_api", return_value=mock_compare_json) as mock_call:
        resp = client.post("/interview/replay/compare", json={
            "interview_id": "test-session-03",
            "question": "How did you handle thread contention in your messaging pipeline?",
            "attempt1_answer": "We used locks and synchronization to keep things thread safe.",
            "attempt1_duration_seconds": 47.0,
            "attempt2_answer": "We replaced mutex locks with a lock-free ring buffer using atomic CAS operations, reducing p99 latency from 120ms to 45ms.",
            "attempt2_duration_seconds": 39.0,
            "job_role": "Distributed Systems Engineer"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["improvements"]) == 3
        assert len(data["still_improve"]) == 1
        assert len(data["attempt2_notes"]) == 2
        assert "p99 latency" in data["improvements"][0]
        # Verify no numeric improvement score is returned
        assert "improvement_score" not in data
        assert "score" not in data

        # Verify prompt had both attempts
        prompt_sent = mock_call.call_args[1]["contents"][0]["parts"][0]["text"]
        assert "attempt 1" in prompt_sent.lower()
        assert "attempt 2" in prompt_sent.lower()
        assert "mutex locks" in prompt_sent
        assert "lock-free ring buffer" in prompt_sent
        print("  [PASS] /interview/replay/compare generated valid differences without numeric scores.")


def test_replay_comparison_error_handling():
    print("\n--- 4. Testing /interview/replay/compare Error Handling ---")
    gemini_svc = GeminiInterviewService.get_instance()
    with patch.object(gemini_svc, "_call_gemini_api", side_effect=Exception("Connection refused")):
        resp = client.post("/interview/replay/compare", json={
            "question": "What is an index in SQL?",
            "attempt1_answer": "It speeds up lookups.",
            "attempt2_answer": "It creates a B-Tree structure on indexed columns to reduce I/O."
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "error"
        assert data["error_message"] == "AI notes are unavailable right now."
        assert len(data["improvements"]) == 0
        assert len(data["still_improve"]) == 0
        print("  [PASS] Comparison gracefully handles network failures.")


def test_zero_database_persistence():
    print("\n--- 5. Verifying Database Still Has 0 Records After Replay API Calls ---")
    db = SessionLocal()
    try:
        doc_count = db.query(Document).count()
        msg_count = db.query(Message).count()
        assert doc_count == 0, f"Expected 0 documents in database, found {doc_count}"
        assert msg_count == 0, f"Expected 0 messages in database, found {msg_count}"
        print("  [PASS] Confirmed 0 database records. All replay data strictly session-only.")
    finally:
        db.close()


if __name__ == "__main__":
    test_replay_notes_success()
    test_replay_notes_gemini_error_handling()
    test_replay_comparison_success()
    test_replay_comparison_error_handling()
    test_zero_database_persistence()
    print("\nALL ANSWER REPLAY BACKEND TESTS PASSED SUCCESSFULLY!")
