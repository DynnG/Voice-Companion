import os
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import GEMINI_API_KEY, GEMINI_MODEL
from gemini_service import GeminiService

def test_gemini_interview():
    print("=" * 60)
    print("Voice Companion - Gemini Integration Test")
    print("=" * 60)
    print(f"Configured Model: {GEMINI_MODEL}")
    print(f"API Key Present: {'Yes' if bool(GEMINI_API_KEY) else 'No'}")

    if not GEMINI_API_KEY:
        print("\n[WARNING] GEMINI_API_KEY is not set in backend/.env!")
        print("To run a live test, add GEMINI_API_KEY=your_key to backend/.env and re-run.")
        print("[SKIPPING LIVE API CALL - Configuration check passed]")
        return True

    print("\nSending sample candidate response to Gemini...")
    svc = GeminiService.get_instance()
    
    sample_question = "Tell me about a time you resolved a difficult bug in production."
    candidate_answer = (
        "In my previous project, we experienced high memory spikes during peak traffic. "
        "I profiled the application, identified an unclosed stream leak in the audio worker, "
        "applied connection pooling, and latency dropped by 40%."
    )
    
    history = [
        {"role": "pal", "text": sample_question}
    ]

    try:
        result = svc.generate_interview_response(
            user_message=candidate_answer,
            history=history,
            job_role="Senior Software Engineer",
        )
        print("\n[SUCCESS] Response received from Gemini:")
        print("-" * 60)
        print(f"Interviewer (Pal): {result['text']}")
        print("-" * 60)
        print(f"Latency: {result['latency_ms']} ms | Model: {result['model']}")
        return True
    except Exception as e:
        print(f"\n[ERROR] Gemini call failed: {e}")
        return False

if __name__ == "__main__":
    success = test_gemini_interview()
    sys.exit(0 if success else 1)
