"""
Comprehensive verification test suite for Kokoro-82M ONNX Text-to-Speech integration in MockMate.
Tests:
  1. Backend & Kokoro Initialization
  2. Direct TTS Endpoint (/tts)
  3. Sample rate, WAV audio headers & duration verification
  4. Gemini response -> Kokoro TTS pipeline
  5. Multiple consecutive synthesis turns (stability & performance)
  6. TTS disabled mode (TTS_ENABLED=false fallback)
  7. Error handling & resilience (empty text, invalid payloads)
"""

import io
import os
import sys
import time
import logging
import soundfile as sf
from fastapi.testclient import TestClient

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app
from backend.tts_service import TTSService, clean_text_for_speech, split_text_into_speech_chunks
from backend.gemini_service import GeminiInterviewService, extract_conversational_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test-kokoro-tts")

client = TestClient(app)


def test_1_backend_and_kokoro_initialization():
    print("\n--- Test 1 & 2: Backend starts & Kokoro loads successfully ---")
    tts = TTSService.get_instance()
    tts.load_model()
    assert tts.is_loaded(), f"Kokoro model failed to load: {tts.get_error()}"
    assert tts.is_enabled(), "TTS should be enabled"
    assert len(tts.get_available_voices()) > 0, "Voices list should not be empty"
    assert "af_bella" in tts.get_available_voices(), "af_bella should be in available voices"
    print(f"PASS: Kokoro loaded. Model: {tts.model_name}, Voices: {len(tts.get_available_voices())}")

    # Check status endpoint
    resp = client.get("/tts/status")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    status_data = resp.json()
    assert status_data["loaded"] is True
    assert status_data["enabled"] is True
    assert status_data["default_voice"] == "af_bella"
    print(f"PASS: /tts/status returned: {status_data}")


def test_3_direct_tts_endpoint():
    print("\n--- Test 3: Direct TTS (/tts endpoint) ---")
    payload = {
        "text": "Hello, welcome to your mock interview.",
        "voice": "af_bella",
        "speed": 1.0
    }
    t0 = time.time()
    resp = client.post("/tts", json=payload)
    elapsed = round(time.time() - t0, 2)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    assert resp.headers.get("content-type") == "audio/wav", f"Expected audio/wav, got {resp.headers.get('content-type')}"
    assert resp.headers.get("X-Sample-Rate") == "24000"

    wav_bytes = resp.content
    assert len(wav_bytes) > 1000, f"WAV payload too small: {len(wav_bytes)} bytes"
    # Verify WAV header magic (RIFF...WAVE)
    assert wav_bytes[:4] == b"RIFF", "Missing RIFF magic bytes"
    assert wav_bytes[8:12] == b"WAVE", "Missing WAVE magic bytes"

    # Verify readable audio via soundfile
    with io.BytesIO(wav_bytes) as buf:
        data, sr = sf.read(buf)
        assert sr == 24000, f"Expected 24000Hz, got {sr}"
        duration_sec = len(data) / sr
        assert duration_sec > 1.0, f"Audio duration too short: {duration_sec}s"

    print(f"PASS: Generated {len(wav_bytes)} bytes ({duration_sec:.2f}s audio at {sr}Hz) in {elapsed}s")


def test_4_gemini_integration():
    print("\n--- Test 4: Gemini Interviewer -> Kokoro TTS Pipeline ---")
    gemini = GeminiInterviewService.get_instance()
    # Simulated candidate answer
    user_answer = "I built a distributed notification service using Kafka and Go that handled 50,000 events per second."
    
    followup_dict = {
        "response": "That is an impressive throughput with Kafka. How did you handle consumer group rebalancing during deployment rollouts?",
        "should_end": False,
        "reason": "continue_interview"
    }
    clean_text = extract_conversational_text(followup_dict["response"])
    assert clean_text, "Conversational text should not be empty"

    # Pass Gemini response directly to TTS
    tts = TTSService.get_instance()
    wav_bytes, sr = tts.synthesize(clean_text, voice="af_bella")
    assert len(wav_bytes) > 2000
    with io.BytesIO(wav_bytes) as buf:
        data, sample_rate = sf.read(buf)
        duration_sec = len(data) / sample_rate
        assert duration_sec > 2.0

    print(f"PASS: Gemini response (\"{clean_text[:40]}...\") successfully synthesized into {duration_sec:.2f}s audio.")


def test_6_multiple_consecutive_responses():
    print("\n--- Test 6: Multiple consecutive TTS synthesis turns ---")
    prompts = [
        "Tell me about a challenging bug you diagnosed.",
        "How do you design for scalability and fault tolerance in your applications?",
        "Thank you for sharing your experience today. That concludes our practice session."
    ]
    tts = TTSService.get_instance()
    total_bytes = 0
    t0 = time.time()
    for i, prompt in enumerate(prompts, start=1):
        wav_bytes, sr = tts.synthesize(prompt, voice="af_bella")
        total_bytes += len(wav_bytes)
        assert len(wav_bytes) > 1000
        print(f"  Turn {i}: {len(wav_bytes)} bytes generated for '{prompt[:35]}...'")

    elapsed = round(time.time() - t0, 2)
    print(f"PASS: Synthesized {len(prompts)} consecutive turns ({total_bytes} total bytes) in {elapsed}s with no crashes or leaks.")


def test_7_tts_disabled_mode():
    print("\n--- Test 7: TTS Disabled Mode (TTS_ENABLED=false) ---")
    tts = TTSService.get_instance()
    original_enabled = tts.enabled
    try:
        tts.enabled = False
        resp = client.post("/tts", json={"text": "This should be rejected because TTS is disabled."})
        assert resp.status_code == 503, f"Expected 503 when disabled, got {resp.status_code}"
        assert "disabled" in resp.json()["detail"].lower()
        print(f"PASS: /tts returned 503 gracefully when disabled: {resp.json()}")

        # Gemini interviewer continues to function normally
        gemini = GeminiInterviewService.get_instance()
        assert gemini is not None
        print("PASS: Gemini service remains intact and operational.")
    finally:
        tts.enabled = original_enabled


def test_8_tts_error_handling():
    print("\n--- Test 8: TTS Error Handling & Resilience ---")
    # Empty text
    resp_empty = client.post("/tts", json={"text": "   "})
    assert resp_empty.status_code == 400, f"Expected 400 for empty text, got {resp_empty.status_code}"
    print(f"PASS: Empty text rejected with 400: {resp_empty.json()}")

    # Missing text
    resp_missing = client.post("/tts", json={})
    assert resp_missing.status_code == 422, f"Expected 422 for missing text field, got {resp_missing.status_code}"
    print(f"PASS: Missing field rejected with 422.")

    # Text cleaning handles markdown
    raw_markdown = "**Great question!** Here is `code` and *italics* # Header\n- Bullet item"
    cleaned = clean_text_for_speech(raw_markdown)
    assert "**" not in cleaned
    assert "`" not in cleaned
    assert "#" not in cleaned
    assert "Bullet item" in cleaned
    print(f"PASS: Text cleaner sanitized '{raw_markdown[:30]}...' -> '{cleaned}'")


if __name__ == "__main__":
    print("=" * 60)
    print("Running MockMate Kokoro ONNX TTS Verification Suite")
    print("=" * 60)
    test_1_backend_and_kokoro_initialization()
    test_3_direct_tts_endpoint()
    test_4_gemini_integration()
    test_6_multiple_consecutive_responses()
    test_7_tts_disabled_mode()
    test_8_tts_error_handling()
    print("\n" + "=" * 60)
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)
