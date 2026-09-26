import os
import sys
import uuid
from fastapi.testclient import TestClient

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(__file__))

from main import app
from database import get_db, Base, engine
from models import Interview, Document, Message

client = TestClient(app)


def test_document_grounded_interview_flow():
    # 1. Create a new interview
    interview_res = client.post("/api/interviews", json={
        "job_role": "Senior Cloud Infrastructure Engineer",
        "title": "Interview - Senior Cloud Infrastructure Engineer",
        "status": "active"
    })
    assert interview_res.status_code in (200, 201), interview_res.text
    interview_data = interview_res.json()
    interview_id = interview_data["id"]
    print(f"\n[TEST] Created Interview: id={interview_id}")

    # 2. Attach a candidate resume document with rich project & metrics details to SQLite
    sample_resume_content = (
        "Geraldyn Vance - Lead Cloud & Distributed Systems Engineer\n"
        "Email: geraldyn@example.com | Phone: +1-555-0199\n\n"
        "PROFESSIONAL SUMMARY\n"
        "Lead Infrastructure Engineer with 8+ years designing high-throughput distributed systems.\n\n"
        "KEY PROJECTS:\n"
        "1. Project SkyPulse Flight Monitor (Lead Architect):\n"
        "- Built a real-time flight tracking telemetry pipeline processing 45,000 events/second using Apache Kafka and Go.\n"
        "- Reduced latency from 1.2s to 85ms across 12 distributed Kubernetes clusters on AWS EKS.\n"
        "- Implemented zero-downtime multi-region failover using Envoy proxies and Terraform.\n\n"
        "2. Project DataVault Zero-Trust Security:\n"
        "- Automated secrets rotation and mTLS encryption between 200+ microservices using HashiCorp Vault.\n\n"
        "TECHNICAL SKILLS:\n"
        "Kubernetes, Go, Kafka, AWS, Terraform, Docker, Python, PostgreSQL"
    )

    doc_res = client.post(f"/api/interviews/{interview_id}/documents", json={
        "filename": "Geraldyn_Vance_Resume.pdf",
        "category": "resume",
        "extracted_text": sample_resume_content
    })
    assert doc_res.status_code in (200, 201), doc_res.text
    print(f"[TEST] Attached document with extracted_text ({len(sample_resume_content)} chars)")

    # 3. Test /interview/initial-question with interview_id
    # Frontend passes interview_id; documents can even be empty in payload because backend fetches from SQLite
    init_res = client.post("/interview/initial-question", json={
        "job_role": "Senior Cloud Infrastructure Engineer",
        "interview_id": interview_id,
        "attached_documents": []  # tests that SQLite authoritative fetch works!
    })
    assert init_res.status_code == 200, init_res.text
    init_data = init_res.json()
    init_question = init_data["ai_response"]
    print(f"[TEST] Initial Question:\n{init_question}\n")
    assert len(init_question) > 20
    # Should naturally recognize Geraldyn
    assert "geraldyn" in init_question.lower() or "cloud" in init_question.lower()

    # 4. Test /interview/followup with candidate answer
    followup_1 = client.post("/interview/followup", json={
        "interview_id": interview_id,
        "job_role": "Senior Cloud Infrastructure Engineer",
        "user_answer": "I led the development of our telemetry pipeline where we had to handle high throughput data streams with minimal latency.",
        "conversation_history": [
            {"sender": "Pal", "text": init_question}
        ],
        "attached_documents": []  # backend loads from SQLite
    })
    assert followup_1.status_code == 200, followup_1.text
    f1_data = followup_1.json()
    print(f"[TEST] Follow-up 1 Response:\n{f1_data['ai_response']}\n(should_end={f1_data['should_end']}, reason={f1_data['reason']})\n")
    assert not f1_data["should_end"]
    # Check that PAL's response does NOT contain JSON or markdown fences
    assert "```" not in f1_data["ai_response"]
    assert '{"response"' not in f1_data["ai_response"]

    # 5. Test CLARIFICATION: "What project are you talking about?"
    # Candidate asks PAL for clarification on which project PAL is referring to
    clarification_res = client.post("/interview/followup", json={
        "interview_id": interview_id,
        "job_role": "Senior Cloud Infrastructure Engineer",
        "user_answer": "What project are you talking about?",
        "conversation_history": [
            {"sender": "Pal", "text": init_question},
            {"sender": "You", "text": "I led the development of our telemetry pipeline."},
            {"sender": "Pal", "text": f1_data["ai_response"]}
        ],
        "attached_documents": []
    })
    assert clarification_res.status_code == 200, clarification_res.text
    clarif_data = clarification_res.json()
    clarif_text = clarif_data["ai_response"]
    print(f"[TEST] Clarification Response to 'What project are you talking about?':\n{clarif_text}\n")
    assert not clarif_data["should_end"]
    # PAL MUST identify the specific project/document context
    assert (
        "skypulse" in clarif_text.lower()
        or "flight" in clarif_text.lower()
        or "datavault" in clarif_text.lower()
        or "telemetry" in clarif_text.lower()
        or "resume" in clarif_text.lower()
    ), f"Expected project identification in response, got: {clarif_text}"

    # 6. Test User explicit wrap up request
    wrapup_res = client.post("/interview/followup", json={
        "interview_id": interview_id,
        "job_role": "Senior Cloud Infrastructure Engineer",
        "user_answer": "Thank you, but I have to wrap up the interview now.",
        "conversation_history": [
            {"sender": "Pal", "text": init_question},
            {"sender": "You", "text": "I led the development of our telemetry pipeline."},
            {"sender": "Pal", "text": f1_data["ai_response"]}
        ],
        "attached_documents": []
    })
    assert wrapup_res.status_code == 200, wrapup_res.text
    wrapup_data = wrapup_res.json()
    print(f"[TEST] Wrapup Response:\n{wrapup_data['ai_response']}\n(should_end={wrapup_data['should_end']}, reason={wrapup_data['reason']})\n")
    assert wrapup_data["should_end"] is True
    assert wrapup_data["reason"] == "user_requested_end"

    # Cleanup test interview
    client.delete(f"/api/interviews/{interview_id}")
    print(f"[TEST] Cleaned up interview {interview_id}")


if __name__ == "__main__":
    test_document_grounded_interview_flow()
    print("\n[SUCCESS] ALL TESTS PASSED SUCCESSFULLY!")
