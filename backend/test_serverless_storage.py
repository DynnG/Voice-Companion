import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import runtime_storage
import tts_service


class ServerlessStorageTests(unittest.TestCase):
    def test_vercel_paths_ignore_project_tmpdir(self):
        with patch.dict(os.environ, {'VERCEL': '1', 'TMPDIR': '/var/task'}, clear=True), patch.object(Path, 'mkdir'):
            self.assertEqual(runtime_storage.runtime_directory('savi-kokoro'), Path('/tmp/savi-kokoro'))
            self.assertEqual(runtime_storage.sqlite_database_path(Path('/var/task/backend')), Path('/tmp/savi-sqlite/voice_companion.db'))

    def test_local_sqlite_keeps_existing_database(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(runtime_storage.sqlite_database_path(Path('backend')), Path('backend/voice_companion.db'))

    def test_downloads_never_write_to_bundle_and_reuse_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            bundle = base / 'readonly-bundle'
            bundle.mkdir()
            cache = base / 'savi-kokoro'
            cache.mkdir()
            def download(url, filename):
                self.assertEqual(Path(filename).parent, cache)
                Path(filename).write_bytes(b'complete model')
            with patch.object(tts_service, '__file__', str(bundle / 'tts_service.py')), patch.object(tts_service, 'KOKORO_MODEL_PATH', ''), patch.object(tts_service, 'KOKORO_VOICES_PATH', ''), patch.object(tts_service, 'runtime_directory', return_value=cache), patch.object(tts_service.urllib.request, 'urlretrieve', side_effect=download) as retrieve:
                service = tts_service.TTSService()
                model, voices = service._resolve_paths()
                self.assertEqual(Path(model).parent, cache)
                self.assertEqual(Path(voices).parent, cache)
                self.assertEqual(service._resolve_paths(), (model, voices))
                self.assertEqual(retrieve.call_count, 2)
            self.assertEqual(list(bundle.iterdir()), [])
            self.assertFalse(list(cache.glob('*.part')))

    def test_failed_download_removes_partial_and_can_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'model.onnx'
            def fail(url, filename):
                Path(filename).write_bytes(b'partial')
                raise OSError('network failure')
            with patch.object(tts_service.urllib.request, 'urlretrieve', side_effect=fail):
                with self.assertRaises(OSError):
                    tts_service.download_model_file('https://example.test/model', destination)
            self.assertEqual(list(Path(directory).iterdir()), [])
            with patch.object(tts_service.urllib.request, 'urlretrieve', side_effect=lambda url, path: Path(path).write_bytes(b'complete')):
                tts_service.download_model_file('https://example.test/model', destination)
            self.assertEqual(destination.read_bytes(), b'complete')

    def test_sqlite_schema_crud_and_journals_use_scratch_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'voice_companion.db'
            with patch.dict(os.environ, {'VERCEL': '1'}), patch.object(runtime_storage, 'runtime_directory', return_value=Path(directory)):
                spec = importlib.util.spec_from_file_location('isolated_database', Path(__file__).parent / 'database.py')
                db = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(db)
            try:
                self.assertEqual(Path(db.DB_FILE), path)
                with db.engine.connect() as connection:
                    connection.exec_driver_sql('CREATE TABLE storage_test (value TEXT)')
                    connection.commit()
                    connection.exec_driver_sql("INSERT INTO storage_test VALUES ('preserved')")
                    self.assertTrue(Path(str(path) + '-journal').exists())
                    connection.commit()
                    self.assertEqual(connection.exec_driver_sql('SELECT value FROM storage_test').scalar(), 'preserved')
                    self.assertEqual(connection.exec_driver_sql('PRAGMA temp_store').scalar(), 2)
                    self.assertEqual(connection.exec_driver_sql('PRAGMA foreign_keys').scalar(), 1)
                self.assertTrue(path.exists())
            finally:
                db.engine.dispose()


if __name__ == '__main__':
    unittest.main()
