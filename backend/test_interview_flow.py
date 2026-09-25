import os
import sys
import time
import subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.main import app

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

def test_full_interview_pipeline():
    print("\n" + "="*80)
    print("   TESTING AI VOICE COMPANION - JOB INTERVIEW PRACTICE COACH PIPELINE")
    print("="*80)

    client = TestClient(app)

    # 1. Health check
    print("\n[Step 1] Verifying Backend Health Check...")
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    print("  Health Response:", data)
    assert data["status"] == "healthy"
    assert data["service"] == "faster-whisper-stt"
    assert data["gemini_brain"] == "enabled"

    # 2. Initial Interview Question Generation
    print("\n[Step 2] Testing Initial Question Generation for 'Software Developer' with attached Resume/JD...")
    docs = [
        {"id": "doc-1", "name": "Computer_Science_Resume.pdf", "category": "resume"},
        {"id": "doc-2", "name": "Frontend_Backend_Requirements.pdf", "category": "job_description"}
    ]
    res_init = client.post("/interview/initial-question", json={
        "job_role": "Software Developer",
        "attached_documents": docs
    })
    assert res_init.status_code == 200
    init_data = res_init.json()
    print(f"  AI Initial Question: \"{init_data['ai_response']}\"")
    assert len(init_data["ai_response"]) > 10

    # 3. User Spoken Answer -> Whisper STT -> Gemini Interview Follow-up
    print("\n[Step 3] Simulating Spoken Candidate Answer via Audio File...")
    spoken_text = "I am a Computer Science student and I have experience working while studying."
    audio_path = generate_speech_wav(spoken_text, "test_candidate_answer.wav")
    print(f"  Synthesized Spoken Audio: '{spoken_text}'")

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    history = [
        {"sender": "Pal", "text": init_data["ai_response"]}
    ]

    t0 = time.perf_counter()
    res_transcribe = client.post(
        "/transcribe",
        files={"file": ("candidate_answer.wav", audio_bytes, "audio/wav")},
        data={
            "job_role": "Software Developer",
            "history": str(history).replace("'", '"'),
            "generate_ai_response": "true"
        }
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000

    assert res_transcribe.status_code == 200
    result = res_transcribe.json()

    print(f"\n[Step 4] Full Pipeline Output (Total latency: {elapsed_ms:.1f}ms):")
    print(f"  1. [STT] Whisper Transcription : \"{result['transcription']}\"")
    print(f"  2. [AI]  Gemini Follow-Up Question: \"{result['ai_response']}\"")
    print(f"  3. [TIME] STT Inference Latency : {result['timings']['inference_ms']}ms")

    assert len(result["transcription"]) > 0
    assert "computer science" in result["transcription"].lower() or "student" in result["transcription"].lower()
    assert len(result["ai_response"]) > 0
    print("\n>>> ALL TESTS PASSED: Full Whisper -> Gemini -> Follow-up pipeline verified successfully! <<<\n")

if __name__ == "__main__":
    test_full_interview_pipeline()
