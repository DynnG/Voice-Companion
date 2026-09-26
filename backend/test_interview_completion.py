"""
Test suite for interview completion logic, candidate name extraction,
probing rules, and database completion state persistence.
"""
import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from gemini_service import (
    extract_candidate_name,
    parse_gemini_interview_json,
    is_user_requesting_wrapup
)
from database import engine, SessionLocal, Base
from models import Interview, Message, Document


def test_candidate_name_extraction():
    print("--- 1. Testing Candidate Name Extraction ---")
    
    # Case A: Resume with explicit name
    resume_docs = [{
        "filename": "Resume_Final.pdf",
        "category": "Resume",
        "extracted_text": """
Geraldyn Vance
Lead Full Stack Engineer | Senior Python & TypeScript Developer
geraldyn@example.com | San Francisco, CA

PROFESSIONAL SUMMARY
Experienced software engineer with 8+ years building distributed systems...
"""
    }]
    name = extract_candidate_name(resume_docs)
    print(f"Resume with name extracted: '{name}'")
    assert name == "Geraldyn Vance", f"Expected 'Geraldyn Vance', got '{name}'"
    print("  [PASS] Passed: Correctly extracted 'Geraldyn Vance' from resume header.")

    # Case B: Document without candidate name (e.g., job description or requirements doc)
    generic_docs = [{
        "filename": "Job_Description.txt",
        "category": "Job Description",
        "extracted_text": """
SENIOR FULL STACK ENGINEER
Requirements:
- 5+ years React and Python
- Experience with FastAPI and SQLite
- Excellent communication skills
"""
    }]
    name_none = extract_candidate_name(generic_docs)
    print(f"Generic doc extracted: '{name_none}'")
    assert name_none is None, f"Expected None, got '{name_none}'"
    print("  [PASS] Passed: Did not invent or hallucinate candidate name when absent.")

    # Case C: Empty docs
    assert extract_candidate_name([]) is None
    print("  [PASS] Passed: Handled empty attached documents gracefully.")


def test_probing_and_completion_rules():
    print("\n--- 2. Testing Probing Rules & Completion Enforcements ---")

    # Rule 1: Explicit user wrap-up request
    wrapup_texts = [
        "I need to wrap up now because I have another meeting.",
        "That's all the time I have today, can we conclude?",
        "Thank you, I'd like to end the interview here."
    ]
    for text in wrapup_texts:
        assert is_user_requesting_wrapup(text) is True, f"Failed to detect wrap-up for: {text}"
        result = parse_gemini_interview_json(
            raw_text='{"response": "Understood, thank you.", "should_end": true, "reason": "user_requested_end"}',
            clean_answer=text,
            user_wants_to_end=True,
            user_turn_count=3,
            candidate_name="Geraldyn"
        )
        assert result["should_end"] is True, f"Expected should_end=True for wrap-up: {text}"
        assert result["reason"] == "user_requested_end"
    print("  [PASS] Passed: User explicit wrap-up request immediately ends interview.")

    # Rule 2: Short answer MUST NOT end the interview (probing enforced)
    short_answers = ["yes", "no", "I did.", "yeah sure", "okay"]
    for ans in short_answers:
        # Even if Gemini incorrectly returned should_end = true
        bad_gemini_json = '{"response": "Okay thank you.", "should_end": true, "reason": "sufficient_coverage"}'
        result = parse_gemini_interview_json(
            raw_text=bad_gemini_json,
            clean_answer=ans,
            user_wants_to_end=False,
            user_turn_count=3,
            candidate_name="Geraldyn"
        )
        assert result["should_end"] is False, f"Short answer '{ans}' incorrectly triggered completion!"
        assert result["reason"] == "probing_short_answer", f"Expected 'probing_short_answer', got '{result['reason']}'"
    print("  [PASS] Passed: Short answers strictly enforce probing (should_end=False).")

    # Rule 3: Insufficient turns (< 2 user answers) cannot conclude unless explicit request
    single_turn_answer = "I am a full stack developer with experience in React and Python."
    premature_json = '{"response": "Thanks, that was all.", "should_end": true, "reason": "sufficient_coverage"}'
    result = parse_gemini_interview_json(
        raw_text=premature_json,
        clean_answer=single_turn_answer,
        user_wants_to_end=False,
        user_turn_count=1,
        candidate_name="Geraldyn"
    )
    assert result["should_end"] is False, "Single user turn was allowed to end prematurely!"
    assert result["reason"] == "continue_interview"
    print("  [PASS] Passed: Premature ending (< 2 user turns) properly blocked.")

    # Rule 4: Multi-turn interview with sufficient coverage ends cleanly
    multi_turn_answer = "I focus on objective metrics, code reviews, and open team dialogue."
    complete_json = '{"response": "Thank you Geraldyn for your thoughtful answers. That covers everything I needed today.", "should_end": true, "reason": "sufficient_coverage"}'
    result = parse_gemini_interview_json(
        raw_text=complete_json,
        clean_answer=multi_turn_answer,
        user_wants_to_end=False,
        user_turn_count=3,
        candidate_name="Geraldyn"
    )
    assert result["should_end"] is True, "Valid completion was blocked!"
    assert result["reason"] == "sufficient_coverage"
    assert "Geraldyn" in result["response"]
    print("  [PASS] Passed: Multi-turn completion accepted with candidate name.")


def test_database_completion_persistence():
    print("\n--- 3. Testing Database Completion State Persistence ---")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Create test interview
        interview = Interview(
            title="Frontend Senior Engineer Interview",
            job_role="Senior Frontend Engineer",
            status="active"
        )
        db.add(interview)
        db.commit()
        db.refresh(interview)
        inv_id = interview.id
        print(f"Created interview in DB: id={inv_id}, status={interview.status}")

        # Add message
        msg1 = Message(
            interview_id=inv_id,
            role="interviewer",
            content="Hello and welcome to the interview."
        )
        msg2 = Message(
            interview_id=inv_id,
            role="user",
            content="Hi, excited to be here!"
        )
        db.add_all([msg1, msg2])
        db.commit()

        # Update status to completed and add final concluding message
        interview.status = "completed"
        final_msg = Message(
            interview_id=inv_id,
            role="interviewer",
            content="Thank you for your time today. We'll be in touch with next steps!"
        )
        db.add(final_msg)
        db.commit()

        # Re-fetch from clean session
        db.expire_all()
        refetched = db.query(Interview).filter(Interview.id == inv_id).first()
        assert refetched is not None
        assert refetched.status == "completed", f"Expected status='completed', got '{refetched.status}'"
        assert len(refetched.messages) == 3, f"Expected 3 messages, got {len(refetched.messages)}"
        print(f"  [PASS] Passed: Successfully persisted status='completed' and final message for interview {inv_id}")

        # Cleanup test interview
        db.delete(refetched)
        db.commit()
        print("  [PASS] Test interview cleaned up.")
    finally:
        db.close()


if __name__ == "__main__":
    print("Running Interview Completion Verification Tests...\n")
    test_candidate_name_extraction()
    test_probing_and_completion_rules()
    test_database_completion_persistence()
    print("\n>>> ALL INTERVIEW COMPLETION TESTS PASSED SUCCESSFULLY! <<<")
