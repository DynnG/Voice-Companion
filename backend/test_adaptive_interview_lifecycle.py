import os
import sys
import re
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))

from main import app
from database import SessionLocal
from models import Interview, Document, Message
from gemini_service import is_wrapup_question

client = TestClient(app)


def test_adaptive_interview_lifecycle():
    # 0. Clean database
    db = SessionLocal()
    db.query(Message).delete()
    db.query(Document).delete()
    db.query(Interview).delete()
    db.commit()
    db.close()

    print("\n=== STARTING ADAPTIVE INTERVIEW LIFECYCLE TEST ===")

    # 1. Create interview session
    res = client.post("/api/interviews", json={
        "job_role": "Senior Cloud Infrastructure Engineer",
        "title": "Interview - Senior Cloud Infrastructure Engineer",
        "status": "active"
    })
    assert res.status_code in (200, 201)
    interview_id = res.json()["id"]

    # 2. Attach Candidate Resume
    resume_text = (
        "Geraldyn Vance - Senior Cloud Infrastructure Engineer\n"
        "Email: geraldyn@example.com\n\n"
        "KEY PROJECTS:\n"
        "1. Project SkyPulse Telemetry:\n"
        "- Engineered distributed telemetry ingestion on Kubernetes with Apache Kafka and Go.\n"
        "- Scaled to 80,000 events/second with sub-10ms delivery latencies.\n\n"
        "2. Project VaultGuard:\n"
        "- Automated secrets rotation and zero-trust mTLS service mesh using HashiCorp Vault and Consul.\n\n"
        "SKILLS: Kubernetes, Kafka, Go, Terraform, HashiCorp Vault, Distributed Systems"
    )
    doc_res_1 = client.post(f"/api/interviews/{interview_id}/documents", json={
        "filename": "Geraldyn_Vance_Resume.pdf",
        "category": "resume",
        "extracted_text": resume_text
    })
    assert doc_res_1.status_code in (200, 201)

    # 3. Attach Job Description
    jd_text = (
        "Job Description: Senior Cloud Infrastructure Engineer\n"
        "Responsibilities:\n"
        "- Design resilient distributed streaming and telemetry pipelines\n"
        "- Enforce infrastructure-as-code and zero-trust service mesh\n"
        "- Lead incident management and latency troubleshooting"
    )
    doc_res_2 = client.post(f"/api/interviews/{interview_id}/documents", json={
        "filename": "Senior_Cloud_Engineer_JD.pdf",
        "category": "job_description",
        "extracted_text": jd_text
    })
    assert doc_res_2.status_code in (200, 201)

    # Step 1: Document-grounded opening question
    init_res = client.post("/interview/initial-question", json={
        "interview_id": interview_id,
        "job_role": "Senior Cloud Infrastructure Engineer"
    })
    assert init_res.status_code == 200
    q1 = init_res.json()["ai_response"]
    print(f"\n[STEP 1: OPENING QUESTION]\n{q1}\n")
    assert len(q1) > 20
    assert "geraldyn" in q1.lower()
    # Save to history & DB
    history = [{"sender": "Pal", "text": q1}]
    client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "interviewer",
        "content": q1
    })

    # Step 2: Candidate answers opening question
    ans_1 = (
        "In Project SkyPulse, we deployed Apache Kafka with Strimzi on Kubernetes. "
        "We tuned consumer groups and partitioned topics across worker nodes to handle 80,000 events per second with zero message loss."
    )
    history.append({"sender": "You", "text": ans_1})
    client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "user",
        "content": ans_1
    })

    # Step 3: Analyze latest answer & relevant follow-up
    followup_res_1 = client.post("/interview/followup", json={
        "interview_id": interview_id,
        "job_role": "Senior Cloud Infrastructure Engineer",
        "user_answer": ans_1,
        "conversation_history": history[:-1]
    })
    assert followup_res_1.status_code == 200
    f1_data = followup_res_1.json()
    q2 = f1_data["ai_response"]
    print(f"\n[STEP 2: FOLLOW-UP QUESTION]\n{q2}\n(should_end={f1_data['should_end']}, reason={f1_data['reason']})\n")
    assert f1_data["should_end"] is False
    assert len(q2) > 20
    history.append({"sender": "Pal", "text": q2})
    client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "interviewer",
        "content": q2
    })

    # Step 4: Candidate answers follow-up
    ans_2 = (
        "When handling node failures, we configured Kafka in-sync replicas to 3 with min.insync.replicas set to 2. "
        "We also wrote custom Go reconciliation controllers to automatically balance topic partitions without degrading consumer lag."
    )
    history.append({"sender": "You", "text": ans_2})
    client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "user",
        "content": ans_2
    })

    # Step 5: Test wrap-up question transition
    # Now simulate PAL asking the ONE meaningful wrap-up question
    wrapup_q = (
        "We've covered your experience with Project SkyPulse, distributed streaming, and failure recovery. "
        "Before we wrap up, is there anything else about your experience, projects, or background that we haven't touched on that you'd like to share?"
    )
    assert is_wrapup_question(wrapup_q) is True
    print(f"\n[STEP 3: MEANINGFUL WRAP-UP QUESTION]\n{wrapup_q}\n(is_wrapup_question=True)\n")
    history.append({"sender": "Pal", "text": wrapup_q})
    client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "interviewer",
        "content": wrapup_q
    })

    # Step 6: Candidate answers the wrap-up question
    wrapup_ans = (
        "I'd also like to mention that I led our team's zero-trust migration with HashiCorp Vault in Project VaultGuard, "
        "which reduced security audit finding remediations from two weeks to under two hours."
    )
    history.append({"sender": "You", "text": wrapup_ans})
    client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "user",
        "content": wrapup_ans
    })

    # Step 7: PAL analyzes wrap-up answer and provides brief professional closing with should_end=true
    closing_res = client.post("/interview/followup", json={
        "interview_id": interview_id,
        "job_role": "Senior Cloud Infrastructure Engineer",
        "user_answer": wrapup_ans,
        "conversation_history": history[:-1]
    })
    assert closing_res.status_code == 200
    closing_data = closing_res.json()
    closing_text = closing_data["ai_response"]
    print(f"\n[STEP 4: BRIEF PROFESSIONAL CLOSING]\n{closing_text}\n(should_end={closing_data['should_end']}, reason={closing_data['reason']})\n")

    # Verification: must conclude now!
    assert closing_data["should_end"] is True, f"Expected should_end=True after wrapup answer, got: {closing_data}"
    assert closing_data["reason"] == "sufficient_coverage"
    # Closing statement must NOT ask another question
    assert "?" not in closing_text, f"Closing statement should not ask another question: {closing_text}"

    # Step 8: Complete interview in database
    client.patch(f"/api/interviews/{interview_id}", json={
        "status": "completed"
    })
    client.post(f"/api/interviews/{interview_id}/messages", json={
        "role": "interviewer",
        "content": closing_text
    })

    # Step 9: Verify persisted state in database
    db_verify = SessionLocal()
    intv = db_verify.query(Interview).filter(Interview.id == interview_id).first()
    assert intv is not None
    assert intv.status == "completed"
    assert len(intv.documents) == 2
    assert len(intv.messages) == 7
    # Messages must be chronological
    timestamps = [m.created_at for m in intv.messages]
    assert timestamps == sorted(timestamps)
    print(f"\n[STEP 5: PERSISTENCE VERIFIED] Interview marked {intv.status}, {len(intv.messages)} messages preserved.")
    db_verify.close()

    # Step 10: Clean up test interview
    client.delete(f"/api/interviews/{interview_id}")
    print("[CLEANUP] Deleted test interview.")

    # Verify clean database
    db_clean = SessionLocal()
    assert db_clean.query(Interview).count() == 0
    assert db_clean.query(Document).count() == 0
    assert db_clean.query(Message).count() == 0
    db_clean.close()
    print("[CLEANUP] Database verified 100% clean.\n")


if __name__ == "__main__":
    test_adaptive_interview_lifecycle()
    print("[SUCCESS] ALL ADAPTIVE INTERVIEW LIFECYCLE TESTS PASSED!")
