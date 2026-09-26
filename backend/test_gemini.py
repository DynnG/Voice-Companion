import os
import sys
import asyncio
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import GEMINI_MODEL
from gemini_service import GeminiInterviewService

async def test_gemini_interview():
    print("=" * 60)
    print("Voice Companion - Gemini Integration Test")
    print("=" * 60)
    
    svc = GeminiInterviewService.get_instance()
    api_key_present = bool(svc.get_api_key())
    
    print(f"Configured Model: {svc.get_model_name()}")
    print(f"API Key Present: {'Yes' if api_key_present else 'No'}")

    if not api_key_present:
        print("\n[WARNING] GEMINI_API_KEY is not set in backend/.env!")
        print("To run a live test, add GEMINI_API_KEY=your_key to backend/.env and re-run.")
        return False

    sample_answer = (
        "In my previous project, we experienced high memory spikes during peak traffic. "
        "I profiled the application, identified an unclosed stream leak in the audio worker, "
        "applied connection pooling, and latency dropped by 40%."
    )
    
    print(f"\nCandidate Answer: \"{sample_answer}\"")
    print("\nQuerying Gemini AI Interviewer...")

    try:
        response_text = await svc.generate_interview_followup(
            user_answer=sample_answer,
            job_role="Senior Software Engineer"
        )
        print("\n[SUCCESS] Response received from Gemini:")
        print("-" * 60)
        print(f"Interviewer (Pal): {response_text}")
        print("-" * 60)
        return True
    except Exception as e:
        print(f"\n[ERROR] Gemini call failed: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_gemini_interview())
    sys.exit(0 if success else 1)
