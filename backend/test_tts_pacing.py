"""Conversational pacing checks and real before/after WAV comparisons."""
import io
from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

import main
import tts_service

PROMPTS = [
    "Yeah, that makes sense. Tell me a little more about your experience with programming.",
    "That's interesting. What was the most challenging part of that project?",
    "Okay, I understand. Let's move on to the next question.",
    "The way you explained that was really clear.",
]


def test_sentence_and_clause_pauses_preserve_words_and_voice():
    service = tts_service.TTSService()
    service.loaded = True
    service.available_voices = ["af_bella", "am_adam"]
    service.kokoro = Mock()
    service.kokoro.create.return_value = (np.ones(2400, dtype=np.float32) * 0.1, 24000)
    wav, rate = service.synthesize("That's interesting. Can you tell me more?", voice="am_adam", speed=0.94)
    samples, _ = sf.read(io.BytesIO(wav))
    assert rate == 24000
    assert len(samples) == 4800 + int(24000 * 0.18)
    assert np.all(samples[2400:2400 + 4320] == 0)
    assert service.kokoro.create.call_args_list[0].args == ("That's interesting.",)
    assert service.kokoro.create.call_args_list[1].args == ("Can you tell me more?",)
    assert all(call.kwargs["voice"] == "am_adam" and call.kwargs["speed"] == 0.94
               for call in service.kokoro.create.call_args_list)
    # Force a clause boundary without rewriting its wording or punctuation.
    with patch.object(tts_service, "split_text_into_speech_chunks", return_value=["Yeah,", "that makes sense."]):
        wav, _ = service.synthesize("Yeah, that makes sense.")
        samples, _ = sf.read(io.BytesIO(wav))
        assert len(samples) == 4800 + int(24000 * 0.08)
        assert service.kokoro.create.call_args.kwargs["speed"] == 0.92


@pytest.mark.parametrize("route", ["/tts", "/api/tts"])
def test_endpoint_default_and_explicit_speed_keep_wav_contract(route):
    service = Mock()
    service.is_enabled.return_value = service.is_loaded.return_value = True
    wav = io.BytesIO()
    sf.write(wav, np.zeros(2400), 24000, format="WAV", subtype="PCM_16")
    service.synthesize.return_value = (wav.getvalue(), 24000)
    with patch.object(main.TTSService, "get_instance", return_value=service):
        client = TestClient(main.app)
        response = client.post(route, json={"text": PROMPTS[0]})
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/wav"
        assert response.headers["x-sample-rate"] == "24000"
        assert response.content[:4] == b"RIFF"
        assert service.synthesize.call_args.kwargs["speed"] == 0.92
        client.post(route, json={"text": PROMPTS[1], "voice": "af_bella", "speed": 1.0})
        assert service.synthesize.call_args.kwargs["speed"] == 1.0
        assert service.synthesize.call_args.kwargs["voice"] == "af_bella"


def test_conversational_text_is_not_rewritten():
    text = "I'm Alex; you're using Python 3.12, that's fine. Don't change PostgreSQL or can't."
    assert tts_service.clean_text_for_speech(text) == text
    assert " ".join(tts_service.split_text_into_speech_chunks(text)) == text


def test_real_conversational_pacing_comparison():
    service = tts_service.TTSService.get_instance()
    if not service.is_loaded():
        service.load_model()
    assert service.is_loaded(), service.get_error()
    output = Path(__file__).resolve().parent.parent / ".cache" / "tts-pacing"
    output.mkdir(parents=True, exist_ok=True)
    for index, text in enumerate(PROMPTS, 1):
        with patch.object(tts_service, "SENTENCE_PAUSE_SECONDS", 0.12):
            before, _ = service.synthesize(text, speed=1.0)
        after, rate = service.synthesize(text)
        output.joinpath(f"{index}-before.wav").write_bytes(before)
        output.joinpath(f"{index}-after.wav").write_bytes(after)
        old, old_rate = sf.read(io.BytesIO(before))
        new, new_rate = sf.read(io.BytesIO(after))
        assert old_rate == new_rate == rate == 24000
        assert np.isfinite(new).all() and np.max(np.abs(new)) > 0
        ratio = len(new) / len(old)
        assert 1.01 < ratio < 1.30, f"Unexpected slowdown: {ratio}"
        print(f"Prompt {index}: {len(old)/rate:.2f}s -> {len(new)/rate:.2f}s ({ratio:.3f}x)")
