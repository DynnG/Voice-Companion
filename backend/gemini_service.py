import os
import json
import logging
from typing import List, Dict, Any, Optional
import httpx

try:
    from .config import GEMINI_API_KEY, GEMINI_MODEL
except ImportError:
    from config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger("voice-companion-gemini")


INTERVIEW_SYSTEM_PROMPT = """You are an AI Job Interview Practice Coach named Pal. Your role is to conduct a realistic, engaging, and professional job interview practice session.

Core Guidelines:
1. Act exclusively as the Interviewer. Never answer the interview questions yourself.
2. Ask ONE focused, realistic question at a time.
3. After the user provides an spoken answer:
   - Analyze their response in the context of the target job role, their background (résumé/CV, portfolio, job description), and previous dialogue.
   - If appropriate, acknowledge their answer with a brief conversational transition (1 short phrase, e.g. "That's a great example.", "Thank you for sharing that.", "Understood.").
   - Immediately follow up with a targeted follow-up question digging into their specific skills, decision-making, results (STAR method), technical choices, or team collaboration, OR transition to the next key competency for the role.
4. Keep the interview natural, realistic, and tailored to the job role and attached documents.
5. If the user's answer is brief or vague, ask a clarifying follow-up.
6. If the user's answer is comprehensive, smoothly move to the next relevant interview topic.
7. Keep your response concise (1-3 sentences maximum) because this is a spoken voice interview. Avoid long monologues, lists, or lecturing.
8. Output ONLY your spoken interviewer response/question. Do not include markdown headers, bullet lists, or meta-commentary like '[Interviewer:]'.
"""

FALLBACK_FOLLOWUP_QUESTIONS = [
    "How has your previous experience prepared you for the technical challenges in this position?",
    "Could you give a specific example of a difficult problem you encountered and how you solved it?",
    "What was the most challenging part of that project, and what key lesson did you take away from it?",
    "How do you prioritize your tasks when working under tight deadlines with competing priorities?",
    "Can you walk me through your decision-making process when choosing tools or frameworks for a new project?",
    "How do you approach collaboration and communication when working with cross-functional team members?",
    "Which specific skills or technologies are you most looking forward to developing further in this role?"
]

class GeminiInterviewService:
    _instance: Optional["GeminiInterviewService"] = None

    @classmethod
    def get_instance(cls) -> "GeminiInterviewService":
        if cls._instance is None:
            cls._instance = GeminiInterviewService()
        return cls._instance

    def __init__(self):
        self.api_key = GEMINI_API_KEY or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        self.model = GEMINI_MODEL or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.fallback_index = 0

    def _get_fallback_question(self, user_answer: str = "") -> str:
        question = FALLBACK_FOLLOWUP_QUESTIONS[self.fallback_index % len(FALLBACK_FOLLOWUP_QUESTIONS)]
        self.fallback_index += 1
        return question

    def _build_context_header(
        self,
        job_role: Optional[str],
        attached_docs: Optional[List[Dict[str, Any]]]
    ) -> str:
        role = job_role.strip() if job_role else "Software Developer"
        doc_lines = []
        if attached_docs:
            for doc in attached_docs:
                name = doc.get("name", "Document")
                category = doc.get("category", "document")
                doc_lines.append(f"- {category.replace('_', ' ').title()}: {name}")

        context_str = f"Target Role: {role}\n"
        if doc_lines:
            context_str += "Attached Candidate Materials:\n" + "\n".join(doc_lines) + "\n"
        return context_str

    def get_api_key(self) -> str:
        key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        if not key:
            try:
                from .config import GEMINI_API_KEY
                key = GEMINI_API_KEY
            except ImportError:
                pass
        return key.strip() if key else ""

    def get_model_name(self) -> str:
        return os.getenv("GEMINI_MODEL") or GEMINI_MODEL or "gemini-2.5-flash"

    async def generate_initial_question(
        self,
        job_role: Optional[str] = None,
        attached_docs: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Generate the opening question for a new interview based on the job role and attached documents.
        """
        api_key = self.get_api_key()
        context_header = self._build_context_header(job_role, attached_docs)
        prompt = (
            f"{context_header}\n"
            f"You are beginning a new job interview practice session with the candidate. "
            f"Generate a friendly, professional opening interview question tailored to the {job_role or 'role'} "
            f"and any attached candidate materials (e.g. asking them to introduce themselves and highlight relevant experience)."
        )

        if not api_key:
            logger.info("GEMINI_API_KEY not configured. Using structured opening interview question.")
            role_name = job_role or "this position"
            return f"Welcome! To start off, could you please tell me about yourself and what interests you about the {role_name} role?"

        try:
            logger.info(f"Generating initial interview question with Gemini for role: {job_role}...")
            return await self._call_gemini_api(
                contents=[{"role": "user", "parts": [{"text": prompt}]}],
                api_key=api_key
            )
        except Exception as e:
            logger.error(f"Error generating initial question with Gemini: {e}")
            role_name = job_role or "this position"
            return f"Welcome! To get started, could you walk me through your background and what motivated you to apply for the {role_name} role?"

    async def generate_interview_followup(
        self,
        user_answer: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        job_role: Optional[str] = None,
        attached_docs: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Analyze the candidate's answer and generate the next interview question or follow-up question.
        """
        if not user_answer or not user_answer.strip():
            return "I didn't quite catch that. Could you please repeat or elaborate on your answer?"

        clean_answer = user_answer.strip()
        api_key = self.get_api_key()
        context_header = self._build_context_header(job_role, attached_docs)

        logger.info(f"[Whisper->Gemini] 1. Analyzing candidate answer: \"{clean_answer}\"")

        if not api_key:
            logger.warning("[Whisper->Gemini] GEMINI_API_KEY not found in environment. Using structured interview follow-up.")
            fallback = self._get_fallback_question(clean_answer)
            logger.info(f"[Whisper->Gemini] 2. Generated fallback question: \"{fallback}\"")
            return fallback

        # Build conversation turns for Gemini
        contents: List[Dict[str, Any]] = []

        # System and background context injected as the first turn
        initial_context_prompt = (
            f"[Interview Setup]\n{context_header}\n"
            f"Conduct the interview based on the candidate's answers."
        )

        contents.append({
            "role": "user",
            "parts": [{"text": initial_context_prompt}]
        })
        contents.append({
            "role": "model",
            "parts": [{"text": "Understood. I am ready to conduct the interview and ask relevant questions."}]
        })

        # Append previous history turns
        if conversation_history:
            for item in conversation_history:
                sender = item.get("sender", "")
                text = item.get("text", "").strip()
                if not text:
                    continue

                if sender.lower() in ("pal", "ai", "interviewer", "bot", "assistant"):
                    if contents and contents[-1]["role"] == "model":
                        contents[-1]["parts"][0]["text"] += f" {text}"
                    else:
                        contents.append({"role": "model", "parts": [{"text": text}]})
                else:
                    if contents and contents[-1]["role"] == "user":
                        contents[-1]["parts"][0]["text"] += f" {text}"
                    else:
                        contents.append({"role": "user", "parts": [{"text": text}]})

        # Ensure alternating user message with latest transcribed answer
        if contents and contents[-1]["role"] == "user":
            contents[-1]["parts"][0]["text"] += f"\nCandidate Answer: {clean_answer}"
        else:
            contents.append({
                "role": "user",
                "parts": [{"text": f"Candidate Answer: {clean_answer}\n\nAnalyze this answer and ask your next relevant follow-up question:"}]
            })

        try:
            logger.info(f"[Whisper->Gemini] 2. Sending request to Gemini API ({self.get_model_name()})...")
            response_text = await self._call_gemini_api(contents=contents, api_key=api_key)
            logger.info(f"[Whisper->Gemini] 3. Gemini response generated: \"{response_text}\"")
            return response_text
        except Exception as e:
            logger.error(f"[Whisper->Gemini] Gemini API call failed: {e}", exc_info=True)
            fallback = self._get_fallback_question(clean_answer)
            logger.info(f"[Whisper->Gemini] Returning fallback interview question: \"{fallback}\"")
            return fallback

    async def _call_gemini_api(self, contents: List[Dict[str, Any]], api_key: Optional[str] = None) -> str:
        """
        Execute request to Google Generative Language API.
        """
        effective_key = api_key or self.get_api_key()
        models_to_try = [
            self.get_model_name(),
            "gemini-3.8-flash",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro"
        ]
        # Deduplicate while preserving order
        unique_models = list(dict.fromkeys(models_to_try))

        last_exception = None

        for model_name in unique_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={effective_key}"
            payload = {
                "system_instruction": {
                    "parts": [{"text": INTERVIEW_SYSTEM_PROMPT}]
                },
                "contents": contents,
                "generationConfig": {
                    "temperature": 0.7,
                    "topP": 0.95,
                    "maxOutputTokens": 250
                }
            }

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        url,
                        json=payload,
                        headers={"Content-Type": "application/json"}
                    )

                if response.status_code == 200:
                    data = response.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        content = candidates[0].get("content", {})
                        parts = content.get("parts", [])
                        if parts and "text" in parts[0]:
                            raw_text = parts[0]["text"].strip()
                            # Clean up quotation marks or metadata tags if present
                            if raw_text.startswith('"') and raw_text.endswith('"'):
                                raw_text = raw_text[1:-1].strip()
                            return raw_text
                    raise ValueError(f"Empty candidate text returned from Gemini API: {data}")
                else:
                    error_body = response.text
                    logger.warning(f"Gemini model {model_name} returned status {response.status_code}: {error_body}")
                    last_exception = RuntimeError(f"Gemini HTTP {response.status_code}: {error_body}")
            except Exception as ex:
                logger.warning(f"Failed calling Gemini model {model_name}: {ex}")
                last_exception = ex

        raise last_exception or RuntimeError("All Gemini model attempts failed.")
