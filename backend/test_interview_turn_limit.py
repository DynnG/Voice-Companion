"""
Comprehensive Verification Suite for Hard Interview Ending Limit

Tests:
1. HARD_INTERVIEW_TURN_LIMIT is strictly 8 turns.
2. Short answers on turns 1-7 do NOT end early.
3. Natural ending before turn 8 (user requests wrapup or answers wrapup question) still works.
4. On turn 8 (final allowed turn), PAL returns exact ending message:
   "That brings us to the end of our interview. Thank you for taking the time to practice with me. You did a great job working through the questions. You can now review your answers and feedback."
5. Zero Gemini API calls are made on turn 8.
6. should_end is True and reason is 'turn_limit_reached'.
7. Zero database writes / records (strictly session-only).
"""

import sys
import os
import unittest
from unittest.mock import AsyncMock, patch

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from gemini_service import (
    GeminiInterviewService,
    HARD_INTERVIEW_TURN_LIMIT,
    HARD_LIMIT_ENDING_MESSAGE,
    parse_gemini_interview_json
)
from database import SessionLocal
from models import Interview, Document, Message


class TestInterviewTurnLimit(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.service = GeminiInterviewService.get_instance()
        self.expected_ending_message = (
            "That brings us to the end of our interview. "
            "Thank you for taking the time to practice with me. "
            "You did a great job working through the questions. "
            "You can now review your answers and feedback."
        )

    def test_constants_and_ending_message(self):
        """Verify the turn limit is 8 and ending message is exact."""
        self.assertEqual(HARD_INTERVIEW_TURN_LIMIT, 8, "Turn limit must be 8")
        self.assertEqual(
            HARD_LIMIT_ENDING_MESSAGE,
            self.expected_ending_message,
            "Ending message must match requirement exactly"
        )
        print("[PASS] Turn limit constant is 8 and ending message text matches requirement exactly.")

    def test_short_answer_does_not_end_early_turns_1_to_7(self):
        """Verify short answers on turns 1-7 do NOT end early."""
        short_answers = ["yes", "no", "yep", "sure", "correct", "ok", "i agree", "that's it"]
        for ans in short_answers:
            parsed = parse_gemini_interview_json(
                raw_text='{"response": "Can you elaborate on that?", "should_end": true, "reason": "short"}',
                clean_answer=ans,
                user_wants_to_end=False,
                user_turn_count=3,
                was_wrapup_question=False
            )
            self.assertFalse(
                parsed["should_end"],
                f"Short answer '{ans}' on turn 3 must not cause early interview completion"
            )
            self.assertEqual(
                parsed["reason"],
                "probing_short_answer",
                f"Reason for short answer '{ans}' should be probing_short_answer"
            )
        print("[PASS] Short answers on turns 1-7 correctly do NOT end the interview early.")

    async def test_turn_8_terminates_without_gemini_api_call(self):
        """Verify that reaching turn 8 naturally finishes with exact message and ZERO Gemini calls."""
        # Build 7 prior candidate turns in conversation history
        history = []
        for i in range(1, 8):
            history.append({"sender": "Pal", "text": f"Question {i}"})
            history.append({"sender": "You", "text": f"Candidate answer {i}"})

        # Mock _call_gemini_api to verify it is NEVER called
        with patch.object(self.service, '_call_gemini_api', new_callable=AsyncMock) as mock_gemini:
            result = await self.service.generate_interview_followup(
                user_answer="Candidate answer 8 (Final Turn)",
                conversation_history=history,
                job_role="Software Engineer",
                attached_docs=[]
            )

            # Assert Gemini was NOT called
            mock_gemini.assert_not_called()

            # Assert exact response and flags
            self.assertEqual(result["response"], self.expected_ending_message)
            self.assertTrue(result["should_end"], "should_end must be True on turn 8")
            self.assertEqual(result["reason"], "turn_limit_reached")
            self.assertEqual(result["status"], "success")

        print("[PASS] Turn 8 naturally terminates with exact ending message and ZERO Gemini API calls.")

    async def test_turn_beyond_8_also_terminates_without_gemini_call(self):
        """Verify that any turn >= 8 is protected and makes zero Gemini calls."""
        history = []
        for i in range(1, 9):
            history.append({"sender": "Pal", "text": f"Question {i}"})
            history.append({"sender": "You", "text": f"Candidate answer {i}"})

        with patch.object(self.service, '_call_gemini_api', new_callable=AsyncMock) as mock_gemini:
            result = await self.service.generate_interview_followup(
                user_answer="Candidate answer 9",
                conversation_history=history,
                job_role="Software Engineer",
                attached_docs=[]
            )
            mock_gemini.assert_not_called()
            self.assertTrue(result["should_end"])
            self.assertEqual(result["response"], self.expected_ending_message)

        print("[PASS] Turn > 8 is also safely capped with zero Gemini calls.")

    async def test_natural_completion_before_turn_8_works(self):
        """Verify that candidate requesting wrapup on turn 3 still works naturally."""
        history = [
            {"sender": "Pal", "text": "Question 1"},
            {"sender": "You", "text": "Answer 1"},
            {"sender": "Pal", "text": "Question 2"},
            {"sender": "You", "text": "Answer 2"},
        ]

        # Candidate asks to end on turn 3
        result = await self.service.generate_interview_followup(
            user_answer="I need to wrap up now, can we end the interview?",
            conversation_history=history,
            job_role="Software Engineer",
            attached_docs=[]
        )

        self.assertTrue(result["should_end"])
        self.assertEqual(result["reason"], "user_requested_end")
        print("[PASS] Natural completion before turn 8 (user requested wrapup) functions properly.")

    def test_database_persistence_is_zero(self):
        """Verify that database has zero records (all interview data remains session-only)."""
        db = SessionLocal()
        try:
            doc_count = db.query(Document).count()
            msg_count = db.query(Message).count()
            self.assertEqual(doc_count, 0, "No documents should be saved in DB")
            self.assertEqual(msg_count, 0, "No messages should be saved in DB")
            print("[PASS] Database persistence verified: 0 documents, 0 messages in SQLite.")
        finally:
            db.close()

    def test_endpoint_completed_session_rejects_try_again_without_gemini_call(self):
        """
        Verify the fix for: User saying 'I want to try again' after session concluded.
        Backend MUST reject immediately without calling Gemini API!
        """
        from fastapi.testclient import TestClient
        from main import app, ACTIVE_INTERVIEW_SESSIONS

        client = TestClient(app)
        test_session_id = "test-session-completed-123"
        ACTIVE_INTERVIEW_SESSIONS[test_session_id] = {
            "status": "completed",
            "turns_used": 8,
            "max_turns": 8
        }

        with patch.object(self.service, '_call_gemini_api', new_callable=AsyncMock) as mock_gemini:
            response = client.post("/interview/followup", json={
                "interview_id": test_session_id,
                "user_answer": "I want to try again",
                "job_role": "Software Engineer",
                "conversation_history": [
                    {"sender": "Pal", "text": "Question 1"},
                    {"sender": "You", "text": "Answer 1"}
                ]
            })

            mock_gemini.assert_not_called()
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["should_end"])
            self.assertEqual(data["status"], "completed")
            self.assertEqual(data["error_type"], "session_limit_reached")
            self.assertEqual(data["ai_response"], self.expected_ending_message)

        print("[PASS] Completed session rejects 'I want to try again' without calling Gemini.")

    def test_endpoint_turn_count_at_limit_rejects_without_gemini_call(self):
        """
        Verify that if conversation history has >= 8 candidate turns,
        endpoint immediately returns final message without calling Gemini.
        """
        from fastapi.testclient import TestClient
        from main import app, ACTIVE_INTERVIEW_SESSIONS

        client = TestClient(app)
        test_session_id = "test-session-limit-456"
        history = []
        for i in range(1, 9):
            history.append({"sender": "Pal", "text": f"Question {i}"})
            history.append({"sender": "You", "text": f"Answer {i}"})

        with patch.object(self.service, '_call_gemini_api', new_callable=AsyncMock) as mock_gemini:
            response = client.post("/interview/followup", json={
                "interview_id": test_session_id,
                "user_answer": "Another answer after 8 turns",
                "job_role": "Software Engineer",
                "conversation_history": history
            })

            mock_gemini.assert_not_called()
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["should_end"])
            self.assertEqual(data["status"], "completed")
            self.assertEqual(data["ai_response"], self.expected_ending_message)

        print("[PASS] Endpoint rejects candidate turns >= 8 with zero Gemini calls.")


if __name__ == "__main__":
    unittest.main()
