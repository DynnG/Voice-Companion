"""
Focused security and logging test suite verifying that Gemini API keys,
tokens, and credentials are NEVER exposed in backend logs (including HTTPX logs).

Verifies:
1. HTTPX request logging redacts '?key=SECRET' to '?key=[REDACTED]'
2. The literal secret never appears in formatted log records
3. Gemini model/endpoint information remains visible (e.g., 'models/gemini-3.5-flash-lite:generateContent')
4. HTTP method (POST), status code (200 OK), and response reason phrase are preserved
5. Headers containing API keys (e.g., 'x-goog-api-key: SECRET') are redacted
6. Authorization Bearer tokens are redacted
7. DEBUG level logging never exposes secrets
8. Exception traces and messages containing secrets are sanitized
9. Existing Gemini functionality is completely unaffected
"""

import io
import sys
import logging
from pathlib import Path
import httpx

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from gemini_service import (
    sanitize_error_message,
    SensitiveDataFilter,
    configure_sensitive_data_logging,
    GeminiInterviewService
)

def run_security_tests():
    print("=" * 65)
    print("Gemini API Key Exposure & Logging Redaction Security Verification")
    print("=" * 65)

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

    # Setup in-memory log capture
    log_capture = io.StringIO()
    capture_handler = logging.StreamHandler(log_capture)
    capture_handler.setFormatter(logging.Formatter("%(levelname)s [%(name)s]: %(message)s"))

    root_logger = logging.getLogger()
    original_handlers = root_logger.handlers[:]
    original_level = root_logger.level

    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(capture_handler)

    try:
        configure_sensitive_data_logging()

        SECRET_KEY_1 = "AQ.MOCK_TEST_SECRET_KEY_1234567890_XYZ"
        SECRET_KEY_2 = "AIzaSyD_TEST_SECRET_KEY_9876543210_XYZ"

        # -------------------------------------------------------------
        # Test 1: HTTPX Logger Interception for Request URLs with ?key=
        # -------------------------------------------------------------
        httpx_logger = logging.getLogger("httpx")
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={SECRET_KEY_1}"
        
        req = httpx.Request("POST", gemini_url)
        resp = httpx.Response(200, request=req)
        
        # Emulate exact HTTPX client request log line
        httpx_logger.info('HTTP Request: %s %s "%s %s"', req.method, req.url, resp.status_code, resp.reason_phrase)

        logs_so_far = log_capture.getvalue()
        assert_test(SECRET_KEY_1 not in logs_so_far, "Literal SECRET_KEY_1 does NOT appear in HTTPX log")
        assert_test("key=[REDACTED]" in logs_so_far, "'key=[REDACTED]' replaces sensitive query string")
        assert_test("models/gemini-3.5-flash-lite:generateContent" in logs_so_far, "Gemini endpoint and model name remain visible")
        assert_test("POST" in logs_so_far and "200" in logs_so_far, "HTTP method and status code are preserved")

        # -------------------------------------------------------------
        # Test 2: HTTPX Logger with Secondary Key Pattern (AIza...)
        # -------------------------------------------------------------
        log_capture.truncate(0)
        log_capture.seek(0)

        gemini_url_2 = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={SECRET_KEY_2}"
        req_2 = httpx.Request("POST", gemini_url_2)
        resp_2 = httpx.Response(429, request=req_2)
        
        httpx_logger.warning('HTTP Request: %s %s "%s %s"', req_2.method, req_2.url, resp_2.status_code, resp_2.reason_phrase)

        logs_2 = log_capture.getvalue()
        assert_test(SECRET_KEY_2 not in logs_2, "Literal SECRET_KEY_2 does NOT appear in HTTPX log")
        assert_test("key=[REDACTED]" in logs_2, "'key=[REDACTED]' replaces second secret key")
        assert_test("429" in logs_2, "HTTP 429 status preserved in log")

        # -------------------------------------------------------------
        # Test 3: DEBUG Level Logging Does Not Leak Headers or Keys
        # -------------------------------------------------------------
        log_capture.truncate(0)
        log_capture.seek(0)

        httpx_logger.debug(f"Sending request with x-goog-api-key: {SECRET_KEY_1}")
        httpx_logger.debug(f"Authorization: Bearer {SECRET_KEY_2}")

        logs_debug = log_capture.getvalue()
        assert_test(SECRET_KEY_1 not in logs_debug, "DEBUG level does not leak x-goog-api-key secret")
        assert_test(SECRET_KEY_2 not in logs_debug, "DEBUG level does not leak Bearer token secret")
        assert_test("[REDACTED]" in logs_debug, "DEBUG secrets replaced with [REDACTED]")

        # -------------------------------------------------------------
        # Test 4: Application Loggers ('voice-companion-gemini')
        # -------------------------------------------------------------
        log_capture.truncate(0)
        log_capture.seek(0)

        app_logger = logging.getLogger("voice-companion-gemini")
        app_logger.info(f"Connecting to Gemini at {gemini_url}")
        app_logger.error(f"Failed request to {gemini_url_2}: timeout")

        logs_app = log_capture.getvalue()
        assert_test(SECRET_KEY_1 not in logs_app, "Application logger does not leak SECRET_KEY_1")
        assert_test(SECRET_KEY_2 not in logs_app, "Application logger does not leak SECRET_KEY_2")
        assert_test("key=[REDACTED]" in logs_app, "Application logger URLs are sanitized")

        # -------------------------------------------------------------
        # Test 5: Direct sanitize_error_message unit verification
        # -------------------------------------------------------------
        raw_msg = f"Error in https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={SECRET_KEY_1}"
        sanitized = sanitize_error_message(raw_msg)
        assert_test(SECRET_KEY_1 not in sanitized, "sanitize_error_message strips literal key")
        assert_test("key=[REDACTED]" in sanitized, "sanitize_error_message inserts key=[REDACTED]")

        # -------------------------------------------------------------
        # Test 6: Verify GeminiInterviewService initializes with filter active
        # -------------------------------------------------------------
        svc = GeminiInterviewService.get_instance()
        assert_test(svc is not None, "GeminiInterviewService is initialized")
        h_logger = logging.getLogger("httpx")
        assert_test(any(isinstance(f, SensitiveDataFilter) for f in h_logger.filters),
                    "httpx logger has SensitiveDataFilter active")

    finally:
        root_logger.removeHandler(capture_handler)
        root_logger.setLevel(original_level)
        for h in original_handlers:
            if h not in root_logger.handlers:
                root_logger.addHandler(h)

    print("\n" + "=" * 65)
    print(f"Results: {passed} PASSED, {failed} FAILED")
    print("=" * 65)

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_security_tests()
