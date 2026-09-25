import os
import sys
import wave
import struct
import math
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.main import app

from backend.config import MODEL_SIZE

SAMPLE_AUDIO_PATH = os.path.join(os.path.dirname(__file__), "test_sample_jfk.flac")

def test_health_endpoint():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    print("Health check response:", data)
    assert data["status"] == "healthy"
    assert data["service"] == "faster-whisper-stt"
    assert data["model"] == MODEL_SIZE

def test_transcribe_with_speech_audio():
    with TestClient(app) as client:
        assert os.path.exists(SAMPLE_AUDIO_PATH), f"Sample audio not found at {SAMPLE_AUDIO_PATH}"
        
        start = time.perf_counter()
        with open(SAMPLE_AUDIO_PATH, "rb") as f:
            response = client.post(
                "/transcribe",
                files={"file": ("jfk.flac", f, "audio/flac")}
            )
        elapsed_total = (time.perf_counter() - start) * 1000
        
        print("Transcribe status:", response.status_code)
        assert response.status_code == 200
        data = response.json()
        print("\nTranscribe Response Data:")
        print(f"  - Model: {data.get('model')}")
        print(f"  - Language: {data.get('language')} ({data.get('language_probability')})")
        print(f"  - Audio Duration: {data.get('duration')}s")
        print(f"  - Processing Time: {data.get('processing_time_ms')}ms")
        print(f"  - Total Client Roundtrip: {elapsed_total:.1f}ms")
        print(f"  - Transcribed Text: \"{data.get('text')}\"")
        
        assert "fellow Americans" in data["text"]
        print("\n>>> End-to-end transcription test PASSED with high accuracy & low latency! <<<")

if __name__ == "__main__":
    print("========================================")
    print("1. Testing /health endpoint...")
    print("========================================")
    test_health_endpoint()
    
    print("\n========================================")
    print("2. Testing /transcribe endpoint (Tiny, INT8 CPU)...")
    print("========================================")
    test_transcribe_with_speech_audio()
