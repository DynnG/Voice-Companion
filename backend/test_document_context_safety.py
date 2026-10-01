"""
Test suite verifying Document Context Safety and Prompt Integrity:
1. When ZERO documents are attached:
   - Context header explicitly contains 'Candidate Documents: NONE ATTACHED.'
   - Context header contains strict document safety rules prohibiting claiming review or inventing projects.
   - Initial question prompt uses NO-DOCUMENT OPENING DIRECTIVE.
   - Model is prohibited from claiming to review background or inventing projects.
2. When documents ARE attached:
   - Document-grounded behavior remains intact.
   - Prompt contains extracted document materials.
   - Initial question prompt uses DYNAMIC ENTRY POINT (DOCUMENTS ATTACHED).
3. INTERVIEW_SYSTEM_PROMPT alignment:
   - Validates that guidelines explicitly condition document review on actual presence.
"""
import os
import sys
from pathlib import Path
from unittest.mock import patch, AsyncMock

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from gemini_service import GeminiInterviewService, INTERVIEW_SYSTEM_PROMPT
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_context_header_no_documents():
    print("\n--- 1. Testing _build_context_header with ZERO documents ---")
    svc = GeminiInterviewService.get_instance()

    # Case A1: empty list
    header_empty = svc._build_context_header("Software Developer", [])
    assert "Candidate Documents: NONE ATTACHED." in header_empty
    assert "The candidate has not provided a resume, CV, portfolio, or other candidate-background document" in header_empty
    assert "STRICT DOCUMENT SAFETY RULES:" in header_empty
    assert "Do NOT claim or imply that you reviewed a resume, CV, portfolio, or candidate background." in header_empty
    assert "Do NOT invent or hallucinate projects, companies, technologies, achievements, work experience" in header_empty
    assert "Do NOT create fictional document content to make the interview sound personalized." in header_empty
    assert "Attached Candidate Materials" not in header_empty

    # Case A2: None
    header_none = svc._build_context_header("Backend Engineer", None)
    assert "Candidate Documents: NONE ATTACHED." in header_none

    # Case A3: attached documents with 0-length extracted text
    header_blank = svc._build_context_header("Frontend Engineer", [
        {"name": "empty.pdf", "category": "resume", "content": "   ", "extracted_text": ""}
    ])
    assert "Candidate Documents: NONE ATTACHED." in header_blank
    print("  [PASS] Context header correctly emits explicit no-document safety rules.")


def test_context_header_with_documents():
    print("\n--- 2. Testing _build_context_header with attached documents ---")
    svc = GeminiInterviewService.get_instance()

    doc = {
        "name": "Alex_Resume.pdf",
        "category": "resume",
        "content": "Alex Mercer - 5 years experience with Node.js, PostgreSQL, and Redis caching."
    }
    header_doc = svc._build_context_header("Full Stack Developer", [doc])
    assert "Candidate Documents: NONE ATTACHED." not in header_doc
    assert "Attached Candidate Materials (Full Extracted Content):" in header_doc
    assert "Alex_Resume.pdf" in header_doc
    assert "Alex Mercer - 5 years experience with Node.js, PostgreSQL, and Redis caching." in header_doc
    print("  [PASS] Context header correctly includes attached document content.")


async def test_initial_question_prompt_branching():
    print("\n--- 3. Testing generate_initial_question prompt branching ---")
    svc = GeminiInterviewService.get_instance()

    captured_prompts = []

    async def mock_call_api(contents, api_key=None, enforce_json=False, system_instruction=None):
        captured_prompts.append(contents[0]["parts"][0]["text"])
        return '{"response": "Mocked question", "should_end": false, "reason": "initial_question"}'

    with patch.object(svc, "_call_gemini_api", side_effect=mock_call_api):
        # Case A: ZERO documents
        captured_prompts.clear()
        res_nodoc = await svc.generate_initial_question(job_role="Data Engineer", attached_docs=[])
        assert len(captured_prompts) == 1
        prompt_nodoc = captured_prompts[0]

        assert "Candidate Documents: NONE ATTACHED." in prompt_nodoc
        assert "NO-DOCUMENT OPENING DIRECTIVE (ZERO DOCUMENTS ATTACHED):" in prompt_nodoc
        assert "The candidate has NOT provided a resume, CV, portfolio, or background document" in prompt_nodoc
        assert 'Do NOT use phrases such as "I\'ve reviewed your background"' in prompt_nodoc
        assert "Do NOT invent or hallucinate fictional projects" in prompt_nodoc
        assert "Ask a realistic technical, behavioral, or situational interview question based ONLY on the target job role (Data Engineer)" in prompt_nodoc
        assert "DYNAMIC ENTRY POINT (DOCUMENTS ATTACHED)" not in prompt_nodoc
        print("  [PASS] No-document case generates strict anti-hallucination prompt.")

        # Case B: WITH documents
        captured_prompts.clear()
        doc = {
            "name": "Jane_Resume.pdf",
            "category": "resume",
            "content": "Jane Doe. Designed RealTimeStream processing 100k events/sec on Apache Flink."
        }
        res_doc = await svc.generate_initial_question(job_role="Streaming Data Engineer", attached_docs=[doc])
        assert len(captured_prompts) == 1
        prompt_doc = captured_prompts[0]

        assert "Candidate Documents: NONE ATTACHED." not in prompt_doc
        assert "DYNAMIC ENTRY POINT (DOCUMENTS ATTACHED):" in prompt_doc
        assert "Ground the opening question ONLY in information actually present in the attached documents" in prompt_doc
        assert "Jane_Resume.pdf" in prompt_doc
        assert "100k events/sec on Apache Flink" in prompt_doc
        assert "NO-DOCUMENT OPENING DIRECTIVE" not in prompt_doc
        print("  [PASS] Document-attached case grounds opening in actual materials.")


def test_system_prompt_alignment():
    print("\n--- 4. Testing INTERVIEW_SYSTEM_PROMPT alignment ---")
    assert "When candidate documents are attached, questions may be grounded in information actually present in those documents." in INTERVIEW_SYSTEM_PROMPT
    assert "When no candidate documents are attached, never pretend to have reviewed candidate materials and never fabricate candidate-specific details." in INTERVIEW_SYSTEM_PROMPT
    assert "Instead, ask direct role-based technical, behavioral, or situational questions." in INTERVIEW_SYSTEM_PROMPT
    print("  [PASS] INTERVIEW_SYSTEM_PROMPT includes required document-presence conditional rule.")


def test_live_endpoint_no_documents():
    print("\n--- 5. Testing live POST /interview/initial-question with ZERO documents ---")
    res = client.post("/interview/initial-question", json={
        "job_role": "Backend Engineer",
        "attached_documents": []
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "success"
    question = data["ai_response"].lower()
    print(f"  -> Generated Question (No Docs): \"{data['ai_response']}\"")
    
    # Must NOT hallucinate having reviewed a resume or background
    banned_phrases = [
        "i've reviewed your background",
        "i have reviewed your background",
        "according to your resume",
        "in your resume",
        "from your resume",
        "as listed in your resume",
        "as mentioned in your resume",
        "looking at your resume"
    ]
    for phrase in banned_phrases:
        assert phrase not in question, f"Question contained banned phrase '{phrase}': {question}"
    print("  [PASS] No-document response does not claim to have reviewed a resume or background.")


def test_live_endpoint_with_document():
    print("\n--- 6. Testing live POST /interview/initial-question WITH attached document ---")
    res = client.post("/interview/initial-question", json={
        "job_role": "Distributed Systems Engineer",
        "attached_documents": [{
            "name": "CloudPulse_Resume.pdf",
            "category": "resume",
            "content": "Candidate: Sarah Lin. Architected Project CloudPulse telemetry service handling 80,000 WebSocket events/sec using Go and Redis Cluster."
        }]
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "success"
    question = data["ai_response"].lower()
    print(f"  -> Generated Question (Doc Attached): \"{data['ai_response']}\"")
    
    # Must be grounded in actual document project/tech
    assert (
        "cloudpulse" in question
        or "websocket" in question
        or "redis" in question
        or "80,000" in question
        or "telemetry" in question
    ), f"Expected question to reference CloudPulse document content, got: {question}"
    print("  [PASS] Document-attached response correctly references document content.")


if __name__ == "__main__":
    import asyncio
    test_context_header_no_documents()
    test_context_header_with_documents()
    asyncio.run(test_initial_question_prompt_branching())
    test_system_prompt_alignment()
    test_live_endpoint_no_documents()
    test_live_endpoint_with_document()
    print("\n============================================================")
    print("ALL DOCUMENT CONTEXT SAFETY TESTS PASSED SUCCESSFULLY!")
    print("============================================================")
