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


@pytest.mark.parametrize("precision", ["int8", "fp32"])
def test_kokoro_uses_bounded_cpu_threads_and_disables_spinning(monkeypatch, precision):
    monkeypatch.setenv("KOKORO_MODEL_PRECISION", precision)
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
    if precision == "fp32":
        assert options.enable_cpu_mem_arena is False
        assert options.enable_mem_pattern is False
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

@pytest.mark.parametrize("precision,filename,url", [
    ("int8", "kokoro-v1.0.int8.onnx", tts_service.KOKORO_INT8_MODEL_URL),
    ("fp32", "kokoro-v1.0.onnx", tts_service.KOKORO_FP32_MODEL_URL),
])
def test_selected_model_precision_uses_writable_cache(monkeypatch, tmp_path, precision, filename, url):
    monkeypatch.setenv("KOKORO_MODEL_PRECISION", precision)
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    cache = tmp_path / "cache"
    cache.mkdir()
    monkeypatch.setattr(tts_service, "__file__", str(bundle / "tts_service.py"))
    monkeypatch.setattr(tts_service, "KOKORO_MODEL_PATH", None)
    monkeypatch.setattr(tts_service, "KOKORO_VOICES_PATH", None)
    monkeypatch.setattr(tts_service, "runtime_directory", lambda name: cache)
    def download(source, destination):
        from pathlib import Path
        Path(destination).write_bytes(b"model")
    with patch.object(tts_service.urllib.request, "urlretrieve", side_effect=download) as retrieve:
        model, voices = tts_service.TTSService()._resolve_paths()
    assert model == str(cache / filename)
    assert voices == str(cache / "voices-v1.0.bin")
    assert retrieve.call_args_list[0].args[0] == url
    assert list(bundle.iterdir()) == []
    assert not list(cache.glob("*.part"))


def test_invalid_precision_fails_before_downloading(monkeypatch):
    monkeypatch.setenv("KOKORO_MODEL_PRECISION", "invalid")
    with patch.object(tts_service.urllib.request, "urlretrieve") as retrieve:
        with pytest.raises(ValueError, match="KOKORO_MODEL_PRECISION"):
            tts_service.TTSService()._resolve_paths()
    retrieve.assert_not_called()


def test_synthesis_requests_do_not_allocate_models_concurrently():
    from concurrent.futures import ThreadPoolExecutor
    service = tts_service.TTSService()
    service.enabled = service.loaded = True
    service.kokoro = Mock()
    entered = threading.Event()
    release = threading.Event()
    second_started = threading.Event()
    calls = []
    def generate(text, voice, speed):
        calls.append(text)
        if text == "first":
            entered.set()
            assert release.wait(3)
        return b"audio", 24000
    def second_request():
        second_started.set()
        return service.synthesize("second")
    service._synthesize = generate
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(service.synthesize, "first")
        assert entered.wait(1)
        second = pool.submit(second_request)
        try:
            assert second_started.wait(1)
            assert calls == ["first"]
            assert not second.done()
        finally:
            release.set()
        assert first.result() == (b"audio", 24000)
        assert second.result() == (b"audio", 24000)
    assert calls == ["first", "second"]
