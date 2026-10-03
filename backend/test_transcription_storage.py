import asyncio
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from runtime_storage import configure_transcription_storage


class TranscriptionStorageTests(unittest.TestCase):
    def test_spooled_audio_uses_temp_and_is_removed(self):
        from starlette.datastructures import UploadFile
        with tempfile.TemporaryDirectory() as directory:
            previous = tempfile.tempdir
            try:
                with patch.dict(os.environ, {}, clear=True), patch('tempfile.gettempdir', return_value=directory):
                    root = configure_transcription_storage()
                    self.assertEqual(root.parent, Path(directory))
                    self.assertTrue(Path(os.environ['HF_HUB_CACHE']).is_relative_to(root))
                    spool = tempfile.SpooledTemporaryFile(max_size=1)
                    spool.write(b'audio payload')
                    self.assertTrue(spool._rolled)
                    upload = UploadFile(spool)
                    asyncio.run(upload.close())
                    self.assertTrue(spool.closed)
                    # Cache setup intentionally creates directories; no uploaded
                    # audio or spool files should remain after closing.
                    self.assertEqual([p for p in root.rglob('*') if p.is_file()], [])
            finally:
                tempfile.tempdir = previous

    def test_vercel_ignores_readonly_tmpdir(self):
        previous = tempfile.tempdir
        try:
            with patch.dict(os.environ, {'VERCEL': '1', 'TMPDIR': '/var/task'}, clear=True), patch.object(Path, 'mkdir'):
                root = configure_transcription_storage()
                self.assertEqual(root, Path('/tmp/savi-transcription'))
                self.assertEqual(tempfile.tempdir, str(root))
        finally:
            tempfile.tempdir = previous

    def test_whisper_downloads_use_explicit_temp_cache(self):
        import stt_service
        with patch.object(stt_service, 'WhisperModel') as model:
            service = stt_service.STTService()
            service.load_model()
            self.assertEqual(model.call_args.kwargs['download_root'], str(stt_service.TRANSCRIPTION_STORAGE / 'huggingface' / 'hub'))


class DecodeFallbackTests(unittest.TestCase):
    def test_both_open_attempts_fail_without_masking_error_and_remove_temp(self):
        import stt_service
        with tempfile.TemporaryDirectory() as directory:
            with patch('tempfile.gettempdir', return_value=directory), patch.object(stt_service.av, 'open', side_effect=RuntimeError('End of file')) as opener:
                with self.assertRaisesRegex(ValueError, 'Corrupted or invalid audio stream data: End of file'):
                    stt_service.decode_audio_bytes(b'x' * 64)
                self.assertEqual(opener.call_count, 2)
                self.assertTrue(Path(opener.call_args.args[0]).is_relative_to(directory))
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_temp_creation_failure_does_not_mask_original_error(self):
        import stt_service
        with patch.object(stt_service.av, 'open', side_effect=RuntimeError('bad audio')), patch('tempfile.mkstemp', side_effect=OSError('temporary storage unavailable')):
            with self.assertRaisesRegex(ValueError, 'temporary storage unavailable'):
                stt_service.decode_audio_bytes(b'x' * 64)

    def test_valid_wav_still_decodes_in_memory(self):
        import io
        import wave
        import stt_service
        output = io.BytesIO()
        with wave.open(output, 'wb') as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(16000)
            audio.writeframes(b'\x00\x00' * 1600)
        with patch('tempfile.mkstemp') as temporary:
            samples, duration, _ = stt_service.decode_audio_bytes(output.getvalue())
        self.assertEqual(len(samples), 1600)
        self.assertAlmostEqual(duration, 0.1)
        temporary.assert_not_called()


class UploadCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_document_upload_closes_after_read(self):
        from unittest.mock import AsyncMock
        import main
        upload = AsyncMock()
        upload.filename = 'sample.txt'
        upload.read.return_value = b'Example document'
        await main.extract_document(file=upload)
        upload.close.assert_awaited_once()

    async def test_document_upload_closes_on_read_failure(self):
        from unittest.mock import AsyncMock
        import main
        from fastapi import HTTPException
        upload = AsyncMock()
        upload.filename = 'sample.txt'
        upload.read.side_effect = OSError('read failed')
        with self.assertRaises(HTTPException):
            await main.extract_document(file=upload)
        upload.close.assert_awaited_once()

    async def test_endpoint_closes_upload_when_read_fails(self):
        from unittest.mock import AsyncMock
        import main
        from fastapi import HTTPException
        upload = AsyncMock()
        upload.read.side_effect = OSError('upload read failed')
        with self.assertRaises(HTTPException) as error:
            await main.transcribe_audio(file=upload, db=None)
        self.assertEqual(error.exception.status_code, 400)
        upload.close.assert_awaited_once()

    async def test_endpoint_closes_upload_before_inference_failure(self):
        from unittest.mock import AsyncMock
        import main
        from fastapi import HTTPException
        upload = AsyncMock()
        upload.read.return_value = b'x' * 64
        with patch.object(main.STTService, 'get_instance') as service:
            def fail(**kwargs):
                upload.close.assert_awaited_once()
                raise ValueError('invalid audio')
            service.return_value.transcribe_audio_payload.side_effect = fail
            with self.assertRaises(HTTPException) as error:
                await main.transcribe_audio(file=upload, db=None)
        self.assertEqual(error.exception.status_code, 400)
        upload.close.assert_awaited_once()


if __name__ == '__main__':
    unittest.main()
