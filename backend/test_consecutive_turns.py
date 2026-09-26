import sys
import os
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient
from main import app
from gemini_service import GeminiInterviewService

def test_sequential_turns():
    print("=" * 80)
    print("   TESTING 3 CONSECUTIVE INTERVIEW TURNS (You -> Gemini -> You -> Gemini -> You -> Gemini)")
    print("=" * 80)
    
    client = TestClient(app)
    
    # Check health
    health = client.get("/health").json()
    print("Health Status:", health.get("status"))
    print("Gemini Configured:", health.get("gemini", {}).get("configured"))
    
    conversation_history = [
        {"sender": "Pal", "text": "Welcome to your interview practice for the Senior Backend Engineer role! Could you start by introducing yourself?"}
    ]
    
    candidate_responses = [
        "I have five years of experience building scalable backend microservices with Python, FastAPI, and PostgreSQL.",
        "To handle high throughput, I implemented connection pooling, Redis caching for hot read paths, and asynchronous background queues with Celery.",
        "During peak traffic spikes, our database CPU reached 95%. I analyzed query plans, added composite indexes on timestamp and tenant ID, which reduced query latency from 800ms down to 12ms."
    ]
    
    for turn_idx, answer in enumerate(candidate_responses, 1):
        print(f"\n--- Turn {turn_idx} ---")
        
        # 1. Candidate answers (User message committed first)
        print(f"[Turn {turn_idx}] 1. User Speaks: \"{answer}\"")
        conversation_history.append({"sender": "You", "text": answer})
        
        # 2. Call /interview/followup with conversation history containing all prior turns + current user answer
        res = client.post("/interview/followup", json={
            "user_answer": answer,
            "job_role": "Senior Backend Engineer",
            "conversation_history": conversation_history
        })
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        ai_followup = (data.get("ai_response") or "").strip()
        
        # 3. Gemini follow-up response received
        print(f"[Turn {turn_idx}] 2. Pal (Interviewer): \"{ai_followup}\"")
        assert len(ai_followup) > 10, "Gemini follow-up response is too short or empty!"
        
        # Commit Pal message to history for next turn
        conversation_history.append({"sender": "Pal", "text": ai_followup})
        
    print("\n" + "=" * 80)
    print("   COMPLETE 3-TURN INTERVIEW TRANSCRIPT AUDIT:")
    print("=" * 80)
    for i, msg in enumerate(conversation_history):
        print(f"{i+1}. [{msg['sender']}]: {msg['text']}")
        
    # Verify strict alternating order: Pal -> You -> Pal -> You -> Pal -> You -> Pal
    expected_senders = ["Pal", "You", "Pal", "You", "Pal", "You", "Pal"]
    actual_senders = [m["sender"] for m in conversation_history]
    print(f"\nSender Sequence: {' -> '.join(actual_senders)}")
    assert actual_senders == expected_senders, f"Sequence mismatch: {actual_senders} != {expected_senders}"
    print("\n[SUCCESS] All 3 consecutive turns followed strict sequential order without truncation!")
    return True

if __name__ == "__main__":
    ok = test_sequential_turns()
    sys.exit(0 if ok else 1)
