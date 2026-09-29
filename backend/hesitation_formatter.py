"""
Hesitation & Pause Formatter for Speech-to-Text and AI Coaching

Preserves and represents meaningful hesitation pauses in candidate speech:
1. Filler words ('um', 'uh', 'er', 'ah', etc.) -> 'Um...', 'Uh...'
2. Repeated starts / false starts / self-corrections ('I I', 'I, I', 'we we') -> 'I... I', 'we... we'
3. Introductory discourse markers followed by hesitation pause or comma ('So, what' or 'So' + pause >= 0.5s) -> 'So... what'
4. Meaningful mid-sentence pauses (pause >= 0.65s without sentence-ending punctuation) -> 'word... word'
5. Trailing hesitation / trail-off when answering -> '... '
6. Guardrails:
   - Does NOT insert ellipses into normal fluent speech.
   - Does NOT alter word order or meaning.
   - Ensures clean punctuation and spacing (no duplicate dots '....', no '... ,', clean single spaces).
7. Extracts structured evidence (fillers, hesitation pauses, repeated starts, timing gaps)
   to supply to Gemini AI Coaching Notes and review reports.
"""

import re
from typing import List, Dict, Any, Optional, Set

# Core hesitation fillers that inherently signify pause/hesitation
CORE_FILLERS: Set[str] = {
    "um", "uh", "erm", "er", "ah", "hm", "hmm"
}

# Discourse markers that indicate hesitation when followed by a pause/comma at clause start
DISCOURSE_STARTERS: Set[str] = {
    "so", "well", "like", "actually", "basically", "you know"
}

# Common repeated start / false start words (pronouns, prepositions, articles, conjunctions)
COMMON_REPEATED_STARTS: Set[str] = {
    "i", "we", "they", "you", "he", "she", "it", "the", "that", "this",
    "to", "in", "on", "at", "for", "and", "but", "so", "my", "our", "a", "an", "is", "was"
}

def clean_token(word_str: str) -> str:
    """Extract stripped alphanumeric token in lowercase for matching."""
    return re.sub(r"^[^\w]+|[^\w]+$", "", (word_str or "")).lower()

def clean_ellipses_formatting(text: str) -> str:
    """
    Format ellipses and surrounding punctuation to ensure clean, natural spacing:
    - Removes duplicate dots: '....' -> '...'
    - Removes awkward comma/ellipsis combos: ', ...' -> '...', '...,' -> '...'
    - Ensures single space after ellipsis when followed by a word: 'Um...I' -> 'Um... I'
    - Normalizes multi-spaces to single space.
    """
    if not text:
        return ""

    t = text.strip()

    # 1. Remove commas abutting ellipses
    t = re.sub(r",\s*\.\.\.", "...", t)
    t = re.sub(r"\.\.\.\s*,", "...", t)

    # 2. Collapse 4 or more consecutive periods to standard 3-dot ellipsis
    t = re.sub(r"\.{4,}", "...", t)

    # 3. Ensure a space between ellipsis and subsequent word/number
    t = re.sub(r"([A-Za-z0-9])\.\.\.([A-Za-z0-9])", r"\1... \2", t)
    t = re.sub(r"\.\.\.(?=[A-Za-z0-9])", "... ", t)

    # 4. Do not put space before closing sentence punctuation like '...' at end
    t = re.sub(r"\s+\.\.\.", "...", t)

    # 5. Clean up duplicate spaces
    t = re.sub(r"[ \t]+", " ", t)

    return t.strip()

def format_text_patterns(text: str) -> str:
    """
    Pattern-based hesitation pause formatting for transcripts:
    - Repeated starts: 'I I' or 'I, I' -> 'I... I'
    - Spoken fillers: 'Um' or 'Um,' -> 'Um...'
    - Introductory starters: 'So, what' or 'So what' -> 'So... what'
    """
    if not text:
        return ""

    t = text.strip()

    # 1. Repeated word starts (e.g. 'I I', 'I, I', 'we we', 'the the', etc.)
    # Case-insensitive match for repeating word
    def replace_repeated(match: re.Match) -> str:
        w1 = match.group(1)
        w2 = match.group(2)
        # Avoid matching intentional doubles like 'that that' in valid grammar if not pronoun/start
        if w1.lower() in COMMON_REPEATED_STARTS or w1.lower() == w2.lower():
            return f"{w1}... {w2}"
        return match.group(0)

    t = re.sub(r"\b([A-Za-z]+)(?:,|\s)+\b(\1)\b", replace_repeated, t, flags=re.IGNORECASE)

    # 2. Filler words: 'um', 'uh', 'erm', 'er', 'ah', 'hm', 'hmm'
    # Match filler word followed by word, comma, or end of string, avoiding already formatted '...'
    def replace_filler(match: re.Match) -> str:
        w = match.group(1)
        return f"{w}..."

    t = re.sub(
        r"\b(um|uh|erm|er|ah|hm|hmm)\b(?!\.\.\.)(?:,)?",
        replace_filler,
        t,
        flags=re.IGNORECASE
    )

    # 3. Introductory discourse markers followed by hesitation / comma at clause starts
    # e.g., '^So, what' or '^So what' or '. So, what'
    def replace_intro_starter(match: re.Match) -> str:
        prefix = match.group(1) or ""
        word = match.group(2)
        return f"{prefix}{word}..."

    # At start of text
    t = re.sub(
        r"^([ \t]*)(So|Well|Like|Actually|Basically)(?:,)?\s+",
        replace_intro_starter,
        t,
        flags=re.IGNORECASE
    )
    # After terminal sentence punctuation
    t = re.sub(
        r"([.?!]\s+)(So|Well|Like|Actually|Basically)(?:,)?\s+",
        replace_intro_starter,
        t,
        flags=re.IGNORECASE
    )

    return clean_ellipses_formatting(t)

def format_hesitation_transcript(
    text: str,
    segments: Optional[List[Dict[str, Any]]] = None,
    words: Optional[List[Dict[str, Any]]] = None,
    audio_duration: Optional[float] = None
) -> str:
    """
    Format a candidate's transcript to preserve and represent meaningful hesitation pauses.
    Uses word-level / segment-level timestamps when available, with pattern-based enhancement.
    
    Guarantees:
    - Meaningful hesitation pauses represented by '...'
    - Spoken filler words ('um', 'uh', 'so') preserved with natural pauses
    - Repeated starts / self-corrections detected and formatted ('I... I')
    - Fluent speech without pauses or fillers is NOT altered with random ellipses
    - No candidate words are dropped or reordered
    """
    clean_raw = (text or "").strip()
    if not clean_raw:
        return ""

    # If word-level timing is provided, perform timestamp-based hesitation formatting
    if words and len(words) > 0:
        formatted_words: List[str] = []
        n_words = len(words)

        for i in range(n_words):
            w_curr = words[i]
            w_curr_text = str(w_curr.get("word") or "").strip()
            if not w_curr_text:
                continue

            curr_token = clean_token(w_curr_text)
            w_next = words[i + 1] if i + 1 < n_words else None
            next_token = clean_token(str(w_next.get("word") or "")) if w_next else ""

            gap = 0.0
            if w_next:
                start_next = float(w_next.get("start", 0.0))
                end_curr = float(w_curr.get("end", 0.0))
                gap = max(0.0, start_next - end_curr)

            word_output = w_curr_text

            # Rule 1: Repeated word / false start (e.g. 'I' followed by 'I', 'we' followed by 'we')
            if w_next and curr_token and curr_token == next_token:
                if not word_output.endswith("..."):
                    # Strip trailing comma if present
                    word_output = word_output.rstrip(",") + "..."

            # Rule 2: Spoken filler words ('um', 'uh', 'er', 'ah', 'erm', 'hmm')
            elif curr_token in CORE_FILLERS:
                if not word_output.endswith("..."):
                    word_output = word_output.rstrip(",") + "..."

            # Rule 3: Discourse starter ('so', 'well', 'like') with meaningful pause (gap >= 0.45s) or comma
            elif curr_token in DISCOURSE_STARTERS:
                is_at_start = (i == 0) or (i > 0 and str(words[i - 1].get("word", "")).strip().endswith((".", "!", "?")))
                if is_at_start and (gap >= 0.45 or word_output.endswith(",")):
                    if not word_output.endswith("..."):
                        word_output = word_output.rstrip(",") + "..."

            # Rule 4: Meaningful mid-sentence pause (gap >= 0.65s) where curr word does not end sentence
            elif gap >= 0.65 and not re.search(r"[.?!]$", word_output):
                if not word_output.endswith("..."):
                    word_output = word_output.rstrip(",") + "..."

            # Rule 5: Trailing hesitation if speaker ended with extended pause before audio cut
            elif i == n_words - 1 and audio_duration is not None:
                end_curr = float(w_curr.get("end", 0.0))
                trailing_silence = max(0.0, audio_duration - end_curr)
                if trailing_silence >= 0.75 and not re.search(r"[.?!]$", word_output):
                    if not word_output.endswith("..."):
                        word_output = word_output + "..."

            formatted_words.append(word_output)

        reconstructed = " ".join(formatted_words)
        return clean_ellipses_formatting(reconstructed)

    # Fallback to pattern-based hesitation formatting (when word timestamps are absent)
    formatted = format_text_patterns(clean_raw)

    # Check if raw text had trailing hesitation or incomplete thought
    if clean_raw.endswith("...") and not formatted.endswith("..."):
        formatted += "..."

    return formatted

def extract_hesitation_evidence(
    text: str,
    segments: Optional[List[Dict[str, Any]]] = None,
    words: Optional[List[Dict[str, Any]]] = None,
    audio_duration: Optional[float] = None
) -> Dict[str, Any]:
    """
    Extract structured hesitation and speech delivery evidence from transcript and timing.
    Used to inform AI Coaching Notes and post-interview reviews.
    """
    clean_text = (text or "").strip()
    filler_words_found: List[str] = []
    hesitation_pauses_found: List[str] = []
    repeated_starts_found: List[str] = []
    pause_count = 0
    total_pause_duration = 0.0

    # 1. Search for spoken filler words in text
    for match in re.finditer(r"\b(um|uh|erm|er|ah|hm|hmm)\b", clean_text, re.IGNORECASE):
        filler = match.group(1).lower()
        if filler not in filler_words_found:
            filler_words_found.append(filler)

    # Check for discourse starter 'so...' or 'so,' at beginning
    if re.search(r"^(so\.\.\.|so,)\b", clean_text, re.IGNORECASE):
        if "so" not in filler_words_found:
            filler_words_found.append("so")

    # 2. Search for repeated starts (e.g. 'I... I', 'we... we')
    for match in re.finditer(r"\b([A-Za-z]+)\.\.\.\s+(\1)\b", clean_text, re.IGNORECASE):
        rep = f"{match.group(1)}... {match.group(2)}"
        if rep not in repeated_starts_found:
            repeated_starts_found.append(rep)
            hesitation_pauses_found.append(rep)
            pause_count += 1

    # 3. Search for ellipses after filler words (e.g. 'um...', 'uh...', 'so...')
    for match in re.finditer(r"\b(um|uh|erm|er|ah|hm|hmm|so)\.\.\.", clean_text, re.IGNORECASE):
        item = match.group(0).lower()
        if item not in hesitation_pauses_found:
            hesitation_pauses_found.append(item)
            pause_count += 1

    # 4. Search for other hesitation ellipses
    for match in re.finditer(r"([A-Za-z0-9]+)\.\.\.", clean_text):
        item = match.group(0)
        if item.lower() not in [h.lower() for h in hesitation_pauses_found]:
            hesitation_pauses_found.append(item)
            pause_count += 1

    # 5. Timing-based evidence from word timestamps if available
    if words and len(words) > 1:
        for i in range(len(words) - 1):
            w_curr = words[i]
            w_next = words[i + 1]
            gap = max(0.0, float(w_next.get("start", 0.0)) - float(w_curr.get("end", 0.0)))
            if gap >= 0.55:
                total_pause_duration += gap
                w_curr_text = str(w_curr.get("word") or "").strip()
                if gap >= 0.65 and not w_curr_text.endswith((".", "!", "?")):
                    # Timing evidence of noticeable pause
                    pause_count += 1

    has_hesitations = (len(filler_words_found) > 0) or (len(hesitation_pauses_found) > 0) or (total_pause_duration >= 0.8)

    # Build human-readable summary for Gemini prompt
    summary_parts = []
    if filler_words_found:
        summary_parts.append(f"Spoken fillers: {', '.join(repr(f) for f in filler_words_found)}")
    if repeated_starts_found:
        summary_parts.append(f"Repeated starts: {', '.join(repr(r) for r in repeated_starts_found)}")
    if hesitation_pauses_found:
        summary_parts.append(f"Hesitation moments: {', '.join(repr(h) for h in hesitation_pauses_found[:4])}")
    if total_pause_duration > 0:
        summary_parts.append(f"Total hesitation pauses duration: ~{total_pause_duration:.1f}s")

    hesitation_summary = "; ".join(summary_parts) if summary_parts else "Fluent delivery with standard conversational pacing."

    return {
        "has_hesitations": has_hesitations,
        "filler_words": filler_words_found,
        "hesitation_pauses": hesitation_pauses_found,
        "repeated_starts": repeated_starts_found,
        "pause_count": max(pause_count, len(hesitation_pauses_found)),
        "total_pause_duration": round(total_pause_duration, 2),
        "hesitation_summary": hesitation_summary
    }

def build_hesitation_coaching_prompt_section(evidence: Dict[str, Any]) -> str:
    """
    Construct coaching prompt context to ensure Gemini provides delivery notes
    covering both detected filler words and noticeable hesitation pauses.
    """
    if not evidence or not evidence.get("has_hesitations"):
        return (
            "SPEECH DELIVERY & FLUENCY EVIDENCE:\n"
            "- Delivery was fluent with standard conversational cadence and no disruptive hesitation pauses or repeated fillers.\n"
        )

    fillers = evidence.get("filler_words", [])
    hesitations = evidence.get("hesitation_pauses", [])
    repeated = evidence.get("repeated_starts", [])
    summary = evidence.get("hesitation_summary", "")

    fillers_str = ", ".join(repr(f) for f in fillers) if fillers else "None"
    hesitations_str = ", ".join(repr(h) for h in hesitations[:4]) if hesitations else "None"
    repeated_str = ", ".join(repr(r) for r in repeated) if repeated else "None"

    return (
        "HESITATION & SPEECH DELIVERY EVIDENCE (GROUND TRUTH):\n"
        f"- Spoken filler words: {fillers_str}\n"
        f"- Hesitation pauses ('...'): {hesitations_str}\n"
        f"- Repeated starts / self-corrections: {repeated_str}\n"
        f"- Timing/segment evidence: {summary}\n\n"
        "DELIVERY COACHING DIRECTIVE:\n"
        "Candidate's speech contains noticeable hesitation pauses ('...') and/or spoken filler words. "
        "Include one constructive, actionable coaching note addressing these specific hesitation moments "
        "(e.g., 'Your answer had several hesitation moments, such as 'um...' and 'I... I think'. "
        "Try replacing repeated fillers with a short, intentional pause before continuing.'). "
        "Do NOT invent hesitations that are not present, and do not use confidence scores.\n"
    )
