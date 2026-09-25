import os
import io
import sys
import time
import subprocess
import numpy as np
from typing import Dict, Any, List

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.main import app
from backend.stt_service import decode_audio_bytes

AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_audio_samples")
os.makedirs(AUDIO_DIR, exist_ok=True)

def generate_speech_wav(text: str, filename: str) -> str:
    path = os.path.join(AUDIO_DIR, filename)
    if not os.path.exists(path):
        text_escaped = text.replace('"', '`"')
        ps_cmd = (
            f'Add-Type -AssemblyName System.Speech; '
            f'$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
            f'$synth.Rate = 0; '
            f'$synth.SetOutputToWaveFile("{path.replace(chr(92), "/")}"); '
            f'$synth.Speak("{text_escaped}"); '
            f'$synth.Dispose()'
        )
        subprocess.run(["powershell", "-Command", ps_cmd], check=True, capture_output=True)
    return path

def run_pipeline_test_suite():
    print("="*85)
    print("      COMPREHENSIVE STT PIPELINE LATENCY, RELIABILITY & ACCURACY SUITE")
    print("="*85)

    client = TestClient(app)

    # 1. Health Check
    print("\n[TEST 1] Testing /health endpoint...")
    res = client.get("/health")
    assert res.status_code == 200
    health = res.json()
    print(f"  Health OK: Model={health['model']}, Device={health['device']}, Lang={health['language']}, Beam={health['beam_size']}")

    # 2. Audio Reliability & Error Handling
    print("\n[TEST 2] Testing Audio Reliability & Invalid/Corrupted Payload Handling...")

    # 2a. Empty payload (0 bytes)
    res_empty = client.post("/transcribe", files={"file": ("empty.webm", b"", "audio/webm")})
    print(f"  Empty 0-byte upload: Status {res_empty.status_code} | Error: {res_empty.json()['detail']}")
    assert res_empty.status_code == 400

    # 2b. Tiny truncated payload (< 32 bytes)
    res_tiny = client.post("/transcribe", files={"file": ("tiny.webm", b"too_short", "audio/webm")})
    print(f"  Truncated <32b upload: Status {res_tiny.status_code} | Error: {res_tiny.json()['detail']}")
    assert res_tiny.status_code == 400

    # 2c. Corrupted/Malformed WebM payload
    corrupted_bytes = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01INVALID_WEBM_CLUSTER_DATA_12345"
    res_corrupt = client.post("/transcribe", files={"file": ("corrupt.webm", corrupted_bytes, "audio/webm")})
    print(f"  Corrupted WebM upload: Status {res_corrupt.status_code} | Error: {res_corrupt.json()['detail']}")
    assert res_corrupt.status_code == 400

    print("  -> Audio reliability checks PASSED (Returned clean HTTP 400 instead of unhandled 500s).")

    # 3. Generating test samples of varying durations
    short_text = "I am ready for the mock interview."
    medium_text = "As a Computer Science student, I specialize in Software Developer skills with React and Node.js."
    long_text = (
        "I recently earned my bachelor's degree in Computer Science and I am preparing for this mock interview. "
        "During my previous work experience as a Software Developer, I built full stack web applications using React, "
        "JavaScript, TypeScript, and designed scalable backend APIs in Node.js."
    )

    short_path = generate_speech_wav(short_text, "test_short_recording.wav")
    medium_path = generate_speech_wav(medium_text, "test_medium_recording.wav")
    long_path = generate_speech_wav(long_text, "test_long_recording.wav")

    test_cases = [
        ("Short Recording (~2-3s)", short_path, short_text, ["mock interview"]),
        ("Medium Recording (~7-8s)", medium_path, medium_text, ["Computer Science", "Software Developer", "React", "Node.js"]),
        ("Long Recording (~20s)", long_path, long_text, ["mock interview", "Computer Science", "Software Developer", "React", "Node.js", "backend APIs"])
    ]

    print("\n[TEST 3] Measuring Stage Latencies Across Durations (Short, Medium, Long)...")
    print("-" * 85)
    print(f"{'Recording Type':<25} | {'Duration':<9} | {'Upload':<8} | {'Decode':<8} | {'Inference':<11} | {'Total Req':<10}")
    print("-" * 85)

    for label, audio_file, ref_text, required_terms in test_cases:
        with open(audio_file, "rb") as f:
            audio_bytes = f.read()

        start_req = time.perf_counter()
        resp = client.post(
            "/transcribe",
            files={"file": (os.path.basename(audio_file), audio_bytes, "audio/wav")}
        )
        total_client_ms = round((time.perf_counter() - start_req) * 1000, 2)

        assert resp.status_code == 200, f"Failed with {resp.status_code}: {resp.text}"
        data = resp.json()
        timings = data["timings"]

        row = (
            f"{label:<25} | "
            f"{data['duration']:>6.2f}s | "
            f"{timings['upload_write_ms']:>6.2f}ms | "
            f"{timings['audio_decode_ms']:>6.2f}ms | "
            f"{timings['inference_ms']:>8.2f}ms | "
            f"{total_client_ms:>8.2f}ms"
        )
        print(row)
        print(f"   Transcribed: \"{data['text']}\"")

        # Verify key vocabulary presence
        for term in required_terms:
            assert term.lower() in data["text"].lower() or term.replace(".", "").lower() in data["text"].lower() or term.replace("-", " ").lower() in data["text"].replace("-", " ").lower(), \
                f"Missing required domain term '{term}' in transcribed text: '{data['text']}'"

    # 4. Consecutive Recordings Test
    print("\n[TEST 4] Testing 5 Consecutive Recordings in Sequence...")
    consecutive_latencies = []
    with open(medium_path, "rb") as f:
        med_bytes = f.read()

    for i in range(5):
        t0 = time.perf_counter()
        res = client.post("/transcribe", files={"file": (f"consecutive_{i}.wav", med_bytes, "audio/wav")})
        elapsed = (time.perf_counter() - t0) * 1000
        assert res.status_code == 200
        consecutive_latencies.append(elapsed)
        print(f"  Run {i+1}: Total = {elapsed:.1f}ms (Inference = {res.json()['timings']['inference_ms']}ms)")

    avg_consec = sum(consecutive_latencies) / len(consecutive_latencies)
    print(f"  -> Average Consecutive Request Roundtrip: {avg_consec:.1f}ms")

    print("\n" + "="*85)
    print("                ALL PIPELINE BENCHMARKS & RELIABILITY CHECKS PASSED!")
    print("="*85)

if __name__ == "__main__":
    run_pipeline_test_suite()
