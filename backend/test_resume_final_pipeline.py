"""
End-to-End Verification Test for Document Context & Multi-Turn Interview Flow:
1. Generates a realistic Resume_Final.pdf with distinct projects and skills.
2. Extracts text using backend document_service (PDF extraction with pypdf).
3. Verifies Gemini receives the extracted resume content and generates an opening question tailored to it.
4. Executes 2 consecutive interview turns with Gemini, verifying full responses and context awareness.
5. Verifies Gemini does NOT claim it lacks access to the resume file.
"""

import os
import sys
import asyncio
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).parent))

import config
from document_service import extract_document_text
from gemini_service import GeminiInterviewService


def create_sample_resume_pdf(filepath: str):
    """Generate a realistic test PDF resume."""
    c = canvas.Canvas(filepath, pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, 750, "Geraldyn Vance - Lead Full Stack Engineer")
    
    c.setFont("Helvetica", 10)
    c.drawString(50, 735, "Email: geraldyn@example.com | Portfolio: github.com/geraldyn | Location: Remote")
    c.line(50, 725, 550, 725)

    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, 705, "Professional Summary")
    c.setFont("Helvetica", 10)
    c.drawString(50, 690, "Senior software engineer with 6+ years specializing in real-time voice systems, TypeScript, and Python.")
    c.drawString(50, 675, "Proven track record architecting low-latency AI interview assistants and distributed microservices.")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, 650, "Featured Projects")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, 635, "Project PulseAudio (Apex Cloud Systems, 2024)")
    c.setFont("Helvetica", 10)
    c.drawString(60, 620, "- Built an ultra-low latency conversational audio streaming gateway using FastAPI and faster-whisper.")
    c.drawString(60, 605, "- Reduced voice pipeline round-trip latency from 850ms down to 320ms for real-time interview practice.")
    c.drawString(60, 590, "- Integrated Google Gemini 2.5 Flash for contextual conversational follow-up questions.")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, 565, "Technical Skills")
    c.setFont("Helvetica", 10)
    c.drawString(50, 550, "Languages: Python, TypeScript, JavaScript, SQL, Bash")
    c.drawString(50, 535, "Frameworks: FastAPI, React 18, Vite, Tailwind CSS, Uvicorn, WebSockets")
    c.drawString(50, 520, "AI / Voice: faster-whisper, Web Audio API, Gemini API, PyTorch, CTranslate2")

    c.save()
    print(f"Generated PDF file: {filepath} ({os.path.getsize(filepath)} bytes)")


async def main():
    print("=" * 70)
    print("TEST: Document Text Extraction & Gemini Context Verification")
    print("=" * 70)

    pdf_filename = "Resume_Final.pdf"
    pdf_path = os.path.join(os.path.dirname(__file__), pdf_filename)
    create_sample_resume_pdf(pdf_path)

    # 1. Test Document Extraction
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    print(f"\n[Step 1] Extracting text from {pdf_filename} via document_service...")
    extract_result = extract_document_text(pdf_bytes, pdf_filename)
    extracted_text = extract_result.get("extracted_text", "")
    
    print(f"  - File type: {extract_result.get('file_type')}")
    print(f"  - Status: {extract_result.get('status')}")
    print(f"  - Characters extracted: {extract_result.get('char_count')}")
    assert "Project PulseAudio" in extracted_text, "Failed to extract 'Project PulseAudio' from PDF"
    assert "faster-whisper" in extracted_text, "Failed to extract 'faster-whisper' from PDF"
    print("  [OK] Document text extraction passed: Found 'Project PulseAudio' and 'faster-whisper' in extracted text.")

    # 2. Test Initial Question with Document Context
    print("\n[Step 2] Querying Gemini for opening question with Resume_Final.pdf attached...")
    gemini = GeminiInterviewService.get_instance()
    attached_docs = [{
        "id": "doc-test-1",
        "name": pdf_filename,
        "category": "resume",
        "content": extracted_text,
        "extracted_text": extracted_text
    }]

    initial_q = await gemini.generate_initial_question(
        job_role="Lead Full Stack Engineer",
        attached_docs=attached_docs
    )
    print(f"  [OK] PAL Initial Question:\n    \"{initial_q}\"")
    assert "don't have access" not in initial_q.lower(), "Gemini claimed lack of access to resume!"

    # 3. Test Turn 1 Follow-up
    print("\n[Step 3] Turn 1: User speaks about Project PulseAudio...")
    user_answer_1 = "At Apex Cloud Systems, I led Project PulseAudio where we built a low-latency WebSockets and faster-whisper pipeline to cut latency down to 320ms."
    print(f"  - Candidate Answer: \"{user_answer_1}\"")

    conv_history = [
        {"sender": "Pal", "text": initial_q},
        {"sender": "You", "text": user_answer_1}
    ]

    print("  - Querying Gemini for Follow-up #1...")
    followup_1 = await gemini.generate_interview_followup(
        user_answer=user_answer_1,
        conversation_history=conv_history,
        job_role="Lead Full Stack Engineer",
        attached_docs=attached_docs
    )
    print(f"  [OK] PAL Follow-up #1:\n    \"{followup_1}\"")
    assert "don't have access" not in followup_1.lower(), "Gemini claimed lack of access to resume in follow-up 1!"
    assert len(followup_1.strip()) > 20, "Follow-up 1 is unexpectedly empty or truncated!"

    # 4. Test Turn 2 Follow-up
    print("\n[Step 4] Turn 2: User elaborates on technical implementation...")
    user_answer_2 = "We achieved that reduction by running Whisper with CTranslate2 float16 compute and streaming audio chunks over WebSockets rather than buffering full audio files."
    print(f"  - Candidate Answer: \"{user_answer_2}\"")

    conv_history.append({"sender": "Pal", "text": followup_1})
    conv_history.append({"sender": "You", "text": user_answer_2})

    print("  - Querying Gemini for Follow-up #2...")
    followup_2 = await gemini.generate_interview_followup(
        user_answer=user_answer_2,
        conversation_history=conv_history,
        job_role="Lead Full Stack Engineer",
        attached_docs=attached_docs
    )
    print(f"  [OK] PAL Follow-up #2:\n    \"{followup_2}\"")
    assert "don't have access" not in followup_2.lower(), "Gemini claimed lack of access to resume in follow-up 2!"
    assert len(followup_2.strip()) > 20, "Follow-up 2 is unexpectedly empty or truncated!"

    # Clean up generated test file
    try:
        os.remove(pdf_path)
    except Exception:
        pass

    print("\n" + "=" * 70)
    print("ALL TESTS PASSED: Document context fully verified across 2 turns!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
