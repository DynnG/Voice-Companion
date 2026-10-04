import asyncio
from unittest.mock import AsyncMock
import pytest
from gemini_service import GeminiInterviewService, INTERVIEW_SYSTEM_PROMPT

@pytest.mark.parametrize("documents", [[], [{"name": "resume.txt", "extracted_text": "Built a payroll API using Python."}]])
def test_opening_introduces_savi_before_grounded_question(monkeypatch, documents):
    service = GeminiInterviewService()
    monkeypatch.setattr(service, "get_api_key", lambda: "test-placeholder")
    call = AsyncMock(return_value='{"response":"Hi, I am Savi, your AI interview practice companion. How do you test APIs?","should_end":false}')
    monkeypatch.setattr(service, "_call_gemini_api", call)
    answer = asyncio.run(service.generate_initial_question("Software Developer", documents))
    prompt = call.call_args.kwargs["contents"][0]["parts"][0]["text"]
    assert "You are Savi," in prompt
    assert "Begin with a brief, warm self-introduction" in prompt
    assert "Then ask ONE role- or document-grounded opening question" in prompt
    assert "You are Pal," not in prompt
    assert answer.startswith("Hi, I am Savi")

def test_identity_instruction_names_savi():
    assert "Always identify yourself as Savi, never Pal" in INTERVIEW_SYSTEM_PROMPT
    assert "If asked your name or who you are" in INTERVIEW_SYSTEM_PROMPT
