import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))

from main import app

client = TestClient(app)


def test_interviewer_topic_transition_style():
    # 1. Create a new interview
    interview_res = client.post("/api/interviews", json={
        "job_role": "Lead Distributed Systems Engineer",
        "title": "Interview - Lead Distributed Systems Engineer",
        "status": "active"
    })
    assert interview_res.status_code in (200, 201), interview_res.text
    interview_id = interview_res.json()["id"]
    print(f"\n[TEST] Created Interview: id={interview_id}")

    # 2. Attach a candidate resume document with two distinct projects
    resume_text = (
        "Geraldyn Vance - Lead Distributed Systems Engineer\n"
        "Email: geraldyn@example.com\n\n"
        "PROFESSIONAL EXPERIENCE & PROJECTS:\n\n"
        "1. Project SkyPulse Telemetry Pipeline:\n"
        "- Architected a real-time event pipeline streaming 50,000 telemetry events/sec with Apache Kafka and Go.\n"
        "- Resolved partition consumer lag and backpressure under peak loads.\n\n"
        "2. Project DataVault Security Platform:\n"
        "- Built zero-trust automated secrets rotation across 200 microservices using HashiCorp Vault and mTLS.\n"
        "- Replaced static credentials with dynamic, short-lived tokens and enforced automated certificate rotation.\n\n"
        "TECHNICAL EXPERTISE: Go, Apache Kafka, HashiCorp Vault, Kubernetes, mTLS, AWS"
    )

    doc_res = client.post(f"/api/interviews/{interview_id}/documents", json={
        "filename": "Geraldyn_Vance_Resume.pdf",
        "category": "resume",
        "extracted_text": resume_text
    })
    assert doc_res.status_code in (200, 201), doc_res.text
    print("[TEST] Attached candidate resume with two distinct projects (SkyPulse & DataVault).")

    # 3. Initial Question
    init_res = client.post("/interview/initial-question", json={
        "job_role": "Lead Distributed Systems Engineer",
        "interview_id": interview_id
    })
    assert init_res.status_code == 200, init_res.text
    initial_q = init_res.json()["ai_response"]
    print(f"\n[TEST] Initial Question:\n{initial_q}")
    assert len(initial_q) > 15

    # 4. Turn 1 (Same-topic answer): Candidate answers about Kafka partitioning
    history = [{"sender": "Pal", "text": initial_q}]
    same_topic_ans = (
        "In SkyPulse, we observed consumer lag when partition count didn't match consumer concurrency. "
        "We re-keyed events by aircraft ID and tuned consumer group batch sizes to eliminate partition bottlenecks."
    )
    history.append({"sender": "You", "text": same_topic_ans})

    same_topic_res = client.post("/interview/followup", json={
        "interview_id": interview_id,
        "job_role": "Lead Distributed Systems Engineer",
        "user_answer": same_topic_ans,
        "conversation_history": history[:-1]
    })
    assert same_topic_res.status_code == 200, same_topic_res.text
    same_topic_data = same_topic_res.json()
    followup_1 = same_topic_data["ai_response"]
    print(f"\n[TEST] Same-Topic Follow-Up Response:\n{followup_1}")

    # Verify no generic empty compliments or customer service phrases
    lower_f1 = followup_1.lower()
    banned_fillers = ["thank you for sharing", "thank you for answering", "good answer", "great answer", "awesome", "perfect answer"]
    for filler in banned_fillers:
        assert filler not in lower_f1, f"Found banned filler '{filler}' in same-topic follow-up: {followup_1}"

    # Verify should_end is False
    assert not same_topic_data["should_end"]

    # 5. Turn 2 (Topic transition): Candidate finishes explaining SkyPulse results and moves on
    history.append({"sender": "Pal", "text": followup_1})
    completion_ans = (
        "That stabilized our consumer lag to under 15 milliseconds across all partitions, "
        "and the telemetry pipeline ran with zero drops through peak holiday flight traffic."
    )
    history.append({"sender": "You", "text": completion_ans})

    transition_res = client.post("/interview/followup", json={
        "interview_id": interview_id,
        "job_role": "Lead Distributed Systems Engineer",
        "user_answer": completion_ans,
        "conversation_history": history[:-1]
    })
    assert transition_res.status_code == 200, transition_res.text
    transition_data = transition_res.json()
    followup_2 = transition_data["ai_response"]
    print(f"\n[TEST] Follow-Up 2 (Topic Transition or Deep Probe):\n{followup_2}")

    lower_f2 = followup_2.lower()
    for filler in banned_fillers:
        assert filler not in lower_f2, f"Found banned filler '{filler}' in response: {followup_2}"

    # 6. Verify wrapup request handling
    history.append({"sender": "Pal", "text": followup_2})
    wrapup_ans = "I need to conclude our practice interview session now."
    history.append({"sender": "You", "text": wrapup_ans})

    wrapup_res = client.post("/interview/followup", json={
        "interview_id": interview_id,
        "job_role": "Lead Distributed Systems Engineer",
        "user_answer": wrapup_ans,
        "conversation_history": history[:-1]
    })
    assert wrapup_res.status_code == 200, wrapup_res.text
    wrapup_data = wrapup_res.json()
    print(f"\n[TEST] Wrapup Response:\n{wrapup_data['ai_response']}\n(should_end={wrapup_data['should_end']}, reason={wrapup_data['reason']})")
    assert wrapup_data["should_end"] is True
    assert wrapup_data["reason"] == "user_requested_end"

    # Cleanup
    client.delete(f"/api/interviews/{interview_id}")
    print(f"\n[TEST] Cleaned up interview {interview_id}")


if __name__ == "__main__":
    test_interviewer_topic_transition_style()
    print("\n[SUCCESS] ALL TOPIC TRANSITION TESTS PASSED!")
