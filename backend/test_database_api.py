import os
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient
from main import app
from database import Base, engine

client = TestClient(app)

def test_full_database_lifecycle():
    print("=" * 60)
    print("TEST: Database Persistence Lifecycle")
    print("=" * 60)

    # 1. Create a new interview
    res = client.post("/api/interviews", json={
        "title": "Interview - Senior Full Stack Engineer",
        "job_role": "Senior Full Stack Engineer",
        "status": "setup"
    })
    assert res.status_code == 201, f"Create interview failed: {res.text}"
    interview = res.json()
    interview_id = interview["id"]
    print(f"1. Created interview: {interview_id} | {interview['title']}")

    # 2. Attach a document with extracted text
    doc_payload = {
        "filename": "Alex_Resume_2026.pdf",
        "category": "resume",
        "size": "1.2 MB",
        "extracted_text": "Alex is a Senior Full Stack Engineer with expertise in React, FastAPI, and Whisper STT."
    }
    res = client.post(f"/api/interviews/{interview_id}/documents", json=doc_payload)
    assert res.status_code == 201, f"Add document failed: {res.text}"
    doc = res.json()
    print(f"2. Attached document: {doc['id']} | {doc['filename']} (Extracted text length: {len(doc['extracted_text'])} chars)")

    # 3. Add initial question message from interviewer (Pal)
    res = client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "interviewer",
        "content": "Welcome Alex! Could you tell me about your experience scaling real-time audio systems with FastAPI?"
    })
    assert res.status_code == 201, f"Add initial message failed: {res.text}"
    msg1 = res.json()
    print(f"3. Saved initial PAL question: [{msg1['role']}] {msg1['content'][:60]}...")

    # 4. Add user transcript message (YOU)
    res = client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "user",
        "content": "In my last role, I built a sub-400ms speech-to-text pipeline using faster-whisper and Web Audio API."
    })
    assert res.status_code == 201, f"Add user message failed: {res.text}"
    msg2 = res.json()
    print(f"4. Saved YOU transcript: [{msg2['role']}] {msg2['content'][:60]}...")

    # 5. Add follow-up question from interviewer (Pal)
    res = client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "interviewer",
        "content": "That is impressive. How did you optimize Whisper inference time to maintain that sub-400ms target?"
    })
    assert res.status_code == 201, f"Add follow-up message failed: {res.text}"
    msg3 = res.json()
    print(f"5. Saved follow-up PAL question: [{msg3['role']}] {msg3['content'][:60]}...")

    # 6. Update interview status to active
    res = client.patch(f"/api/interviews/{interview_id}", json={"status": "active"})
    assert res.status_code == 200, f"Update status failed: {res.text}"
    print("6. Updated interview status to 'active'")

    # 7. Retrieve full interview detail and verify persistence, document, and chronological message order
    res = client.get(f"/api/interviews/{interview_id}")
    assert res.status_code == 200, f"Get interview failed: {res.text}"
    detail = res.json()
    assert len(detail["documents"]) == 1, f"Expected 1 document, got {len(detail['documents'])}"
    assert detail["documents"][0]["extracted_text"] == doc_payload["extracted_text"]
    assert len(detail["messages"]) == 3, f"Expected 3 messages, got {len(detail['messages'])}"
    assert detail["messages"][0]["role"] == "interviewer"
    assert detail["messages"][1]["role"] == "user"
    assert detail["messages"][2]["role"] == "interviewer"
    print("7. Verified interview details, document context, and message ordering!")

    # 8. Verify list interviews endpoint
    res = client.get("/api/interviews")
    assert res.status_code == 200, f"List interviews failed: {res.text}"
    summaries = res.json()
    target_summary = next((s for s in summaries if s["id"] == interview_id), None)
    assert target_summary is not None, "Interview missing from summary list"
    assert target_summary["message_count"] == 3
    assert target_summary["document_count"] == 1
    print(f"8. Verified interview in summary list (total interviews: {len(summaries)})")

    # 9. Test interview isolation: create a second interview and verify it has 0 messages
    res2 = client.post("/api/interviews", json={
        "title": "Interview - Product Manager",
        "job_role": "Product Manager",
        "status": "setup"
    })
    assert res2.status_code == 201
    intv2_id = res2.json()["id"]
    res2_detail = client.get(f"/api/interviews/{intv2_id}").json()
    assert len(res2_detail["messages"]) == 0
    assert len(res2_detail["documents"]) == 0
    print("9. Verified interview isolation (new interview has 0 messages and 0 documents)")

    # 10. Clean up second interview
    client.delete(f"/api/interviews/{intv2_id}")
    print("10. Deleted second interview successfully")

    print("=" * 60)
    print("ALL DATABASE API TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    test_full_database_lifecycle()
