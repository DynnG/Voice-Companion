import os
import sys
import re
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))

from main import app
from database import SessionLocal
from models import Interview, Document, Message

client = TestClient(app)

RIGID_OPENING_PATTERNS = [
    r"welcome\b",
    r"to get started",
    r"could you walk me through your background",
    r"tell me about yourself",
    r"what motivated you to apply for the",
]


def test_dynamic_interviewer_behavior():
    # 0. Clean database
    db = SessionLocal()
    db.query(Message).delete()
    db.query(Document).delete()
    db.query(Interview).delete()
    db.commit()
    db.close()

    # =========================================================================
    # Test Candidate 1: Geraldyn Vance with Aura Android App & SkyPulse
    # =========================================================================
    res_1 = client.post("/api/interviews", json={
        "job_role": "Senior Mobile & Systems Engineer",
        "title": "Interview - Senior Mobile & Systems Engineer",
        "status": "active"
    })
    assert res_1.status_code in (200, 201)
    intv1_id = res_1.json()["id"]

    resume_1_text = (
        "Geraldyn Vance - Senior Mobile & Systems Engineer\n"
        "Email: geraldyn@example.com\n\n"
        "KEY PROJECTS:\n"
        "1. Aura Android App (Lead Mobile Architect):\n"
        "- Built an offline-first mental wellness Android application in Kotlin using Jetpack Compose and Room DB.\n"
        "- Optimized startup latency by 45% and integrated hardware biometrics for encrypted local storage.\n\n"
        "2. Project SkyPulse Telemetry:\n"
        "- Designed real-time event pipeline streaming 50,000 events/sec with Apache Kafka and Go.\n\n"
        "SKILLS: Kotlin, Jetpack Compose, Android SDK, Go, Kafka, SQLite, Clean Architecture"
    )

    doc_res_1 = client.post(f"/api/interviews/{intv1_id}/documents", json={
        "filename": "Resume_Final.pdf",
        "category": "resume",
        "extracted_text": resume_1_text
    })
    assert doc_res_1.status_code in (200, 201)

    init_res_1 = client.post("/interview/initial-question", json={
        "interview_id": intv1_id,
        "job_role": "Senior Mobile & Systems Engineer"
    })
    assert init_res_1.status_code == 200
    q1 = init_res_1.json()["ai_response"]
    print(f"\n[TEST 1] Candidate 1 Opening Question (Geraldyn Vance):\n{q1}\n")

    lower_q1 = q1.lower()

    # Requirement 1: PAL does NOT begin with rigid generic opening
    for pattern in RIGID_OPENING_PATTERNS:
        assert not re.search(pattern, lower_q1), f"Found rigid opening pattern '{pattern}' in: {q1}"

    # Requirement 2: PAL recognizes candidate name if present
    assert "geraldyn" in lower_q1, f"Expected candidate name 'Geraldyn' in opening question, got: {q1}"

    # Requirement 3: Opening references concrete detail (Aura, Android, SkyPulse, Mobile, Kotlin, etc.)
    has_specific_detail = any(w in lower_q1 for w in ("aura", "android", "skypulse", "kotlin", "mobile", "offline", "compose"))
    assert has_specific_detail, f"Expected opening question to reference project or tech from document, got: {q1}"

    # =========================================================================
    # Test Candidate 2: Different document (Alex Morgan, FinTech / Helios)
    # =========================================================================
    res_2 = client.post("/api/interviews", json={
        "job_role": "FinTech Backend Engineer",
        "title": "Interview - FinTech Backend Engineer",
        "status": "active"
    })
    assert res_2.status_code in (200, 201)
    intv2_id = res_2.json()["id"]

    resume_2_text = (
        "Alex Morgan - FinTech Backend Engineer\n"
        "Email: alex@example.com\n\n"
        "PROJECTS:\n"
        "1. Project Helios Payment Gateway:\n"
        "- Engineered a double-entry ledger transaction engine in Go and PostgreSQL handling $15M daily volume.\n"
        "- Enforced strict idempotency and sub-50ms ACID compliance across distributed payment webhooks.\n"
    )

    doc_res_2 = client.post(f"/api/interviews/{intv2_id}/documents", json={
        "filename": "Alex_Morgan_Resume.pdf",
        "category": "resume",
        "extracted_text": resume_2_text
    })
    assert doc_res_2.status_code in (200, 201)

    init_res_2 = client.post("/interview/initial-question", json={
        "interview_id": intv2_id,
        "job_role": "FinTech Backend Engineer"
    })
    assert init_res_2.status_code == 200
    q2 = init_res_2.json()["ai_response"]
    print(f"\n[TEST 2] Candidate 2 Opening Question (Alex Morgan):\n{q2}\n")

    lower_q2 = q2.lower()
    for pattern in RIGID_OPENING_PATTERNS:
        assert not re.search(pattern, lower_q2), f"Found rigid opening pattern '{pattern}' in candidate 2: {q2}"

    assert "alex" in lower_q2, f"Expected candidate name 'Alex' in opening question, got: {q2}"
    assert "geraldyn" not in lower_q2, "Candidate 1 name leaked into Candidate 2 interview!"
    assert q1 != q2, "Opening questions must be dynamic and different across candidate profiles!"

    # =========================================================================
    # Test Follow-up Turns on Candidate 1 (Same-Topic vs. Topic Transition)
    # =========================================================================
    # Turn 1: User explains Android offline storage
    history = [{"sender": "Pal", "text": q1}]
    ans_1 = (
        "In the Aura Android app, we implemented Room DB with SQLCipher for local encryption. "
        "We used a unidirectional data flow with Kotlin StateFlow so the UI could render offline cached states instantly."
    )
    history.append({"sender": "You", "text": ans_1})

    followup_res_1 = client.post("/interview/followup", json={
        "interview_id": intv1_id,
        "job_role": "Senior Mobile & Systems Engineer",
        "user_answer": ans_1,
        "conversation_history": history[:-1]
    })
    assert followup_res_1.status_code == 200
    f1 = followup_res_1.json()["ai_response"]
    print(f"\n[TEST 3] Same-Topic Follow-up (Aura app probing):\n{f1}\n")

    lower_f1 = f1.lower()
    banned_fillers = ["great answer", "good answer", "thank you for sharing", "thank you for that", "awesome!", "welcome!"]
    for filler in banned_fillers:
        assert filler not in lower_f1, f"Found robotic filler '{filler}' in: {f1}"

    # Turn 2: User answers and concludes Aura topic, prompting topic transition to SkyPulse
    history.append({"sender": "Pal", "text": f1})
    ans_2 = (
        "We achieved sub-20ms database queries through optimized SQLite indexes and biometric key unlocking. "
        "The offline-first sync worked seamlessly across thousands of active sessions."
    )
    history.append({"sender": "You", "text": ans_2})

    transition_res = client.post("/interview/followup", json={
        "interview_id": intv1_id,
        "job_role": "Senior Mobile & Systems Engineer",
        "user_answer": ans_2,
        "conversation_history": history[:-1]
    })
    assert transition_res.status_code == 200
    f2 = transition_res.json()["ai_response"]
    print(f"\n[TEST 4] Topic Transition Follow-up:\n{f2}\n")

    lower_f2 = f2.lower()
    for filler in banned_fillers:
        assert filler not in lower_f2, f"Found robotic filler '{filler}' in: {f2}"

    # =========================================================================
    # Test Clarification: "What project are you talking about?"
    # =========================================================================
    history.append({"sender": "Pal", "text": f2})
    clarif_ans = "What project are you talking about?"
    history.append({"sender": "You", "text": clarif_ans})

    clarif_res = client.post("/interview/followup", json={
        "interview_id": intv1_id,
        "job_role": "Senior Mobile & Systems Engineer",
        "user_answer": clarif_ans,
        "conversation_history": history[:-1]
    })
    assert clarif_res.status_code == 200
    f_clarif = clarif_res.json()["ai_response"]
    print(f"\n[TEST 5] Clarification Answer:\n{f_clarif}\n")
    lower_clarif = f_clarif.lower()
    assert any(p in lower_clarif for p in ("aura", "skypulse", "telemetry", "android")), f"Failed to identify project in clarification: {f_clarif}"

    # =========================================================================
    # Test Wrapup
    # =========================================================================
    wrapup_res = client.post("/interview/followup", json={
        "interview_id": intv1_id,
        "job_role": "Senior Mobile & Systems Engineer",
        "user_answer": "I have to wrap up the interview session now.",
        "conversation_history": history
    })
    assert wrapup_res.status_code == 200
    wrapup_data = wrapup_res.json()
    print(f"[TEST 6] Wrapup Response:\n{wrapup_data['ai_response']}\n(should_end={wrapup_data['should_end']}, reason={wrapup_data['reason']})\n")
    assert wrapup_data["should_end"] is True
    assert wrapup_data["reason"] == "user_requested_end"

    # Cleanup
    client.delete(f"/api/interviews/{intv1_id}")
    client.delete(f"/api/interviews/{intv2_id}")
    print("[TEST] Cleaned up test interviews.")


if __name__ == "__main__":
    test_dynamic_interviewer_behavior()
    print("\n[SUCCESS] ALL DYNAMIC CONVERSATIONAL BEHAVIOR TESTS PASSED!")
