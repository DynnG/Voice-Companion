"""
Unit and integration test suite verifying Gemini quota and error handling UX:
1. HTTP 429 / RESOURCE_EXHAUSTED -> error_type: quota_exceeded
   Message: 'AI interviewer is temporarily unavailable because the Gemini API usage limit has been reached. Please try again later.'
2. Network failure -> error_type: connection_error
   Message: 'AI interviewer is temporarily unavailable due to a connection error. Please try again in a moment.'
3. Other API error -> error_type: ai_service_error
   Message: 'AI interviewer is temporarily unavailable due to an AI service error. Please try again in a moment.'
4. No fallback question is ever generated (FALLBACK_FOLLOWUP_QUESTIONS is disabled).
5. Interview remains ACTIVE on any error (never marked COMPLETED).
6. Candidate's latest user answer remains safely persisted in SQLite.
7. Sanitize logs/messages so API keys and secrets are never leaked.
"""
import sys
import os
import json
from pathlib import Path
from unittest.mock import patch, AsyncMock

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from gemini_service import (
    GeminiInterviewService,
    GeminiQuotaExceededError,
    GeminiConnectionError,
    GeminiServiceError,
    classify_gemini_error,
    get_user_friendly_error_message,
    sanitize_error_message,
    FALLBACK_FOLLOWUP_QUESTIONS,
    extract_conversational_text
)
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_classify_gemini_error():
    print("\n--- 1. Testing classify_gemini_error ---")
    
    # 1. HTTP 429 / RESOURCE_EXHAUSTED / Quota
    assert classify_gemini_error(GeminiQuotaExceededError("HTTP 429")) == "quota_exceeded"
    assert classify_gemini_error(RuntimeError("Gemini HTTP 429: RESOURCE_EXHAUSTED")) == "quota_exceeded"
    assert classify_gemini_error(Exception("Quota exceeded for metric: generatelanguage.googleapis.com/generate_content_free_tier_requests")) == "quota_exceeded"
    assert classify_gemini_error(Exception("Rate limit exceeded. Please wait 20s")) == "quota_exceeded"
    assert classify_gemini_error(Exception("429 Too Many Requests")) == "quota_exceeded"

    # 2. Network / Connection failures
    assert classify_gemini_error(GeminiConnectionError("Failed to reach host")) == "connection_error"
    assert classify_gemini_error(ConnectionError("Connection refused by peer")) == "connection_error"
    assert classify_gemini_error(TimeoutError("ConnectTimeout to generativelanguage.googleapis.com")) == "connection_error"
    assert classify_gemini_error(Exception("Network unreachable")) == "connection_error"

    # 3. Other Gemini API errors
    assert classify_gemini_error(GeminiServiceError("500 Internal Server Error")) == "ai_service_error"
    assert classify_gemini_error(Exception("Internal 500 error from Google")) == "ai_service_error"
    assert classify_gemini_error(Exception("HTTP 503 Service Unavailable")) == "ai_service_error"

    # 4. Malformed response
    assert classify_gemini_error(json.JSONDecodeError("Expecting value", "doc", 0)) == "malformed_response"
    assert classify_gemini_error(Exception("Malformed JSON payload")) == "malformed_response"
    
    print("  [PASS] classify_gemini_error correctly identifies quota_exceeded, connection_error, and ai_service_error.")


def test_user_friendly_error_messages():
    print("\n--- 2. Testing user-friendly error messages ---")
    
    quota_msg = get_user_friendly_error_message("quota_exceeded")
    assert quota_msg == "AI interviewer is temporarily unavailable because the Gemini API usage limit has been reached. Please try again later."
    
    conn_msg = get_user_friendly_error_message("connection_error")
    assert conn_msg == "AI interviewer is temporarily unavailable due to a connection error. Please try again in a moment."
    
    srv_msg = get_user_friendly_error_message("ai_service_error")
    assert srv_msg == "AI interviewer is temporarily unavailable due to an AI service error. Please try again in a moment."

    fmt_msg = get_user_friendly_error_message("malformed_response")
    assert fmt_msg == "AI interviewer is temporarily unavailable due to an unexpected response format. Please try again in a moment."
    
    print("  [PASS] Error messages match required user phrasing exactly.")


def test_sanitize_error_message():
    print("\n--- 3. Testing sanitize_error_message (Secret Masking) ---")
    
    leaked_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyD_SECRET_KEY_12345"
    sanitized = sanitize_error_message(leaked_url)
    assert "AIzaSyD_SECRET_KEY_12345" not in sanitized
    assert "key=[REDACTED]" in sanitized

    raw_token = "Error encountered with AQ.Ab8TokenValue789 in header"
    sanitized_tok = sanitize_error_message(raw_token)
    assert "AQ.Ab8TokenValue789" not in sanitized_tok
    print("  [PASS] sanitize_error_message scrubs all API keys and secrets.")


def test_fallback_followup_questions_disabled():
    print("\n--- 4. Verifying FALLBACK_FOLLOWUP_QUESTIONS is disabled ---")
    assert len(FALLBACK_FOLLOWUP_QUESTIONS) == 0, "FALLBACK_FOLLOWUP_QUESTIONS should be empty so no canned questions are ever served."
    print("  [PASS] FALLBACK_FOLLOWUP_QUESTIONS is empty.")


async def test_followup_quota_exceeded():
    print("\n--- 5. Testing generate_interview_followup on HTTP 429 Quota Exhaustion ---")
    
    gemini_svc = GeminiInterviewService.get_instance()
    
    with patch.object(gemini_svc, "_call_gemini_api", side_effect=GeminiQuotaExceededError("Gemini HTTP 429: RESOURCE_EXHAUSTED")):
        result = await gemini_svc.generate_interview_followup(
            user_answer="I built a distributed cache with Redis and FastAPI.",
            conversation_history=[],
            job_role="Senior Backend Engineer",
            interview_id="test-quota-intv"
        )
        
        print("  Followup result on 429:", result)
        assert result["status"] == "error"
        assert result["error_type"] == "quota_exceeded"
        assert result["should_end"] is False, "Interview must NOT be marked complete on quota error"
        assert result["reason"] == "gemini_quota_exceeded"
        assert result["response"] == "AI interviewer is temporarily unavailable because the Gemini API usage limit has been reached. Please try again later."
        assert "How has your previous experience prepared you" not in result["response"], "Must NOT return generic fallback question"
        print("  [PASS] HTTP 429 returns error_type: 'quota_exceeded' and expected usage limit message.")


async def test_followup_connection_error():
    print("\n--- 6. Testing generate_interview_followup on Connection Error ---")
    
    gemini_svc = GeminiInterviewService.get_instance()
    
    with patch.object(gemini_svc, "_call_gemini_api", side_effect=ConnectionError("Failed to reach Gemini host")):
        result = await gemini_svc.generate_interview_followup(
            user_answer="I used PostgreSQL for persistence.",
            conversation_history=[],
            job_role="Backend Developer",
            interview_id="test-net-intv"
        )
        
        print("  Followup result on network error:", result)
        assert result["status"] == "error"
        assert result["error_type"] == "connection_error"
        assert result["should_end"] is False
        assert result["reason"] == "gemini_connection_error"
        assert result["response"] == "AI interviewer is temporarily unavailable due to a connection error. Please try again in a moment."
        print("  [PASS] Network failure returns error_type: 'connection_error' and expected connection notice.")


async def test_followup_ai_service_error():
    print("\n--- 7. Testing generate_interview_followup on Other API Error ---")
    
    gemini_svc = GeminiInterviewService.get_instance()
    
    with patch.object(gemini_svc, "_call_gemini_api", side_effect=GeminiServiceError("Gemini HTTP 500: Internal Server Error")):
        result = await gemini_svc.generate_interview_followup(
            user_answer="I designed microservices in Go.",
            conversation_history=[],
            job_role="Go Developer",
            interview_id="test-srv-intv"
        )
        
        print("  Followup result on service error:", result)
        assert result["status"] == "error"
        assert result["error_type"] == "ai_service_error"
        assert result["should_end"] is False
        assert result["reason"] == "gemini_ai_service_error"
        assert result["response"] == "AI interviewer is temporarily unavailable due to an AI service error. Please try again in a moment."
        print("  [PASS] Other API error returns error_type: 'ai_service_error' and generic AI service notice.")


async def test_initial_question_quota_error():
    print("\n--- 8. Testing generate_initial_question on Quota Error ---")
    
    gemini_svc = GeminiInterviewService.get_instance()
    
    with patch.object(gemini_svc, "_call_gemini_api", side_effect=GeminiQuotaExceededError("Gemini HTTP 429")):
        q = await gemini_svc.generate_initial_question(
            job_role="Data Engineer",
            interview_id="test-quota-init"
        )
        
        print(f"  Initial question on 429: '{q}'")
        assert q == "AI interviewer is temporarily unavailable because the Gemini API usage limit has been reached. Please try again later."
        assert "Welcome!" not in q
        print("  [PASS] Initial question returns clear usage limit message.")


def test_api_endpoints_and_answer_preservation():
    print("\n--- 9. Testing API Endpoints & Candidate Answer Preservation ---")
    
    # Step A: Create an active interview in SQLite
    create_resp = client.post("/api/interviews", json={"title": "Test Quota Session", "job_role": "Platform Engineer", "status": "active"})
    assert create_resp.status_code == 201
    intv_id = create_resp.json()["id"]
    
    # Step B: Record candidate's answer
    candidate_answer = "I migrated our monolithic service to Kubernetes with zero downtime."
    msg_resp = client.post(f"/api/interviews/{intv_id}/messages", json={
        "role": "candidate",
        "content": candidate_answer
    })
    assert msg_resp.status_code == 201
    
    # Step C: Call /interview/followup simulating Gemini 429
    gemini_svc = GeminiInterviewService.get_instance()
    with patch.object(gemini_svc, "_call_gemini_api", side_effect=GeminiQuotaExceededError("Gemini HTTP 429: RESOURCE_EXHAUSTED")):
        followup_resp = client.post("/interview/followup", json={
            "user_answer": candidate_answer,
            "job_role": "Platform Engineer",
            "conversation_history": [{"sender": "You", "text": candidate_answer}],
            "interview_id": intv_id
        })
        
        assert followup_resp.status_code == 200
        data = followup_resp.json()
        print("  Endpoint followup response:", data)
        assert data["status"] == "error"
        assert data["error_type"] == "quota_exceeded"
        assert data["should_end"] is False
        assert data["ai_response"] == "AI interviewer is temporarily unavailable because the Gemini API usage limit has been reached. Please try again later."
    
    # Step D: Verify Interview in DB remains ACTIVE and Candidate Answer is intact
    detail_resp = client.get(f"/api/interviews/{intv_id}")
    assert detail_resp.status_code == 200
    intv_data = detail_resp.json()
    assert intv_data["status"] == "active", "Interview status must remain 'active' so the user can continue later"
    assert len(intv_data["messages"]) >= 1
    assert intv_data["messages"][0]["content"] == candidate_answer
    print("  [PASS] Candidate's answer preserved and interview remains ACTIVE in DB.")
    
    # Clean up test interview
    client.delete(f"/api/interviews/{intv_id}")


if __name__ == "__main__":
    test_classify_gemini_error()
    test_user_friendly_error_messages()
    test_sanitize_error_message()
    test_fallback_followup_questions_disabled()
    import asyncio
    asyncio.run(test_followup_quota_exceeded())
    asyncio.run(test_followup_connection_error())
    asyncio.run(test_followup_ai_service_error())
    asyncio.run(test_initial_question_quota_error())
    test_api_endpoints_and_answer_preservation()
    print("\nALL GEMINI ERROR HANDLING TESTS PASSED SUCCESSFULLY!")
