"""Protect interview responsiveness while Kokoro generates natural speech."""
import asyncio
import threading
from unittest.mock import Mock, patch

import httpx
import kokoro_onnx
import onnxruntime
import pytest

import main
import tts_service


def test_kokoro_uses_bounded_cpu_threads_and_disables_spinning(monkeypatch):
    monkeypatch.setenv("KOKORO_CPU_THREADS", "2")
    options = Mock()
    session = Mock()
    kokoro = Mock()
    kokoro.get_voices.return_value = ["af_bella"]
    service = tts_service.TTSService()
    with patch.object(service, "_resolve_paths", return_value=("model.onnx", "voices.bin")), \
         patch.object(onnxruntime, "SessionOptions", return_value=options), \
         patch.object(onnxruntime, "InferenceSession", return_value=session) as create_session, \
         patch.object(kokoro_onnx.Kokoro, "from_session", return_value=kokoro) as create_kokoro:
        service.load_model()
    assert service.is_loaded(), service.get_error()
    assert options.intra_op_num_threads == 2
    assert options.inter_op_num_threads == 1
    assert options.execution_mode == onnxruntime.ExecutionMode.ORT_SEQUENTIAL
    options.add_session_config_entry.assert_any_call("session.intra_op.allow_spinning", "0")
    options.add_session_config_entry.assert_any_call("session.inter_op.allow_spinning", "0")
    create_session.assert_called_once_with("model.onnx", sess_options=options, providers=["CPUExecutionProvider"])
    create_kokoro.assert_called_once_with(session, "voices.bin")


@pytest.mark.asyncio
async def test_health_remains_responsive_during_synthesis():
    started = threading.Event()
    release = threading.Event()
    service = Mock()
    service.is_enabled.return_value = service.is_loaded.return_value = True

    def synthesize(**kwargs):
        started.set()
        assert release.wait(5), "Test did not release synthesis worker"
        return (b"RIFF-test-audio", 24000)

    service.synthesize.side_effect = synthesize
    with patch.object(main.TTSService, "get_instance", return_value=service):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
            request = asyncio.create_task(client.post("/tts", json={"text": "Hello. Welcome to your interview."}))
            try:
                assert await asyncio.to_thread(started.wait, 2), "Synthesis never started"
                response = await asyncio.wait_for(client.get("/health"), timeout=1)
                assert response.status_code == 200
                assert not request.done(), "Health must respond before synthesis finishes"
            finally:
                release.set()
                audio = await request
            assert audio.status_code == 200
            assert audio.headers["content-type"] == "audio/wav"
            assert audio.content == b"RIFF-test-audio"