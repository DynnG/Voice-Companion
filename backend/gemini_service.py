import os
import re
import json
import logging
import asyncio
from typing import List, Dict, Any, Optional
import httpx

try:
    from .config import GEMINI_API_KEY, GEMINI_MODEL
except ImportError:
    from config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger("voice-companion-gemini")


INTERVIEW_SYSTEM_PROMPT = """You are Pal, an expert, thoughtful, and analytical job interviewer. Your role is to conduct a realistic, dynamic, and professional technical and behavioral job interview.

Core Guidelines:
1. Act exclusively as the Interviewer. Never answer the interview questions yourself.
2. Ask ONE focused, realistic question at a time during an active interview. Keep questions concise, natural, and direct (1-2 sentences).
3. Conversational Tone & Anti-Rigidity:
   - Speak naturally like a real hiring manager who has personally reviewed the candidate's portfolio, resume, and role requirements.
   - BANNED CLICHÉS & RIGID SCRIPTS:
     * NEVER start with canned or robotic greetings: NO "Welcome!", NO "Welcome to your interview practice", NO "To get started...", NO generic "could you walk me through your background and what motivated you...".
     * NEVER sound like a customer service rep or cheerleader: Avoid repetitive hollow praise ("Great!", "That's a great answer!", "Awesome!", "Thank you for sharing!", "Good job!").
     * NEVER sound like you are mechanically reading off paper: Avoid constantly saying "According to your resume..." or "In your attached document...". Instead, speak directly about their projects, architecture, and tools as familiar facts (e.g. "Looking at your work on the Aura Android app...", "In Project SkyPulse, you handled...").
4. Dynamic Opening Question:
   - The opening question MUST be dynamically constructed from the candidate's actual documents and the target role.
   - Do NOT use a one-size-fits-all generic opening.
   - Ground the opening in a compelling, concrete detail from their background:
     * A key project (e.g. "Geraldyn, I've reviewed your background. Let's start with your experience on the Aura Android app—what was the most technically challenging part of building it?")
     * A recent role, team leadership, or architectural milestone
     * A notable system design decision, framework, or performance metric from their documents
     * If no documents are attached, jump straight into an intelligent, practical scenario relevant to the target role.
5. Candidate Name:
   - If the candidate's name is explicitly found in their attached documents, you may use it naturally (e.g. in the opening or when concluding).
   - Do NOT invent or guess a name if absent.
   - Do NOT repeatedly use the candidate's name in every single response.
6. Authoritative Document Grounding (PRIORITY):
   - The candidate's attached documents (resume, CV, portfolio, project notes, job description) provide the authoritative ground truth for this interview.
   - You MUST prioritize asking questions about the candidate's actual projects, work experience, system architectures, technologies, tools, responsibilities, metrics, and achievements explicitly detailed in their uploaded documents.
   - Generic interview questions (boilerplate behavioral clichés) must NOT be the default when relevant document information exists.
   - When the candidate answers about a specific project, system, or technology from their documents, follow up deeply on that same project (e.g. architectural trade-offs, scalability, edge cases, metrics, technical decisions).
   - Never invent or hallucinate document facts.
7. Response Style & Topic Transitions:
   - Same-Topic Follow-ups (Deep Probing):
     * When continuing on the SAME project, problem, architecture, or topic, keep the question direct, concise, and focused.
     * Do NOT add artificial acknowledgments, compliments, or conversational filler on every turn.
     * Example: "You mentioned UI mismatches. How did you diagnose the issue?"
   - Topic Transitions (Moving to a New Project, Skill, or Interview Area):
     * When you have sufficiently covered the current topic and are moving to a DIFFERENT project, skill, experience, or interview competency from their documents, briefly acknowledge the SUBSTANCE of the candidate's answer before transitioning to the next question.
     * The acknowledgment should be brief—usually 1 short sentence—and must acknowledge the actual CONTENT of what they described rather than using generic filler.
     * Then naturally transition to the next document-grounded question.
     * Examples:
       - "That highlights the frontend challenges you handled. Moving to another project, how did you ensure the design rendered consistently across mobile and desktop devices?"
       - "That gives me a clearer picture of your approach. Let's look at another part of the project: why did you choose React?"
       - "That clarifies the trade-offs you balanced with Kafka. Shifting to your work on Project DataVault, how did you automate secrets rotation?"
     * Do NOT add acknowledgments when they would make the response unnecessarily long.
8. Clarification & Candidate Questions:
   - If the candidate asks a question or seeks clarification (e.g. "What project are you talking about?", "Which project?", "What company?", "What do you mean?"), you MUST directly answer their question first by explicitly naming and identifying the specific project or experience from their attached documents. Then, ask your follow-up interview question about that project. Do NOT ignore the candidate's question.
9. Short answers:
   - If the candidate gives a brief, vague, or short answer (e.g., "yes", "no", "I agree", "that's it"), DO NOT end the interview. Instead, probe deeper with a clarifying follow-up question asking for specific technical details, metrics, or a concrete example.
10. Adaptive Interview Lifecycle & Coverage Evaluation:
   - The interview must feel adaptive rather than following a predetermined question list or a simple fixed question count.
   - For every candidate turn:
     * Analyze the latest answer for substance, technical depth, problem-solving, and concrete evidence.
     * Deep-probe into the same project or technical decision when more detail is needed.
     * Clarify immediately if the candidate asks which project/company you are referring to.
     * Transition smoothly with a brief substantive acknowledgment when moving to a new topic or project.
   - PAL determines when the interview has gathered enough information across relevant areas:
     * Candidate background & role alignment
     * Document-specific projects and technical experience
     * Technical skills, architecture, and tooling
     * Problem-solving, debugging, edge cases, and trade-offs
     * Role-relevant experience, behavioral or situational evidence when appropriate
     * Job-description requirements when a job description is attached.
11. The Wrap-up Question (MANDATORY BEFORE ENDING):
   - The wrap-up question must NOT be triggered by a simple fixed question count alone. PAL determines that the interview has gathered enough information across the relevant areas above.
   - Before ending, PAL MUST ask ONE meaningful wrap-up question that gives the candidate an opportunity to add something relevant that has not yet been covered.
   - In this turn:
     * Return: should_end=false, reason="wrapup_question"
     * Example: "We've covered your key projects, architecture, and problem-solving approaches today. Before we wrap up, is there anything else about your experience, achievements, or background that we haven't touched on that you would like to share?"
12. Professional Closing (AFTER WRAP-UP ANSWER):
   - When the candidate answers the wrap-up question (or if they explicitly asked to conclude early):
     * Provide a brief professional closing statement (1-2 sentences thanking them for their time and concluding the session).
     * Do NOT ask another question.
     * Set should_end=true and reason="sufficient_coverage" (or "user_requested_end").
13. Output Format:
   You MUST return a valid JSON object matching this schema:
   {
     "response": "<Your spoken interviewer question, wrap-up question, or closing statement. 1-2 sentences maximum. Spoken text only, no markdown headers or lists.>",
     "should_end": <true ONLY if concluding now after wrap-up answer or user request, false if continuing or asking wrap-up question>,
     "reason": "<One of: 'user_requested_end' | 'sufficient_coverage' | 'wrapup_question' | 'continue_interview' | 'probing_short_answer' | 'clarifying_project'>"
   }
"""

# FALLBACK_FOLLOWUP_QUESTIONS is disabled for normal interview operation.
# Gemini is the sole source of dynamically generated interview questions.
# Quota, rate limits, and network errors return structured error states instead of generic fake questions.
FALLBACK_FOLLOWUP_QUESTIONS: List[str] = []


def sanitize_error_message(msg: str) -> str:
    """Strip or redact API keys or credentials from error logs and traces."""
    if not msg:
        return ""
    sanitized = re.sub(r'([?&]key=)[^&\s"\']+', r'\1[REDACTED]', msg)
    sanitized = re.sub(r'(?:AIza[0-9A-Za-z\-_]{20,}|AQ\.[0-9A-Za-z\-_]{10,})', '[REDACTED_API_KEY]', sanitized)
    return sanitized


class GeminiQuotaExceededError(Exception):
    """Raised when Gemini returns HTTP 429 / RESOURCE_EXHAUSTED or quota limit is reached."""
    pass


class GeminiConnectionError(Exception):
    """Raised when network / connection failures prevent reaching the Gemini API."""
    pass


class GeminiServiceError(Exception):
    """Raised when Gemini returns a 5xx server error or other API failure."""
    pass


def classify_gemini_error(err: Exception) -> str:
    """
    Categorize Gemini failures into specific machine-readable categories:
    - 'quota_exceeded': HTTP 429, RESOURCE_EXHAUSTED, rate limit, quota exceeded
    - 'connection_error': network failure, connection refused, timeout, host unreachable
    - 'ai_service_error': HTTP 500, 503, bad request, generic Gemini API errors
    - 'malformed_response': unparsable JSON, empty response candidates
    """
    if isinstance(err, GeminiQuotaExceededError):
        return "quota_exceeded"
    if isinstance(err, GeminiConnectionError):
        return "connection_error"
    if isinstance(err, GeminiServiceError):
        return "ai_service_error"
    if isinstance(err, json.JSONDecodeError):
        return "malformed_response"

    err_str = str(err).lower()
    type_str = type(err).__name__.lower()

    # Specifically detect HTTP 429 / RESOURCE_EXHAUSTED / quota / rate limit
    if any(q in err_str or q in type_str for q in (
        "429", "quota", "resource_exhausted", "rate limit", "rate_limit",
        "exceeded your current quota", "generaterequestsperday", "quota_exceeded", "quota_exhausted"
    )):
        return "quota_exceeded"

    # Malformed response
    if any(m in err_str or m in type_str for m in (
        "malformed", "jsondecodeerror", "invalid response", "empty candidate text", "empty candidate", "not valid json"
    )):
        return "malformed_response"

    # Connection / Network error
    if any(c in err_str or c in type_str for c in (
        "connect", "timeout", "network", "unreachable", "name resolution", "dns",
        "connection refused", "connection error", "connection_error", "remoteprotocolerror"
    )):
        return "connection_error"

    # Other API errors
    return "ai_service_error"


def get_user_friendly_error_message(error_type: str) -> str:
    """Return clear user-facing explanation for each failure type without pretending to be a question."""
    if error_type in ("quota_exceeded", "quota_exhausted"):
        return "AI interviewer is temporarily unavailable because the Gemini API usage limit has been reached. Please try again later."
    elif error_type == "connection_error":
        return "AI interviewer is temporarily unavailable due to a connection error. Please try again in a moment."
    elif error_type == "malformed_response":
        return "AI interviewer is temporarily unavailable due to an unexpected response format. Please try again in a moment."
    else:  # ai_service_error or unclassified
        return "AI interviewer is temporarily unavailable due to an AI service error. Please try again in a moment."


JOB_TITLE_AND_SECTION_WORDS = {
    "resume", "cv", "curriculum", "vitae", "candidate", "summary", "profile",
    "contact", "email", "phone", "experience", "education", "skills",
    "technical", "portfolio", "senior", "junior", "lead", "staff", "principal",
    "chief", "director", "manager", "engineer", "developer", "designer",
    "architect", "analyst", "specialist", "administrator", "consultant", "intern",
    "coordinator", "officer", "full", "stack", "frontend", "backend", "software",
    "devops", "cloud", "data", "system", "systems", "position", "role", "overview",
    "requirements", "qualifications", "responsibilities", "description", "spec",
    "specification", "job", "title", "about", "target", "company"
}


def extract_candidate_name(attached_docs: Optional[List[Dict[str, Any]]]) -> Optional[str]:
    """
    Extract candidate name ONLY if explicitly present in resume/CV text.
    Never guesses or invents names. Never extracts names from job descriptions.
    """
    if not attached_docs:
        return None

    for doc in attached_docs:
        category = str(doc.get("category", "")).lower()
        filename = str(doc.get("filename") or doc.get("name") or "").lower()

        # If it's explicitly a job description, skip name extraction
        if any(jd_term in category or jd_term in filename for jd_term in ("job_description", "job description", "jd", "job_desc", "requirements", "spec")):
            continue

        text = (
            doc.get("content")
            or doc.get("extracted_text")
            or doc.get("extractedText")
            or ""
        ).strip()

        if not text:
            continue

        lines = [line.strip() for line in text.split("\n") if line.strip()]
        if not lines:
            continue

        for line in lines[:4]:
            # Pattern: "Name: Geraldyn Vance"
            if re.match(r"^name\s*:\s*", line, re.IGNORECASE):
                name_candidate = re.sub(r"^name\s*:\s*", "", line, flags=re.IGNORECASE).strip()
                words = name_candidate.split()
                if 2 <= len(words) <= 4 and not any(w.lower() in JOB_TITLE_AND_SECTION_WORDS for w in words):
                    if all(w.replace("-", "").replace("'", "").isalpha() for w in words):
                        return name_candidate

            # Pattern: "Geraldyn Vance - Lead..." or "Geraldyn Vance | Lead..."
            for sep in (" - ", " | ", " • ", " / "):
                if sep in line:
                    part = line.split(sep)[0].strip()
                    words = part.split()
                    if 2 <= len(words) <= 4 and not any(w.lower() in JOB_TITLE_AND_SECTION_WORDS for w in words):
                        if all(w.replace("-", "").replace("'", "").isalpha() for w in words):
                            return part

            # Pattern: "Geraldyn Vance" as a standalone line
            words = line.split()
            if 2 <= len(words) <= 4 and not any(w.lower() in JOB_TITLE_AND_SECTION_WORDS for w in words):
                if all(w.replace("-", "").replace("'", "").isalpha() for w in words):
                    return line

    return None


def extract_first_project_name(attached_docs: Optional[List[Dict[str, Any]]]) -> Optional[str]:
    """Extract the first identifiable project name from attached documents."""
    if not attached_docs:
        return None
    for doc in attached_docs:
        text = (
            doc.get("content")
            or doc.get("extracted_text")
            or doc.get("extractedText")
            or doc.get("text")
            or ""
        )
        if not text:
            continue
        proj_match = re.search(r"(?:project|app|system|platform)\s+([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)?)", text, re.IGNORECASE)
        if proj_match:
            candidate_proj = proj_match.group(1).strip()
            if len(candidate_proj) > 2 and candidate_proj.lower() not in ("the", "this", "a", "an", "management", "overview", "experience"):
                return candidate_proj
    return None


def generate_dynamic_opening_fallback(
    job_role: Optional[str],
    attached_docs: Optional[List[Dict[str, Any]]],
    candidate_name: Optional[str]
) -> str:
    """
    Generate a dynamic, natural opening interview question based on actual document content,
    completely avoiding rigid templates like 'Welcome! To get started...'.
    """
    role = (job_role or "Software Developer").strip()
    name_greeting = f"{candidate_name}, " if candidate_name else ""

    project_found = extract_first_project_name(attached_docs)
    tech_found = None

    if attached_docs:
        for doc in attached_docs:
            text = (
                doc.get("content")
                or doc.get("extracted_text")
                or doc.get("extractedText")
                or doc.get("text")
                or ""
            )
            if not text:
                continue

            for tech in ("Kubernetes", "Kafka", "React", "Go", "Golang", "Python", "AWS", "Android", "Vault", "Docker", "Node", "TypeScript", "Terraform"):
                if re.search(rf"\b{tech}\b", text, re.IGNORECASE):
                    tech_found = tech
                    break

            if tech_found:
                break

    if project_found:
        return f"{name_greeting}I've reviewed your background. Let's start with your work on Project {project_found}—what was the most technically challenging aspect of that architecture?"
    elif tech_found:
        return f"{name_greeting}I've looked over your experience for the {role} position. Diving right in, could you share a complex challenge you recently solved with {tech_found}?"
    else:
        return f"{name_greeting}I've reviewed your materials for the {role} role. Let's jump into your technical experience: what is a recent engineering project that best showcases your architectural decision-making?"

EARLY_WRAPUP_PHRASES = (
    "stop the interview", "end the interview", "wrap up", "wrap it up", "wrap this up",
    "have to go", "have to leave", "got to go", "gotta go",
    "can we finish", "let's finish", "can we conclude", "let's conclude",
    "stop here", "end here", "finish here", "conclude here",
    "that's all for today", "that's all for now", "that's all i have", "all the time i have",
    "i'm done", "i am done", "done with the interview",
    "conclude the interview", "finish the interview",
    "end the interview here", "wrap up now",
    "conclude our", "conclude this", "conclude the session", "conclude practice",
    "finish our", "end our", "wrap up our", "wrap up the session"
)


def is_user_requesting_wrapup(text: str) -> bool:
    """Detect whether candidate explicitly asks to conclude or wrap up the interview."""
    clean_lower = text.lower()
    return any(phrase in clean_lower for phrase in EARLY_WRAPUP_PHRASES) or (
        "conclude" in clean_lower and any(w in clean_lower for w in ("session", "interview", "today", "now", "here"))
    )


CLARIFICATION_PHRASES = (
    "what project", "which project", "what project are you talking about",
    "which project are you talking about", "what project are you referring to",
    "which project are you referring to", "what company", "which company",
    "what experience", "which experience", "what role", "which role",
    "clarify which project", "clarify what project", "which one are you referring to",
    "which one do you mean", "what do you mean by that project", "what project was that",
    "what project do you mean", "which project is that", "what do you mean by",
    "which system", "what system are you talking about"
)


def is_clarification_request(text: str) -> bool:
    """Detect whether candidate is asking for clarification about a project, company, or experience."""
    clean_lower = text.lower().strip()
    return any(phrase in clean_lower for phrase in CLARIFICATION_PHRASES)


WRAPUP_QUESTION_PHRASES = (
    "before we wrap up", "before we conclude", "before we finish", "before ending",
    "anything else about your", "anything else you'd like to", "anything else you would like to",
    "anything additional you'd like", "anything additional you would like",
    "anything we haven't touched on", "anything we haven't discussed", "anything we haven't covered",
    "anything you'd like to add", "anything you would like to add",
    "anything you'd like to share", "anything you would like to share",
    "anything else you'd like to highlight", "anything else you would like to highlight",
    "anything else you'd like to mention", "anything else you would like to mention",
    "opportunity to add", "opportunity to share",
    "final thought", "any final details"
)


def is_wrapup_question(text: str) -> bool:
    """Detect whether interviewer question is the final wrap-up opportunity question."""
    if not text:
        return False
    lower = text.lower()
    return any(p in lower for p in WRAPUP_QUESTION_PHRASES) or (
        ("before we conclude" in lower or "before we wrap up" in lower or "before we finish" in lower)
        and any(w in lower for w in ("anything", "something", "share", "add", "touch", "highlight", "mention"))
    )


def extract_conversational_text(raw_text: str) -> str:
    """
    Extract ONLY the natural spoken conversational text from Gemini output.
    Strips JSON keys, braces, and Markdown code blocks (```json ... ```).
    Guarantees no JSON or code fences are ever returned as conversational speech.
    """
    if not raw_text:
        return ""

    text = raw_text.strip()

    # Step 1: Strip markdown code fences if wrapped
    fence_pattern = r"^```(?:json)?\s*([\s\S]*?)\s*```$"
    fence_match = re.match(fence_pattern, text, re.IGNORECASE)
    if fence_match:
        text = fence_match.group(1).strip()
    else:
        # Check if code block is embedded within other text
        block_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if block_match:
            candidate = block_match.group(1).strip()
            if "{" in candidate and "}" in candidate:
                text = candidate

    # Step 2: Try JSON parsing
    if "{" in text and "}" in text:
        first_brace = text.find("{")
        last_brace = text.rfind("}")
        json_slice = text[first_brace : last_brace + 1]
        try:
            data = json.loads(json_slice, strict=False)
            if isinstance(data, dict) and "response" in data:
                resp = str(data.get("response", "")).strip()
                if resp:
                    if (resp.startswith('"') and resp.endswith('"')) or (resp.startswith("'") and resp.endswith("'")):
                        resp = resp[1:-1].strip()
                    return resp
        except Exception:
            pass

    # Step 3: Regex extraction for "response" field if full JSON decode failed
    resp_match = re.search(r'"response"\s*:\s*"((?:[^"\\]|\\.)*)"', text, re.DOTALL)
    if resp_match:
        try:
            clean = json.loads(f'"{resp_match.group(1)}"', strict=False).strip()
            if (clean.startswith('"') and clean.endswith('"')) or (clean.startswith("'") and clean.endswith("'")):
                clean = clean[1:-1].strip()
            return clean
        except Exception:
            clean = resp_match.group(1).replace(r'\"', '"').replace(r'\n', ' ').strip()
            if (clean.startswith('"') and clean.endswith('"')) or (clean.startswith("'") and clean.endswith("'")):
                clean = clean[1:-1].strip()
            return clean

    # Step 4: If text still resembles a raw JSON object, remove JSON boilerplate
    if text.startswith("{") and text.endswith("}"):
        cleaned = re.sub(r'"(?:response|should_end|reason)"\s*:', '', text)
        cleaned = re.sub(r'[\{\}\[\]]', '', cleaned)
        cleaned = re.sub(r'"\s*,?', '', cleaned)
        cleaned = cleaned.strip(' \n\r\t')
        if cleaned and not cleaned.lower().startswith(('false', 'true', 'continue')):
            return cleaned

    # Step 5: Plain conversational text
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1].strip()

    return text


def parse_gemini_interview_json(
    raw_text: str,
    clean_answer: str,
    user_wants_to_end: bool,
    user_turn_count: int,
    candidate_name: Optional[str] = None,
    was_wrapup_question: bool = False
) -> Dict[str, Any]:
    """
    Robust JSON parser for Gemini interview follow-up output.
    Enforces business logic rules (e.g. short answers do NOT end; wrap-up question must be answered before concluding).
    Extracts ONLY natural speech for 'response', never exposing JSON or code fences to the UI.
    """
    text = raw_text.strip()

    # Unwrap markdown code blocks
    fence_pattern = r"^```(?:json)?\s*([\s\S]*?)\s*```$"
    fence_match = re.match(fence_pattern, text, re.IGNORECASE)
    if fence_match:
        text = fence_match.group(1).strip()
    else:
        block_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if block_match:
            candidate = block_match.group(1).strip()
            if "{" in candidate and "}" in candidate:
                text = candidate

    parsed: Optional[Dict[str, Any]] = None
    if "{" in text and "}" in text:
        first_brace = text.find("{")
        last_brace = text.rfind("}")
        json_slice = text[first_brace : last_brace + 1]
        try:
            data = json.loads(json_slice, strict=False)
            if isinstance(data, dict):
                parsed = data
        except Exception:
            pass

    spoken_response: str = ""
    should_end: bool = False
    reason: str = "continue_interview"

    if parsed and "response" in parsed:
        spoken_response = str(parsed.get("response", "")).strip()
        raw_should_end = parsed.get("should_end", False)
        if isinstance(raw_should_end, str):
            should_end = raw_should_end.strip().lower() in ("true", "1", "yes")
        else:
            should_end = bool(raw_should_end)
        reason = str(parsed.get("reason", "continue_interview"))
    else:
        # Fallback regex extraction if full JSON parsing failed
        resp_match = re.search(r'"response"\s*:\s*"((?:[^"\\]|\\.)*)"', text, re.DOTALL)
        if resp_match:
            try:
                spoken_response = json.loads(f'"{resp_match.group(1)}"', strict=False).strip()
            except Exception:
                spoken_response = resp_match.group(1).replace(r'\"', '"').replace(r'\n', ' ').strip()

            end_match = re.search(r'"should_end"\s*:\s*(true|false)', text, re.IGNORECASE)
            if end_match:
                should_end = end_match.group(1).lower() == "true"

            reason_match = re.search(r'"reason"\s*:\s*"([^"]+)"', text)
            if reason_match:
                reason = reason_match.group(1)
        else:
            spoken_response = text
            should_end = False
            reason = "continue_interview"

    # Always clean spoken_response so it never has JSON, code fences, or braces
    spoken_response = extract_conversational_text(spoken_response)
    if not spoken_response:
        spoken_response = "That provides helpful context on your approach. Could you tell me more about how you would apply those skills in this role?"

    # Rule 1: Explicit user request to conclude/end early
    if user_wants_to_end:
        should_end = True
        reason = "user_requested_end"
        if not spoken_response or ("?" in spoken_response):
            name_str = f", {candidate_name}" if candidate_name else ""
            spoken_response = f"Thank you for your time today{name_str}. That concludes our practice interview session. Best of luck with your upcoming interviews!"

    # Rule 2: Candidate answered the wrap-up question -> conclude interview
    elif was_wrapup_question:
        should_end = True
        reason = "sufficient_coverage"
        if not spoken_response or ("?" in spoken_response):
            name_str = f", {candidate_name}" if candidate_name else ""
            spoken_response = f"Thank you for sharing that{name_str}. It was a pleasure learning about your experience and background today. That concludes our practice interview session—best of luck with your upcoming interviews!"

    # Rule 3: Short answers MUST NOT end the interview
    else:
        clean_lower = clean_answer.lower().strip()
        words = clean_answer.split()
        is_short_answer = len(words) <= 4 and (
            clean_lower in ("yes", "no", "yeah", "yep", "nope", "i agree", "that's it", "that was it", "sure", "correct", "right", "ok", "okay")
            or len(words) <= 2
        )
        if is_short_answer:
            should_end = False
            reason = "probing_short_answer"
        elif reason == "wrapup_question":
            should_end = False
        elif not user_wants_to_end and user_turn_count < 2:
            should_end = False
            reason = "continue_interview"

    # Clean spoken response of any leftover outer quotation marks
    if (spoken_response.startswith('"') and spoken_response.endswith('"')) or (spoken_response.startswith("'") and spoken_response.endswith("'")):
        spoken_response = spoken_response[1:-1].strip()

    return {
        "response": spoken_response,
        "should_end": should_end,
        "reason": reason
    }


class GeminiInterviewService:
    _instance: Optional["GeminiInterviewService"] = None

    @classmethod
    def get_instance(cls) -> "GeminiInterviewService":
        if cls._instance is None:
            cls._instance = GeminiInterviewService()
        return cls._instance

    def __init__(self):
        self.api_key = GEMINI_API_KEY or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        self.model = GEMINI_MODEL or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        self.fallback_index = 0

    def _get_fallback_question(self, user_answer: str = "") -> str:
        question = FALLBACK_FOLLOWUP_QUESTIONS[self.fallback_index % len(FALLBACK_FOLLOWUP_QUESTIONS)]
        self.fallback_index += 1
        return question

    def _build_context_header(
        self,
        job_role: Optional[str],
        attached_docs: Optional[List[Dict[str, Any]]],
        interview_id: Optional[str] = None
    ) -> str:
        role = job_role.strip() if job_role else "Software Developer"
        context_str = f"Target Role: {role}\n"

        candidate_name = extract_candidate_name(attached_docs)
        if candidate_name:
            context_str += f"Detected Candidate Name: {candidate_name} (explicitly found in uploaded documents)\n"
            context_str += f"Candidate Name Guidance: Address the candidate naturally by name ({candidate_name}) when appropriate.\n"
        else:
            context_str += "Candidate Name: NO candidate name was found in the uploaded documents. DO NOT guess, fabricate, or invent a name. Address the candidate politely without a name.\n"

        has_job_description = False
        if attached_docs:
            for doc in attached_docs:
                category = str(doc.get("category", "")).lower()
                filename = str(doc.get("filename") or doc.get("name") or "").lower()
                if any(jd_term in category or jd_term in filename for jd_term in ("job_description", "job description", "jd", "job_desc", "spec", "requirements")):
                    has_job_description = True
                    break

        if has_job_description:
            context_str += "Target Role Directives: A Job Description document is attached above. Actively evaluate the candidate against the core requirements, responsibilities, and technical qualifications detailed in the Job Description.\n"

        total_chars = 0
        if attached_docs:
            doc_sections = []
            for doc in attached_docs:
                name = doc.get("name") or doc.get("filename") or "Document"
                category = str(doc.get("category", "document")).replace("_", " ").title()
                raw_content = (
                    doc.get("content")
                    or doc.get("extracted_text")
                    or doc.get("extractedText")
                    or doc.get("text")
                    or ""
                ).strip()

                if raw_content:
                    total_chars += len(raw_content)
                    doc_sections.append(
                        f"--- Attached {category}: {name} ---\n"
                        f"{raw_content}\n"
                        f"--- End of {name} ---"
                    )
                else:
                    doc_sections.append(f"- {category}: {name} (filename only provided)")

            if doc_sections:
                context_str += "\nAttached Candidate Materials (Full Extracted Content):\n"
                context_str += "\n\n".join(doc_sections) + "\n"

        has_doc_content = total_chars > 0
        logger.info(
            f"[Gemini Prompt Context] interview_id={interview_id or 'none'} | "
            f"documents_count={len(attached_docs or [])} | "
            f"extracted_text_char_count={total_chars} | "
            f"document_context_included={has_doc_content}"
        )

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
        return os.getenv("GEMINI_MODEL") or GEMINI_MODEL or "gemini-3.8-flash"

    async def generate_initial_question(
        self,
        job_role: Optional[str] = None,
        attached_docs: Optional[List[Dict[str, Any]]] = None,
        interview_id: Optional[str] = None
    ) -> str:
        """
        Generate a dynamic opening interview question tailored to the candidate's actual documents and role.
        Never relies on rigid scripts or boilerplate greetings.
        """
        api_key = self.get_api_key()
        candidate_name = extract_candidate_name(attached_docs)
        context_header = self._build_context_header(job_role, attached_docs, interview_id=interview_id)
        role = (job_role or "Software Developer").strip()

        name_instruction = (
            f"Candidate Name: '{candidate_name}' is detected in their uploaded documents. Greet them naturally by name (e.g. '{candidate_name}, I\'ve reviewed your background. Let\'s start with...'). Do NOT invent a name or repeat it incessantly."
            if candidate_name
            else "Candidate Name: NO candidate name was found in documents. Address them professionally without a name. DO NOT invent or guess a name."
        )

        prompt = (
            f"[Interview Setup]\n{context_header}\n\n"
            f"You are Pal, an expert and analytical interviewer beginning a technical and behavioral interview for the role of {role}.\n\n"
            f"CRITICAL OPENING REQUIREMENTS:\n"
            f"1. BANNED CLICHÉS: NEVER start with rigid, scripted pleasantries such as:\n"
            f"   - 'Welcome!'\n"
            f"   - 'To get started...'\n"
            f"   - 'Could you walk me through your background and what motivated you...'\n"
            f"   - 'Tell me about yourself'\n"
            f"   - 'According to your resume...'\n"
            f"2. {name_instruction}\n"
            f"3. DYNAMIC ENTRY POINT: Generate a sharp, realistic opening question grounded in the candidate's actual attached materials.\n"
            f"   Pick the most compelling angle from their profile:\n"
            f"   - A notable project (e.g., '{candidate_name or ''}, I\'ve reviewed your background. Let\'s start with your work on [Project Name]—what was the most technically challenging part of that build?').\n"
            f"   - A recent leadership or architectural responsibility.\n"
            f"   - A key technology, metric, or problem solved mentioned in their materials.\n"
            f"   - If no documents are attached, jump straight into an intelligent real-world scenario relevant to {role}.\n"
            f"4. Sound like an interviewer who already read their documents beforehand—concise, conversational, and direct (1-2 sentences maximum).\n"
            f"Return a valid JSON object matching: {{\"response\": \"<spoken opening question>\", \"should_end\": false, \"reason\": \"initial_question\"}}."
        )

        if not api_key:
            logger.warning("[Whisper->Gemini] GEMINI_API_KEY not configured in backend environment.")
            return "AI interviewer is temporarily unavailable because the Gemini API key is not configured. Please configure GEMINI_API_KEY."

        try:
            logger.info(f"Generating initial interview question with Gemini for role: {job_role}...")
            raw_text = await self._call_gemini_api(
                contents=[{"role": "user", "parts": [{"text": prompt}]}],
                api_key=api_key,
                enforce_json=True
            )
            clean_question = extract_conversational_text(raw_text)
            if not clean_question:
                clean_question = parse_gemini_interview_json(
                    raw_text, clean_answer="", user_wants_to_end=False, user_turn_count=0, candidate_name=candidate_name
                )["response"]
            return clean_question
        except Exception as e:
            error_type = classify_gemini_error(e)
            user_msg = get_user_friendly_error_message(error_type)
            sanitized_detail = sanitize_error_message(str(e))
            logger.error(f"[Whisper->Gemini] Error generating initial question with Gemini ({error_type}): {sanitized_detail}")
            return user_msg

    async def generate_interview_followup(
        self,
        user_answer: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        job_role: Optional[str] = None,
        attached_docs: Optional[List[Dict[str, Any]]] = None,
        interview_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze the candidate's answer and generate the next interview question or closing statement.
        Returns structured dictionary:
        {
            "response": str,
            "should_end": bool,
            "reason": str
        }
        """
        clean_answer = (user_answer or "").strip()
        if not clean_answer:
            return {
                "response": "I didn't quite catch that. Could you please repeat or elaborate on your answer?",
                "should_end": False,
                "reason": "empty_input"
            }

        candidate_name = extract_candidate_name(attached_docs)
        api_key = self.get_api_key()
        context_header = self._build_context_header(job_role, attached_docs, interview_id=interview_id)

        # Detect explicit user requests to conclude early
        user_wants_to_end = is_user_requesting_wrapup(clean_answer)

        # Detect clarification request (e.g. "What project are you talking about?")
        is_clarification = is_clarification_request(clean_answer)

        # Deduplicate history if clean_answer was already appended
        effective_history = list(conversation_history or [])
        if effective_history:
            last_msg = effective_history[-1]
            if last_msg.get("sender", "").lower() in ("you", "user") and last_msg.get("text", "").strip() == clean_answer:
                effective_history = effective_history[:-1]

        # Determine whether the previous interviewer turn was the wrap-up question
        last_interviewer_msg = ""
        for m in reversed(effective_history):
            sender = m.get("sender", "").lower()
            if sender in ("pal", "ai", "interviewer", "bot", "assistant"):
                last_interviewer_msg = (m.get("text") or "").strip()
                break

        was_wrapup_question = is_wrapup_question(last_interviewer_msg)

        # Count candidate turns
        user_turn_count = sum(
            1 for m in effective_history
            if m.get("sender", "").lower() in ("you", "user")
        ) + 1

        logger.info(
            f"[Whisper->Gemini] Analyzing candidate turn {user_turn_count} "
            f"(wants_end={user_wants_to_end}, was_wrapup={was_wrapup_question}, clarification={is_clarification}): \"{clean_answer[:60]}\""
        )

        if not api_key:
            logger.warning("[Whisper->Gemini] GEMINI_API_KEY not configured in backend environment.")
            if user_wants_to_end:
                name_str = f", {candidate_name}" if candidate_name else ""
                return {
                    "response": f"Thank you for taking the time to practice with me today{name_str}. That concludes our practice session. Best of luck with your upcoming interviews!",
                    "should_end": True,
                    "reason": "user_requested_end",
                    "status": "success",
                    "error_type": None,
                    "error_message": None
                }

            user_msg = "AI interviewer is temporarily unavailable because the Gemini API key is not configured. Please set GEMINI_API_KEY."
            return {
                "response": user_msg,
                "should_end": False,
                "reason": "gemini_api_error",
                "status": "error",
                "error_type": "api_error",
                "error_message": user_msg
            }

        # Build conversation turns for Gemini
        contents: List[Dict[str, Any]] = []

        initial_context_prompt = (
            f"[Interview Setup]\n{context_header}\n\n"
            f"You are Pal, an expert and empathetic technical and behavioral interviewer conducting a live conversational interview for the position of {job_role or 'the target role'}.\n"
            f"CRITICAL GROUNDING DIRECTIVE: You have full access to the candidate's attached materials above. "
            f"Always prioritize questions grounded in the concrete projects, technologies, and achievements from these materials. "
            f"Do not ask generic questions when document context is available.\n"
            f"Always return your answer in valid JSON matching the schema: {{\"response\": \"<conversational text>\", \"should_end\": <bool>, \"reason\": \"<string>\"}}."
        )

        contents.append({
            "role": "user",
            "parts": [{"text": initial_context_prompt}]
        })
        contents.append({
            "role": "model",
            "parts": [{"text": "Understood. I have reviewed the candidate materials and guidelines. I will conduct the interview and return valid JSON with response, should_end, and reason."}]
        })

        # Append previous history turns
        if effective_history:
            for item in effective_history:
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

        # Append current user answer with completion guidance
        user_turn_text = f"Candidate Answer (Turn {user_turn_count}): {clean_answer}\n\n"
        if user_wants_to_end:
            user_turn_text += "Note: The candidate explicitly asked to conclude or end the interview. Provide a warm closing statement and set should_end=true, reason='user_requested_end'.\n"
        elif was_wrapup_question:
            user_turn_text += (
                "CRITICAL LIFECYCLE DIRECTIVE - CANDIDATE ANSWERED THE WRAP-UP QUESTION:\n"
                f"In the previous turn, you asked the candidate the final wrap-up question ('{last_interviewer_msg}').\n"
                f"The candidate has now provided their final answer: '{clean_answer}'.\n"
                "You MUST now provide a brief, professional closing statement (1-2 sentences) thanking them and concluding the interview.\n"
                "Do NOT ask any further questions.\n"
                "Set should_end=true and reason='sufficient_coverage'.\n"
                "Return JSON matching the schema."
            )
        elif is_clarification:
            user_turn_text += (
                f"CRITICAL INSTRUCTION - CLARIFICATION REQUEST:\n"
                f"The candidate is asking for clarification about which project or experience you are referring to ('{clean_answer}').\n"
                f"You MUST:\n"
                f"1. Explicitly name the specific project, system, or role from their attached materials in your response "
                f"(e.g., 'I was referring to [Project Name] from your resume...').\n"
                f"2. Then ask your follow-up question regarding that specific project.\n"
                f"3. Set should_end=false and reason='clarifying_project'.\n"
                f"Return JSON matching the required schema."
            )
        else:
            user_turn_text += (
                "ADAPTIVE EVALUATION & LIFECYCLE GUIDANCE:\n"
                "1. Analyze the candidate's latest answer for technical depth, problem-solving, and concrete evidence.\n"
                "2. Assess current interview coverage across:\n"
                "   - Candidate background\n"
                "   - Document-specific projects/experience\n"
                "   - Technical skills & architecture\n"
                "   - Problem-solving & trade-offs\n"
                "   - Role-relevant experience & behavioral evidence\n"
                "   - Job-description requirements (if a job description is attached)\n"
                "3. SAME-TOPIC vs. TOPIC CHANGE:\n"
                "   - SAME TOPIC: If continuing on the same project or technical detail, ask your follow-up directly and concisely without conversational filler. Do NOT praise or add filler on every turn.\n"
                "   - TOPIC CHANGE: If this topic has been sufficiently covered and you are pivoting to a different project, skill, experience, or interview competency from their attached documents, start with ONE brief, professional sentence acknowledging the SUBSTANCE of their answer (referencing the content, NOT saying 'great', 'good answer', 'thank you', or customer service filler), then naturally transition into the next document-grounded question.\n"
                "4. GROUNDING PRIORITY: Ground your question in the concrete projects, technologies, responsibilities, or metrics from the candidate's attached documents. Do NOT revert to generic questions when document context is available.\n"
                "5. DETERMINING SUFFICIENT COVERAGE (NOT A FIXED QUESTION COUNT):\n"
                "   - The interview must feel adaptive rather than following a predetermined question list or a simple fixed question count.\n"
                "   - Assess whether the candidate's core competencies for the role have been sufficiently explored.\n"
                "   - IF COVERAGE IS NOT YET SUFFICIENT: Continue the interview with a relevant follow-up or topic transition. Set should_end=false, reason='continue_interview'.\n"
                "   - IF SUFFICIENT COVERAGE HAS BEEN GATHERED:\n"
                "     * Do NOT end the interview immediately.\n"
                "     * You MUST first ask ONE meaningful wrap-up question giving the candidate an opportunity to add something relevant that has not yet been covered.\n"
                "     * Set should_end=false and reason='wrapup_question'.\n"
                "Return JSON with response, should_end, and reason."
            )

        if contents and contents[-1]["role"] == "user":
            contents[-1]["parts"][0]["text"] += f"\n{user_turn_text}"
        else:
            contents.append({
                "role": "user",
                "parts": [{"text": user_turn_text}]
            })

        try:
            logger.info(f"[Whisper->Gemini] Sending turn {user_turn_count} request to Gemini API ({self.get_model_name()})...")
            raw_response = await self._call_gemini_api(contents=contents, api_key=api_key, enforce_json=True)
            result = parse_gemini_interview_json(
                raw_response,
                clean_answer=clean_answer,
                user_wants_to_end=user_wants_to_end,
                user_turn_count=user_turn_count,
                candidate_name=candidate_name,
                was_wrapup_question=was_wrapup_question
            )

            # LIFECYCLE ENFORCEMENT:
            # If Gemini attempts to conclude with should_end=True, but the wrap-up question was not asked yet:
            if result["should_end"] and not was_wrapup_question and not user_wants_to_end:
                result["should_end"] = False
                result["reason"] = "wrapup_question"
                if not is_wrapup_question(result["response"]):
                    name_greeting = f"{candidate_name}, " if candidate_name else ""
                    result["response"] = (
                        f"We've covered several key technical and project areas today. "
                        f"Before we conclude, {name_greeting}is there anything else about your experience, achievements, or background that we haven't touched on that you'd like to share?"
                    )

            logger.info(
                f"[Whisper->Gemini] Processed output | should_end={result['should_end']} | "
                f"reason='{result['reason']}' | response=\"{result['response'][:60]}...\""
            )
            result["status"] = "success"
            result["error_type"] = None
            result["error_message"] = None
            return result
        except Exception as e:
            error_type = classify_gemini_error(e)
            user_msg = get_user_friendly_error_message(error_type)
            sanitized_err = sanitize_error_message(str(e))
            logger.error(f"[Whisper->Gemini] Gemini API call failed ({error_type}): {sanitized_err}")

            if user_wants_to_end:
                name_str = f", {candidate_name}" if candidate_name else ""
                return {
                    "response": f"Thank you for your time today{name_str}. That concludes our practice interview session. Best of luck with your upcoming interviews!",
                    "should_end": True,
                    "reason": "user_requested_end",
                    "status": "success",
                    "error_type": None,
                    "error_message": None
                }

            return {
                "response": user_msg,
                "should_end": False,
                "reason": f"gemini_{error_type}",
                "status": "error",
                "error_type": error_type,
                "error_message": user_msg
            }

    async def _call_gemini_api(
        self,
        contents: List[Dict[str, Any]],
        api_key: Optional[str] = None,
        enforce_json: bool = False
    ) -> str:
        """
        Execute request to Google Generative Language API.
        """
        effective_key = api_key or self.get_api_key()
        models_to_try = [
            self.get_model_name(),
            "gemini-flash-latest",
        ]
        unique_models = list(dict.fromkeys(models_to_try))

        last_exception = None

        for model_name in unique_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={effective_key}"
            gen_config: Dict[str, Any] = {
                "temperature": 0.7,
                "topP": 0.95,
                "maxOutputTokens": 1024,
                "thinkingConfig": {"thinkingBudget": 0}
            }
            if enforce_json:
                gen_config["responseMimeType"] = "application/json"

            payload = {
                "system_instruction": {
                    "parts": [{"text": INTERVIEW_SYSTEM_PROMPT}]
                },
                "contents": contents,
                "generationConfig": gen_config
            }

            for attempt in range(2):
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
                                if not enforce_json and raw_text.startswith('"') and raw_text.endswith('"'):
                                    raw_text = raw_text[1:-1].strip()
                                return raw_text
                        raise ValueError(f"Empty candidate text returned from Gemini API: {data}")
                    elif response.status_code == 429:
                        error_body = response.text
                        sanitized_body = sanitize_error_message(error_body)
                        logger.warning(f"Gemini model {model_name} returned HTTP 429 (RESOURCE_EXHAUSTED): {sanitized_body}")
                        raise GeminiQuotaExceededError(f"Gemini HTTP 429: RESOURCE_EXHAUSTED: {sanitized_body}")
                    elif response.status_code == 503 and attempt == 0:
                        logger.warning(f"Gemini model {model_name} returned status 503. Retrying after 1s...")
                        await asyncio.sleep(1.0)
                        continue
                    else:
                        error_body = response.text
                        sanitized_body = sanitize_error_message(error_body)
                        logger.warning(f"Gemini model {model_name} returned status {response.status_code}: {sanitized_body}")
                        if "resource_exhausted" in error_body.lower() or "quota" in error_body.lower():
                            raise GeminiQuotaExceededError(f"Gemini Quota Exceeded: {sanitized_body}")
                        last_exception = GeminiServiceError(f"Gemini HTTP {response.status_code}: {sanitized_body}")
                        break
                except GeminiQuotaExceededError:
                    raise
                except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.NetworkError) as net_err:
                    sanitized_ex = sanitize_error_message(str(net_err))
                    logger.warning(f"Network error calling Gemini model {model_name}: {sanitized_ex}")
                    last_exception = GeminiConnectionError(f"Connection error to Gemini: {sanitized_ex}")
                    if attempt == 0:
                        await asyncio.sleep(0.5)
                        continue
                    break
                except Exception as ex:
                    sanitized_ex = sanitize_error_message(str(ex))
                    logger.warning(f"Failed calling Gemini model {model_name}: {sanitized_ex}")
                    if any(q in sanitized_ex.lower() for q in ("429", "quota", "resource_exhausted")):
                        raise GeminiQuotaExceededError(sanitized_ex)
                    last_exception = GeminiServiceError(sanitized_ex)
                    if attempt == 0:
                        await asyncio.sleep(0.5)
                        continue
                    break

        raise last_exception or GeminiServiceError("All Gemini model attempts failed.")
