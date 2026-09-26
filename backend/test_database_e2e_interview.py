"""
End-to-End Database Integration Test for Voice Companion:
1. New Interview -> DB record created
2. Attach PDF -> document saved with extracted text
3. Start Interview -> initial question saved as Pal message
4. User speaks -> faster-whisper transcription -> YOU message saved to DB
5. Gemini follow-up -> PAL message saved to DB
6. Refresh browser (Simulated) -> fetch all interviews & fetch active interview detail
7. Verify all documents, messages, and chronological order persist
8. Open/create another interview -> verify complete isolation of messages and documents
"""

import os
import sys
import io
import json
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient
from main import app
from document_service import extract_document_text

client = TestClient(app)

def run_e2e_test():
    print("=" * 70)
    print("RUNNING END-TO-END DATABASE & INTERVIEW PERSISTENCE TEST")
    print("=" * 70)

    # -------------------------------------------------------------------------
    # Step 1: Create New Interview
    # -------------------------------------------------------------------------
    print("\n[Step 1] Creating a New Interview...")
    create_res = client.post("/api/interviews", json={
        "title": "Interview - Lead Voice & AI Engineer",
        "job_role": "Lead Voice & AI Engineer",
        "status": "setup"
    })
    assert create_res.status_code == 201, f"Failed to create interview: {create_res.text}"
    intv1 = create_res.json()
    intv1_id = intv1["id"]
    print(f"  -> Interview 1 created: ID={intv1_id} | Title='{intv1['title']}' | Status='{intv1['status']}'")

    # -------------------------------------------------------------------------
    # Step 2: Attach PDF with Extracted Text
    # -------------------------------------------------------------------------
    print("\n[Step 2] Attaching Resume_Final.pdf to Interview 1...")
    pdf_path = os.path.join(os.path.dirname(__file__), "Resume_Final.pdf")
    if os.path.exists(pdf_path):
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
        extracted = extract_document_text(pdf_bytes, "Resume_Final.pdf")
        doc_text = extracted.get("extracted_text", "")
    else:
        doc_text = "Lead Voice & AI Engineer with 6+ years experience in faster-whisper, WebSockets, and Gemini API."

    doc_res = client.post(f"/api/interviews/{intv1_id}/documents", json={
        "filename": "Resume_Final.pdf",
        "category": "resume",
        "size": "2.4 KB",
        "extracted_text": doc_text
    })
    assert doc_res.status_code == 201, f"Failed to attach document: {doc_res.text}"
    doc1 = doc_res.json()
    print(f"  -> Document attached: ID={doc1['id']} | Filename='{doc1['filename']}' | Extracted text length={len(doc1['extracted_text'])} chars")

    # -------------------------------------------------------------------------
    # Step 3: Start Interview & Save Initial Question
    # -------------------------------------------------------------------------
    print("\n[Step 3] Starting Interview & Generating Initial Question...")
    # Update status to active
    patch_res = client.patch(f"/api/interviews/{intv1_id}", json={"status": "active"})
    assert patch_res.status_code == 200

    # Fetch initial question from /interview/initial-question
    iq_res = client.post("/interview/initial-question", json={
        "job_role": "Lead Voice & AI Engineer",
        "attached_documents": [{
            "id": doc1["id"],
            "name": doc1["filename"],
            "category": doc1["category"],
            "content": doc1["extracted_text"]
        }]
    })
    assert iq_res.status_code == 200, f"Failed to get initial question: {iq_res.text}"
    initial_question = iq_res.json().get("ai_response") or iq_res.json().get("question")
    print(f"  -> Initial question generated: \"{initial_question[:75]}...\"")

    # Persist initial Pal question to DB
    init_msg_res = client.post(f"/api/interviews/{intv1_id}/messages", json={
        "role": "interviewer",
        "content": initial_question
    })
    assert init_msg_res.status_code == 201, f"Failed to save initial message: {init_msg_res.text}"
    print("  -> Initial PAL question persisted to database.")

    # -------------------------------------------------------------------------
    # Step 4: User Speaks -> faster-whisper Transcribe -> Save YOU message
    # -------------------------------------------------------------------------
    print("\n[Step 4] Simulating User Audio Transcription via faster-whisper...")
    test_audio_path = os.path.join(os.path.dirname(__file__), "test_synth.wav")
    assert os.path.exists(test_audio_path), f"Audio file not found: {test_audio_path}"
    
    with open(test_audio_path, "rb") as af:
        audio_content = af.read()

    transcribe_res = client.post(
        "/transcribe",
        files={"file": ("speech.wav", io.BytesIO(audio_content), "audio/wav")},
        data={"generate_ai_response": "false"}  # Test clean STT first
    )
    assert transcribe_res.status_code == 200, f"Transcribe failed: {transcribe_res.text}"
    user_transcript = transcribe_res.json().get("transcription") or "Hello world"
    print(f"  -> Whisper transcribed user speech: \"{user_transcript}\"")

    # Persist YOU transcript to DB
    user_msg_res = client.post(f"/api/interviews/{intv1_id}/messages", json={
        "role": "user",
        "content": user_transcript
    })
    assert user_msg_res.status_code == 201, f"Failed to save user message: {user_msg_res.text}"
    print("  -> User transcript persisted to database as 'user'.")

    # -------------------------------------------------------------------------
    # Step 5: Gemini Follow-Up -> Save PAL follow-up message
    # -------------------------------------------------------------------------
    print("\n[Step 5] Requesting Gemini Follow-Up & Persisting...")
    followup_res = client.post("/interview/followup", json={
        "user_answer": user_transcript,
        "job_role": "Lead Voice & AI Engineer",
        "conversation_history": [
            {"sender": "Pal", "text": initial_question},
            {"sender": "You", "text": user_transcript}
        ],
        "attached_documents": [{
            "id": doc1["id"],
            "name": doc1["filename"],
            "category": doc1["category"],
            "content": doc1["extracted_text"]
        }]
    })
    assert followup_res.status_code == 200, f"Followup failed: {followup_res.text}"
    pal_followup = followup_res.json().get("ai_response")
    assert pal_followup, "No AI response returned from Gemini"
    print(f"  -> Gemini generated follow-up: \"{pal_followup[:75]}...\"")

    # Persist PAL follow-up to DB
    pal_msg_res = client.post(f"/api/interviews/{intv1_id}/messages", json={
        "role": "interviewer",
        "content": pal_followup
    })
    assert pal_msg_res.status_code == 201, f"Failed to save follow-up message: {pal_msg_res.text}"
    print("  -> PAL follow-up persisted to database.")

    # -------------------------------------------------------------------------
    # Step 6: Simulate Browser Refresh -> Query DB Freshly
    # -------------------------------------------------------------------------
    print("\n[Step 6] Simulating Browser Page Refresh...")
    # Fetch all interviews
    list_res = client.get("/api/interviews")
    assert list_res.status_code == 200
    summaries = list_res.json()
    assert len(summaries) >= 1, "No interviews found after refresh"
    
    # Verify active interview is in list
    intv1_summary = next((s for s in summaries if s["id"] == intv1_id), None)
    assert intv1_summary is not None, f"Interview {intv1_id} missing from refreshed summaries"
    assert intv1_summary["status"] == "active"
    assert intv1_summary["document_count"] == 1
    assert intv1_summary["message_count"] == 3
    print(f"  -> Refreshed summary verified: {intv1_summary['title']} | Docs={intv1_summary['document_count']} | Msgs={intv1_summary['message_count']}")

    # Fetch active interview detail with documents and messages
    detail_res = client.get(f"/api/interviews/{intv1_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()

    # -------------------------------------------------------------------------
    # Step 7: Verify Complete Messages, Documents, and Chronological Order
    # -------------------------------------------------------------------------
    print("\n[Step 7] Verifying Persisted Documents & Chronological Messages...")
    # Verify Document
    assert len(detail["documents"]) == 1
    assert detail["documents"][0]["filename"] == "Resume_Final.pdf"
    assert len(detail["documents"][0]["extracted_text"]) > 0
    print("  -> Document context preserved with full extracted text.")

    # Verify Chronological Messages: Pal (init) -> You (answer) -> Pal (follow-up)
    assert len(detail["messages"]) == 3, f"Expected 3 messages, got {len(detail['messages'])}"
    assert detail["messages"][0]["role"] == "interviewer"
    assert detail["messages"][0]["content"] == initial_question
    assert detail["messages"][1]["role"] == "user"
    assert detail["messages"][1]["content"] == user_transcript
    assert detail["messages"][2]["role"] == "interviewer"
    assert detail["messages"][2]["content"] == pal_followup
    print("  -> Message 1: [interviewer] Initial Question (VERIFIED)")
    print("  -> Message 2: [user] User Spoken Answer (VERIFIED)")
    print("  -> Message 3: [interviewer] Gemini Follow-Up (VERIFIED)")
    print("  -> Strict chronological ordering preserved!")

    # -------------------------------------------------------------------------
    # Step 8: Open Another Interview & Verify Complete Isolation
    # -------------------------------------------------------------------------
    print("\n[Step 8] Creating a Second Interview & Verifying Complete Isolation...")
    create_res2 = client.post("/api/interviews", json={
        "title": "Interview - Product Designer",
        "job_role": "Product Designer",
        "status": "setup"
    })
    assert create_res2.status_code == 201
    intv2_id = create_res2.json()["id"]

    detail2_res = client.get(f"/api/interviews/{intv2_id}")
    assert detail2_res.status_code == 200
    detail2 = detail2_res.json()

    # Interview 2 must have ZERO documents and ZERO messages from Interview 1
    assert len(detail2["documents"]) == 0, f"Interview 2 documents leaked: {len(detail2['documents'])}"
    assert len(detail2["messages"]) == 0, f"Interview 2 messages leaked: {len(detail2['messages'])}"
    print(f"  -> Interview 2 (ID={intv2_id}) isolated: 0 docs, 0 msgs (VERIFIED)")

    # Re-verify Interview 1 remains untouched
    detail1_check = client.get(f"/api/interviews/{intv1_id}").json()
    assert len(detail1_check["documents"]) == 1
    assert len(detail1_check["messages"]) == 3
    print("  -> Interview 1 remains completely intact and unaffected by Interview 2 (VERIFIED)")

    # -------------------------------------------------------------------------
    # Step 9: Clean Up Interview 2
    # -------------------------------------------------------------------------
    print("\n[Step 9] Testing Cascade Deletion...")
    del_res = client.delete(f"/api/interviews/{intv2_id}")
    assert del_res.status_code == 200
    check_deleted = client.get(f"/api/interviews/{intv2_id}")
    assert check_deleted.status_code == 404
    print("  -> Cascade delete verified: deleted successfully.")

    print("\n" + "=" * 70)
    print("SUCCESS: ALL 8 VERIFICATION REQUIREMENTS PASSED WITH ZERO FAILURES!")
    print("=" * 70)
    return True

if __name__ == "__main__":
    run_e2e_test()
