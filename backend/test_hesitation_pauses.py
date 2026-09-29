"""
Unit tests for hesitation pause representation and evidence extraction.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.hesitation_formatter import (
    format_hesitation_transcript,
    extract_hesitation_evidence,
    build_hesitation_coaching_prompt_section
)

def test_user_requested_hesitation_examples():
    """Test all specific examples given in the user requirements."""
    # Example 1: Repeated starts / false start
    ex1 = "I I worked on a React project..."
    res1 = format_hesitation_transcript(ex1)
    print(f"Example 1: '{ex1}' -> '{res1}'")
    assert "I... I" in res1
    assert res1.startswith("I... I worked on a React project")

    # Example 2: Filler word 'Um'
    ex2 = "Um I think the main challenge was..."
    res2 = format_hesitation_transcript(ex2)
    print(f"Example 2: '{ex2}' -> '{res2}'")
    assert "Um..." in res2

    # Example 3: Starter 'So'
    ex3 = "So what we did was..."
    res3 = format_hesitation_transcript(ex3)
    print(f"Example 3: '{ex3}' -> '{res3}'")
    assert "So..." in res3

    # Example 4: Spoken filler 'Uh'
    ex4 = "Uh we had to improve the API..."
    res4 = format_hesitation_transcript(ex4)
    print(f"Example 4: '{ex4}' -> '{res4}'")
    assert "Uh..." in res4

def test_fluent_speech_preservation():
    """Ensure fluent speech without hesitations is NEVER injected with random ellipses."""
    fluent1 = "I worked on a React project for two years and built the frontend architecture."
    res1 = format_hesitation_transcript(fluent1)
    print(f"Fluent 1: '{res1}'")
    assert "..." not in res1
    assert res1 == fluent1

    fluent2 = "We built a microservice with FastAPI and Docker to handle high traffic."
    res2 = format_hesitation_transcript(fluent2)
    print(f"Fluent 2: '{res2}'")
    assert "..." not in res2
    assert res2 == fluent2

def test_word_timestamp_gap_hesitations():
    """Test that timestamp gap evidence triggers hesitation pauses."""
    # Candidate pauses for 0.8s between 'worked on' and 'a React project'
    words = [
        {"word": "I", "start": 0.0, "end": 0.2},
        {"word": "worked", "start": 0.25, "end": 0.6},
        {"word": "on", "start": 0.65, "end": 0.85},
        {"word": "a", "start": 1.70, "end": 1.85}, # 0.85s pause after 'on'
        {"word": "React", "start": 1.90, "end": 2.30},
        {"word": "project.", "start": 2.35, "end": 2.80}
    ]
    raw = "I worked on a React project."
    res = format_hesitation_transcript(raw, words=words)
    print(f"Timestamp gap transcript: '{res}'")
    assert "on..." in res or "on... a" in res

def test_hesitation_evidence_extraction():
    """Test extracting structured evidence for AI notes coaching."""
    transcript = "Um... I... I worked on the database and uh... we fixed the query latency."
    evidence = extract_hesitation_evidence(transcript)
    print("Extracted evidence:", evidence)
    assert evidence["has_hesitations"] is True
    assert "um" in evidence["filler_words"]
    assert "uh" in evidence["filler_words"]
    assert any("I... I" in r for r in evidence["repeated_starts"])
    assert evidence["pause_count"] >= 2

    # Check coaching prompt generation
    prompt_section = build_hesitation_coaching_prompt_section(evidence)
    print("Coaching prompt section:\n", prompt_section)
    assert "HESITATION & SPEECH DELIVERY EVIDENCE" in prompt_section
    assert "um" in prompt_section.lower()
    assert "I... I" in prompt_section

if __name__ == "__main__":
    print("--- Running Hesitation Pause Unit Tests ---")
    test_user_requested_hesitation_examples()
    test_fluent_speech_preservation()
    test_word_timestamp_gap_hesitations()
    test_hesitation_evidence_extraction()
    print("\n>>> ALL HESITATION PAUSE TESTS PASSED! <<<")
