"""No real network/model downloads in deployment-policy regression tests."""
import os
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
import main
import stt_service


def test_local_stt_schema_survives_both_transcription_routes():
    from unittest.mock import Mock
    import numpy as np

    required = {"text", "transcription", "raw_text", "language", "language_probability",
                "duration", "processing_time_ms", "inference_time_ms", "timings",
                "model", "segments", "words", "hesitation_evidence"}
    timing_fields = {"upload_write_ms", "audio_decode_ms", "inference_ms", "total_processing_ms"}
    service = stt_service.STTService()
    service._model = Mock()
    service._model.transcribe.side_effect = lambda *args, **kwargs: (
        iter([SimpleNamespace(id=0, start=0.0, end=1.0, text=" Hello.", words=[])]),
        SimpleNamespace(language="en", language_probability=1.0),
    )
    with patch.dict(os.environ, {"VERCEL": "", "STT_SERVICE_URL": ""}), \
         patch.object(stt_service, "decode_audio_bytes", return_value=(np.zeros(16000), 1.0, 2.0)), \
         patch.object(main.STTService, "get_instance", return_value=service):
        result = service.transcribe_audio_payload(b"x" * 64)
        assert required.issubset(result)
        assert timing_fields.issubset(result["timings"])
        assert result["raw_text"] == "Hello."
        client = TestClient(main.app)
        for route in ("/transcribe", "/api/transcribe"):
            response = client.post(route, files={"file": ("audio.wav", b"x" * 64)},
                                   data={"generate_ai_response": "false"})
            assert response.status_code == 200
            body = response.json()
            assert required.issubset(body)
            assert timing_fields.issubset(body["timings"])
            assert body["raw_text"] == result["raw_text"]


@pytest.mark.parametrize("model", ["base", "small", "large-v3"])
def test_vercel_lifespan_never_downloads_stt(model):
    with patch.dict(os.environ, {"VERCEL": "1", "WHISPER_MODEL_SIZE": model,
                                 "STT_PRELOAD": "true"}), \
         patch.object(stt_service, "WhisperModel") as constructor, \
         patch.object(main.STTService, "load_model") as preload, \
         patch.object(main, "TTS_ENABLED", False), patch.object(main, "init_db"):
        with TestClient(main.app) as client:
            assert client.get("/health").status_code == 200
        constructor.assert_not_called()
        preload.assert_not_called()


def test_vercel_request_cannot_fall_back_to_download():
    with patch.dict(os.environ, {"VERCEL": "1", "STT_SERVICE_URL": ""}), \
         patch.object(stt_service, "WhisperModel") as constructor:
        with pytest.raises(stt_service.STTUnavailable):
            stt_service.STTService().transcribe_audio_payload(b"x" * 64)
        constructor.assert_not_called()
        response = TestClient(main.app).post(
            "/transcribe", files={"file": ("audio.wav", b"x" * 64)},
            data={"generate_ai_response": "false"},
        )
        assert response.status_code == 503
        constructor.assert_not_called()


def test_failed_local_preload_does_not_prevent_startup():
    with patch.dict(os.environ, {"VERCEL": "", "STT_SERVICE_URL": "", "STT_PRELOAD": "true"}), \
         patch.object(main.STTService, "load_model", side_effect=OSError(28, "No space left")) as preload, \
         patch.object(main, "TTS_ENABLED", False), patch.object(main, "init_db"):
        with TestClient(main.app) as client:
            assert client.get("/health").status_code == 200
        preload.assert_called_once()


def test_local_model_loading_is_preserved():
    with patch.dict(os.environ, {"VERCEL": "", "STT_SERVICE_URL": ""}), \
         patch.object(stt_service, "WhisperModel") as constructor:
        service = stt_service.STTService()
        service.load_model()
        service.load_model()
        constructor.assert_called_once()


def test_external_stt_delegates_audio_without_local_model():
    result = dict(text="Hello", transcription="Hello", raw_text="Hello", language="en",
                  language_probability=1.0, duration=1.0, processing_time_ms=10,
                  inference_time_ms=9, timings={"audio_decode_ms": 1, "inference_ms": 9,
                                               "total_processing_ms": 10}, model="small", segments=[], words=[],
                  hesitation_evidence={}, ai_response="must not leak")
    with patch.dict(os.environ, {"VERCEL": "1", "STT_SERVICE_URL": "https://stt.example/transcribe",
                                 "STT_SERVICE_TOKEN": "test-token"}), \
         patch.object(stt_service, "WhisperModel") as constructor, \
         patch.object(stt_service.httpx, "Client") as client:
        response = client.return_value.__enter__.return_value.post.return_value
        response.json.return_value = result
        output = stt_service.STTService().transcribe_audio_payload(b"audio", 1, "en")
        assert output["text"] == "Hello"
        assert "ai_response" not in output
        kwargs = client.return_value.__enter__.return_value.post.call_args.kwargs
        assert kwargs["data"]["generate_ai_response"] == "false"
        assert kwargs["files"]["file"][1] == b"audio"
        assert kwargs["headers"]["Authorization"] == "Bearer test-token"
        constructor.assert_not_called()
        api_response = TestClient(main.app).post(
            "/transcribe", files={"file": ("audio.wav", b"x" * 64)},
            data={"generate_ai_response": "false"},
        )
        assert api_response.status_code == 200
        assert api_response.json()["transcription"] == "Hello"
        assert api_response.json()["segments"] == []
        constructor.assert_not_called()


@pytest.mark.parametrize("failure", ["timeout", "malformed"])
def test_external_failure_never_downloads_or_leaks_credentials(failure):
    with patch.dict(os.environ, {"VERCEL": "1", "STT_SERVICE_URL": "https://stt.example/transcribe"}), \
         patch.object(stt_service, "WhisperModel") as constructor, \
         patch.object(stt_service.httpx, "Client") as client:
        remote = client.return_value.__enter__.return_value.post
        if failure == "timeout":
            remote.side_effect = stt_service.httpx.ReadTimeout("secret upstream error")
        else:
            remote.return_value.json.return_value = {"text": "Incomplete"}
        with pytest.raises(stt_service.STTUnavailable, match="Dedicated STT service is unavailable"):
            stt_service.STTService().transcribe_audio_payload(b"audio")
        constructor.assert_not_called()
