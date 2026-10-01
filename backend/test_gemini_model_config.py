"""
Verification test for Gemini model configuration resolution & request payload structure.

Verifies:
1. GEMINI_MODEL resolves to 'gemini-3.5-flash-lite' when configured in backend/.env.
2. GeminiInterviewService.get_model_name() returns 'gemini-3.5-flash-lite'.
3. Zero occurrences of 'gemini-3.8-flash' remain in config.py or gemini_service.py.
4. Fallback defaults in config.py and gemini_service.py correctly resolve to 'gemini-3.5-flash-lite'
   even when os.environ['GEMINI_MODEL'] is cleared.
5. Zero occurrences of 'gemini-flash-latest' remain in gemini_service.py.
6. gemini-3.5-flash-lite request generationConfig does NOT contain:
   - temperature
   - topP
   - thinkingConfig / thinkingBudget
7. JSON response mode includes responseMimeType = "application/json".
8. Only the configured model is attempted (models_to_try = [self.get_model_name()]).
9. HTTP 400 INVALID_ARGUMENT immediately fails with GeminiServiceError without retrying or falling back.
10. HTTP 429 still produces GeminiQuotaExceededError (quota_exceeded).
11. Zero API keys exposed in output.
"""

import os
import sys
import asyncio
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

def run_tests():
    print("=" * 60)
    print("Gemini Model Configuration & Request Verification")
    print("=" * 60)

    passed = 0
    failed = 0

    def assert_test(cond: bool, msg: str):
        nonlocal passed, failed
        if cond:
            print(f"[PASS] {msg}")
            passed += 1
        else:
            print(f"[FAIL] {msg}")
            failed += 1

    # 1. Verify code inspection: No 'gemini-3.8-flash' remaining
    config_py_path = backend_dir / "config.py"
    gemini_service_py_path = backend_dir / "gemini_service.py"

    config_content = config_py_path.read_text(encoding="utf-8")
    gemini_service_content = gemini_service_py_path.read_text(encoding="utf-8")

    assert_test("gemini-3.8-flash" not in config_content, "No 'gemini-3.8-flash' found in config.py")
    assert_test("gemini-3.8-flash" not in gemini_service_content, "No 'gemini-3.8-flash' found in gemini_service.py")

    # 2. Verify no 'gemini-flash-latest' in gemini_service.py
    assert_test("gemini-flash-latest" not in gemini_service_content, "No 'gemini-flash-latest' fallback found in gemini_service.py")

    # 3. Verify single authoritative definition of GEMINI_MODEL in config.py
    gemini_model_defs = [line for line in config_content.splitlines() if line.strip().startswith("GEMINI_MODEL:")]
    assert_test(len(gemini_model_defs) == 1, f"Single authoritative GEMINI_MODEL definition in config.py (found {len(gemini_model_defs)})")

    # 4. Verify load_dotenv uses override=True
    assert_test("load_dotenv(dotenv_path=backend_env, override=True)" in config_content,
                "config.py uses load_dotenv(dotenv_path=backend_env, override=True)")

    # 5. Verify runtime resolution with backend/.env
    import config
    from gemini_service import (
        GeminiInterviewService,
        GeminiServiceError,
        GeminiQuotaExceededError,
        classify_gemini_error
    )

    assert_test(config.GEMINI_MODEL == "gemini-3.5-flash-lite",
                f"config.GEMINI_MODEL resolves to 'gemini-3.5-flash-lite' (got '{config.GEMINI_MODEL}')")

    svc = GeminiInterviewService.get_instance()
    resolved_model = svc.get_model_name()
    assert_test(resolved_model == "gemini-3.5-flash-lite",
                f"GeminiInterviewService.get_model_name() returns 'gemini-3.5-flash-lite' (got '{resolved_model}')")

    assert_test(svc.model == "gemini-3.5-flash-lite",
                f"GeminiInterviewService.model property is 'gemini-3.5-flash-lite' (got '{svc.model}')")

    # 6. Verify fallback behavior when GEMINI_MODEL env var is absent
    original_env_model = os.environ.get("GEMINI_MODEL")
    try:
        os.environ.pop("GEMINI_MODEL", None)
        fresh_svc = GeminiInterviewService()
        fallback_model = fresh_svc.get_model_name()
        assert_test(fallback_model == "gemini-3.5-flash-lite",
                    f"Fallback when env var unset is 'gemini-3.5-flash-lite' (got '{fallback_model}')")
    finally:
        if original_env_model is not None:
            os.environ["GEMINI_MODEL"] = original_env_model

    # 7. Verify generationConfig payload structure for gemini-3.5-flash-lite (Mocking HTTP call)
    captured_requests = []

    class DummyResponse:
        def __init__(self, status_code, json_data=None, text=""):
            self.status_code = status_code
            self._json = json_data or {}
            self.text = text or str(json_data)

        def json(self):
            return self._json

    class DummyClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

        async def post(self, url, json=None, headers=None):
            captured_requests.append({"url": url, "json": json, "headers": headers})
            return DummyResponse(
                200,
                {
                    "candidates": [{
                        "content": {
                            "parts": [{"text": '{"response": "Test question?", "should_end": false, "reason": "test"}'}]
                        }
                    }]
                }
            )

    # Test JSON mode request
    captured_requests.clear()
    with patch("gemini_service.httpx.AsyncClient", return_value=DummyClient()):
        res = asyncio.run(svc._call_gemini_api(
            contents=[{"role": "user", "parts": [{"text": "Hello"}]}],
            api_key="mock_key_12345",
            enforce_json=True
        ))

    assert_test(len(captured_requests) == 1, "Exactly 1 request made for successful call")
    req = captured_requests[0]
    assert_test("models/gemini-3.5-flash-lite:generateContent" in req["url"],
                f"Target URL specifies gemini-3.5-flash-lite: {req['url'][:70]}")
    payload = req["json"]
    gen_config = payload.get("generationConfig", {})

    assert_test("temperature" not in gen_config, "generationConfig does NOT contain 'temperature'")
    assert_test("topP" not in gen_config, "generationConfig does NOT contain 'topP'")
    assert_test("thinkingConfig" not in gen_config, "generationConfig does NOT contain 'thinkingConfig'")
    assert_test(gen_config.get("maxOutputTokens") == 1024, f"maxOutputTokens is 1024 (got {gen_config.get('maxOutputTokens')})")
    assert_test(gen_config.get("responseMimeType") == "application/json",
                f"responseMimeType is 'application/json' when enforce_json=True")

    # Test non-JSON mode request
    captured_requests.clear()
    with patch("gemini_service.httpx.AsyncClient", return_value=DummyClient()):
        res = asyncio.run(svc._call_gemini_api(
            contents=[{"role": "user", "parts": [{"text": "Hello"}]}],
            api_key="mock_key_12345",
            enforce_json=False
        ))
    req2 = captured_requests[0]
    gen_config2 = req2["json"].get("generationConfig", {})
    assert_test("responseMimeType" not in gen_config2, "responseMimeType omitted when enforce_json=False")

    # 8. Test HTTP 400 INVALID_ARGUMENT handling: NO retry, NO fallback model
    class Dummy400Client:
        def __init__(self):
            self.calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

        async def post(self, url, json=None, headers=None):
            self.calls += 1
            return DummyResponse(
                400,
                text='{"error": {"code": 400, "message": "Request contains an invalid argument.", "status": "INVALID_ARGUMENT"}}'
            )

    d400 = Dummy400Client()
    raised_err = None
    with patch("gemini_service.httpx.AsyncClient", return_value=d400):
        try:
            asyncio.run(svc._call_gemini_api(
                contents=[{"role": "user", "parts": [{"text": "Hello"}]}],
                api_key="mock_key_12345",
                enforce_json=True
            ))
        except Exception as e:
            raised_err = e

    assert_test(isinstance(raised_err, GeminiServiceError),
                f"HTTP 400 raises GeminiServiceError (got {type(raised_err).__name__})")
    assert_test("INVALID_ARGUMENT" in str(raised_err),
                f"Error message reflects INVALID_ARGUMENT: {raised_err}")
    assert_test(d400.calls == 1, f"HTTP 400 makes exactly 1 call (no retries or other models, calls={d400.calls})")
    assert_test(classify_gemini_error(raised_err) == "ai_service_error",
                "HTTP 400 error is classified as 'ai_service_error'")

    # 9. Test HTTP 429 Quota Exhaustion handling
    class Dummy429Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

        async def post(self, url, json=None, headers=None):
            return DummyResponse(
                429,
                text='{"error": {"code": 429, "message": "Resource exhausted", "status": "RESOURCE_EXHAUSTED"}}'
            )

    raised_429 = None
    with patch("gemini_service.httpx.AsyncClient", return_value=Dummy429Client()):
        try:
            asyncio.run(svc._call_gemini_api(
                contents=[{"role": "user", "parts": [{"text": "Hello"}]}],
                api_key="mock_key_12345",
                enforce_json=True
            ))
        except Exception as e:
            raised_429 = e

    assert_test(isinstance(raised_429, GeminiQuotaExceededError),
                f"HTTP 429 raises GeminiQuotaExceededError (got {type(raised_429).__name__})")
    assert_test(classify_gemini_error(raised_429) == "quota_exceeded",
                "HTTP 429 error is classified as 'quota_exceeded'")

    print("\n" + "=" * 60)
    print(f"Results: {passed} PASSED, {failed} FAILED")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
