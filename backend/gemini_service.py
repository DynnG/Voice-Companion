import logging
import time
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types

try:
    from .config import GEMINI_API_KEY, GEMINI_MODEL
except ImportError:
    from config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger("voice-companion-gemini")

DEFAULT_SYSTEM_INSTRUCTION = """You are Pal, an encouraging, articulate, and insightful AI Technical Interviewer conducting a realistic mock interview.
Your goals:
1. Conduct an interactive, conversational interview for the candidate's specified role.
2. Ask one clear, targeted question or follow-up at a time.
3. Keep your spoken responses concise, natural, and conversational (typically 1 to 3 short sentences) so that voice interactions remain quick and responsive.
4. If the user answers a question, acknowledge their key points concisely, optionally offer a brief piece of constructive feedback or a follow-up, and proceed to the next relevant question.
5. Do not use complex markdown formatting, bulleted lists, code blocks, or emojis in your responses unless specifically asked, as your response will be spoken aloud to the user.
"""

class GeminiService:
    _instance: Optional["GeminiService"] = None

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or GEMINI_API_KEY
        self.model = model or GEMINI_MODEL
        self._client: Optional[genai.Client] = None
        if self.api_key:
            try:
                self._client = genai.Client(api_key=self.api_key)
                logger.info(f"Initialized Gemini Client with model: {self.model}")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini Client: {e}")

    @classmethod
    def get_instance(cls) -> "GeminiService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reload_instance(cls) -> "GeminiService":
        cls._instance = cls()
        return cls._instance

    def is_configured(self) -> bool:
        return bool(self.api_key and self._client)

    def generate_interview_response(
        self,
        user_message: str,
        history: Optional[List[Dict[str, str]]] = None,
        job_role: Optional[str] = None,
        context_docs: Optional[List[str]] = None,
        system_instruction: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a conversational AI interviewer response using Google GenAI SDK.
        
        Args:
            user_message: The latest candidate utterance/transcript.
            history: Optional conversation turns [{"role": "user"|"model", "text": "..."}].
            job_role: Target job title (e.g. "Software Engineer").
            context_docs: Optional text from attached resumes/job descriptions.
            system_instruction: Optional custom system instruction.
            
        Returns:
            Dict with response text, model, and response latency.
        """
        if not self.is_configured():
            if not self.api_key:
                raise ValueError(
                    "GEMINI_API_KEY is not set. Please add your GEMINI_API_KEY to backend/.env."
                )
            # Try initializing client if api_key became available
            self._client = genai.Client(api_key=self.api_key)

        start_time = time.perf_counter()

        # Build system instruction tailored with job role and docs
        sys_inst = system_instruction or DEFAULT_SYSTEM_INSTRUCTION
        if job_role:
            sys_inst += f"\nTarget Position: {job_role}."
        if context_docs and len(context_docs) > 0:
            sys_inst += f"\nAttached Candidate Materials / Background:\n" + "\n---\n".join(context_docs)

        # Build contents from history and current message
        contents = []
        if history:
            for turn in history:
                role = turn.get("role", "user")
                text = turn.get("text", "")
                if text:
                    # Normalize roles to 'user' and 'model'
                    genai_role = "model" if role in ("model", "assistant", "pal") else "user"
                    contents.append(
                        types.Content(
                            role=genai_role,
                            parts=[types.Part.from_text(text=text)]
                        )
                    )

        # Add current user message
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_message)]
            )
        )

        config = types.GenerateContentConfig(
            system_instruction=sys_inst,
            temperature=0.7,
            max_output_tokens=300,
        )

        try:
            response = self._client.models.generate_content(
                model=self.model,
                contents=contents,
                config=config,
            )

            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            reply_text = response.text.strip() if response.text else ""

            logger.info(
                f"Generated Gemini interview response in {latency_ms}ms (model: {self.model})"
            )

            return {
                "text": reply_text,
                "model": self.model,
                "latency_ms": latency_ms,
            }

        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}", exc_info=True)
            raise RuntimeError(f"Gemini API generation failed: {str(e)}")
