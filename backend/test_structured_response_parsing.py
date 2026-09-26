"""
Comprehensive test suite verifying Gemini structured response parsing:
- Natural conversational text extraction (no JSON, code fences, or braces in PAL response)
- Support for JSON returned normally
- Support for JSON wrapped in ```json ... ``` markdown fences
- Support for plain text (non-JSON) responses
- should_end=false / should_end=true interview flow behavior
- Backend endpoints /interview/initial-question and /interview/followup contracts
"""
import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from gemini_service import (
    extract_conversational_text,
    parse_gemini_interview_json
)
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_markdown_and_json_parsing():
    print("--- 1. Testing extract_conversational_text on various Gemini response formats ---")

    # Format A: Normal JSON
    normal_json = """{
  "response": "Welcome Geraldyn! Could you walk me through your background?",
  "should_end": false,
  "reason": "continue_interview"
}"""
    res_a = extract_conversational_text(normal_json)
    print(f"Normal JSON -> '{res_a}'")
    assert res_a == "Welcome Geraldyn! Could you walk me through your background?"
    assert "{" not in res_a and "}" not in res_a and "```" not in res_a
    print("  [PASS] Normal JSON parsed to clean conversational text.")

    # Format B: JSON inside ```json ... ``` markdown code block
    fenced_json = """```json
{
  "response": "That is an impressive project. How did you handle latency issues?",
  "should_end": false,
  "reason": "continue_interview"
}
```"""
    res_b = extract_conversational_text(fenced_json)
    print(f"Fenced JSON -> '{res_b}'")
    assert res_b == "That is an impressive project. How did you handle latency issues?"
    assert "```" not in res_b and "{" not in res_b
    print("  [PASS] Markdown-fenced JSON (```json) parsed to clean conversational text.")

    # Format C: JSON inside ``` ... ``` without language tag
    fenced_no_tag = """```
{
  "response": "Could you tell me how you collaborate with designers?",
  "should_end": false,
  "reason": "continue_interview"
}
```"""
    res_c = extract_conversational_text(fenced_no_tag)
    print(f"Untagged fence -> '{res_c}'")
    assert res_c == "Could you tell me how you collaborate with designers?"
    print("  [PASS] Untagged markdown fence parsed cleanly.")

    # Format D: Markdown fence with preamble or postscript commentary
    messy_fence = """Here is the next interview question:
```json
{
  "response": "Thank you for explaining that. What was the outcome of that migration?",
  "should_end": false,
  "reason": "continue_interview"
}
```
Let me know if you would like me to probe further."""
    res_d = extract_conversational_text(messy_fence)
    print(f"Preamble fence -> '{res_d}'")
    assert res_d == "Thank you for explaining that. What was the outcome of that migration?"
    assert "Here is" not in res_d
    print("  [PASS] Markdown fence with surrounding commentary parsed cleanly.")

    # Format E: Normal conversational plain text (non-JSON)
    plain_text = "Welcome to your mock interview! Let's begin by discussing your background."
    res_e = extract_conversational_text(plain_text)
    print(f"Plain text -> '{res_e}'")
    assert res_e == plain_text
    print("  [PASS] Normal plain text response preserved unchanged.")

    # Format F: Closing statement with should_end=true
    closing_json = """```json
{
  "response": "Thank you Geraldyn for your time today. That concludes our interview practice session.",
  "should_end": true,
  "reason": "sufficient_coverage"
}
```"""
    res_f = extract_conversational_text(closing_json)
    print(f"Closing JSON -> '{res_f}'")
    assert res_f == "Thank you Geraldyn for your time today. That concludes our interview practice session."
    print("  [PASS] Closing response parsed cleanly.")


def test_parse_gemini_interview_json_behavior():
    print("\n--- 2. Testing parse_gemini_interview_json should_end and reason behavior ---")

    # Case 1: Active turn (should_end=False)
    turn_json = """```json
{
  "response": "How do you optimize SQLite query performance?",
  "should_end": false,
  "reason": "continue_interview"
}
```"""
    out1 = parse_gemini_interview_json(
        raw_text=turn_json,
        clean_answer="I use indexes and prepared statements.",
        user_wants_to_end=False,
        user_turn_count=2,
        candidate_name="Geraldyn"
    )
    assert out1["response"] == "How do you optimize SQLite query performance?"
    assert out1["should_end"] is False
    assert out1["reason"] == "continue_interview"
    assert "{" not in out1["response"]
    print("  [PASS] should_end=false continues interview and exposes ONLY natural question text.")

    # Case 2: Natural completion (should_end=True)
    done_json = """```json
{
  "response": "Thank you Geraldyn, you demonstrated excellent depth in distributed systems. Best of luck!",
  "should_end": true,
  "reason": "sufficient_coverage"
}
```"""
    out2 = parse_gemini_interview_json(
        raw_text=done_json,
        clean_answer="I believe strong test automation and code reviews are essential.",
        user_wants_to_end=False,
        user_turn_count=4,
        candidate_name="Geraldyn"
    )
    assert out2["response"] == "Thank you Geraldyn, you demonstrated excellent depth in distributed systems. Best of luck!"
    assert out2["should_end"] is True
    assert out2["reason"] == "sufficient_coverage"
    print("  [PASS] should_end=true concludes interview with clean closing statement.")

    # Case 3: Probing short answer
    bad_end_json = """{
  "response": "Thank you. Bye.",
  "should_end": true,
  "reason": "sufficient_coverage"
}"""
    out3 = parse_gemini_interview_json(
        raw_text=bad_end_json,
        clean_answer="yes",
        user_wants_to_end=False,
        user_turn_count=2,
        candidate_name="Geraldyn"
    )
    assert out3["should_end"] is False
    assert out3["reason"] == "probing_short_answer"
    print("  [PASS] Short answer probing strictly enforces should_end=False.")


def test_api_endpoints_return_clean_text():
    print("\n--- 3. Testing Backend Endpoints Return ONLY Natural Text ---")

    # Test /interview/followup endpoint
    payload = {
        "user_answer": "I built high-throughput web applications using FastAPI and React.",
        "job_role": "Full Stack Engineer",
        "conversation_history": [
            {"sender": "Pal", "text": "Tell me about your tech stack."},
            {"sender": "You", "text": "I built high-throughput web applications using FastAPI and React."}
        ],
        "attached_documents": []
    }
    resp = client.post("/interview/followup", json=payload)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    ai_resp = data.get("ai_response", "")
    print(f"/interview/followup response: '{ai_resp}'")
    assert "{" not in ai_resp and "}" not in ai_resp
    assert "```" not in ai_resp
    assert '"response"' not in ai_resp
    assert '"should_end"' not in ai_resp
    assert isinstance(data.get("should_end"), bool)
    assert isinstance(data.get("reason"), str)
    print("  [PASS] /interview/followup endpoint returns clean conversational text with internal fields.")

    # Test /interview/initial-question endpoint
    init_payload = {
        "job_role": "Full Stack Engineer",
        "attached_documents": []
    }
    resp_init = client.post("/interview/initial-question", json=init_payload)
    assert resp_init.status_code == 200, f"Expected 200, got {resp_init.status_code}: {resp_init.text}"
    init_data = resp_init.json()
    init_q = init_data.get("question", "")
    print(f"/interview/initial-question: '{init_q}'")
    assert "{" not in init_q and "}" not in init_q
    assert "```" not in init_q
    assert '"response"' not in init_q
    print("  [PASS] /interview/initial-question endpoint returns clean conversational text.")


if __name__ == "__main__":
    print("Running Gemini Structured-Response Verification Tests...\n")
    test_markdown_and_json_parsing()
    test_parse_gemini_interview_json_behavior()
    test_api_endpoints_return_clean_text()
    print("\n>>> ALL GEMINI STRUCTURED-RESPONSE PARSING TESTS PASSED! <<<")
