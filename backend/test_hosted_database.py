import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

import database
import main
from models import Interview, Document


class DatabaseConfigurationTests(unittest.TestCase):
    def test_vercel_missing_database_fails_fast(self):
        with self.assertRaisesRegex(database.DatabaseConfigurationError, 'DATABASE_URL is required'):
            database.database_settings({'VERCEL': '1'})

    def test_vercel_rejects_file_and_embedded_databases(self):
        for url in ['sqlite:////tmp/data.db', 'file:local.db', 'sqlite+libsql:///embedded.db']:
            with self.subTest(url=url), self.assertRaises(database.DatabaseConfigurationError):
                database.database_settings({'VERCEL': '1', 'DATABASE_URL': url})

    def test_remote_url_and_token_are_separate(self):
        url, args, target, local = database.database_settings({'VERCEL': '1', 'DATABASE_URL': 'libsql://savi-example.turso.io', 'DATABASE_AUTH_TOKEN': 'test-secret'})
        self.assertEqual(url, 'sqlite+libsql://savi-example.turso.io?secure=true')
        self.assertFalse(local)
        self.assertNotIn('sync_url', args)
        self.assertNotIn('test-secret', url + target)
        self.assertEqual(args['auth_token'], 'test-secret')

    def test_missing_token_and_embedded_credentials_rejected(self):
        with self.assertRaisesRegex(database.DatabaseConfigurationError, 'DATABASE_AUTH_TOKEN'):
            database.database_settings({'DATABASE_URL': 'libsql://savi-example.turso.io'})
        with self.assertRaises(database.DatabaseConfigurationError) as error:
            database.database_settings({'DATABASE_URL': 'libsql://user:secret@savi-example.turso.io'})
        self.assertNotIn('secret', str(error.exception))

    def test_windows_local_development_keeps_sqlite(self):
        url, args, target, local = database.database_settings({})
        self.assertTrue(local)
        self.assertEqual(Path(target), Path(database.__file__).parent / 'voice_companion.db')


class PersistentSessionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.engine = create_engine(f'sqlite:///{Path(self.directory.name) / "test.db"}', connect_args={'check_same_thread': False})
        self.session_factory = sessionmaker(bind=self.engine)
        self.patches = [patch.object(database, 'engine', self.engine),
                        patch.object(database, 'SessionLocal', self.session_factory),
                        patch.object(database, '_schema_ready', False)]
        for item in self.patches:
            item.start()
        self.client = TestClient(main.app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        for item in reversed(self.patches):
            item.stop()
        self.directory.cleanup()

    def test_schema_is_idempotent_and_data_survives_new_engine(self):
        database.init_db()
        created = self.client.post('/api/interviews', json={'job_role': 'Developer'})
        self.assertEqual(created.status_code, 201)
        interview_id = created.json()['id']
        attached = self.client.post(f'/api/interviews/{interview_id}/documents', json={'filename': 'resume.txt', 'extracted_text': 'Persistent project experience'})
        self.assertEqual(attached.status_code, 201)
        database._schema_ready = False
        database.init_db()
        # Reopen through an independent connection/engine, with no session dict.
        fresh = create_engine(self.engine.url, connect_args={'check_same_thread': False})
        try:
            with sessionmaker(bind=fresh)() as session:
                docs = main.get_effective_interview_documents(interview_id, [], session)
                self.assertEqual(docs[0]['content'], 'Persistent project experience')
        finally:
            fresh.dispose()

    def test_initial_question_persists_frontend_session_and_document(self):
        gemini = main.GeminiInterviewService.get_instance()
        request = {'job_role': 'Developer', 'interview_id': 'session-storage-test',
                   'attached_documents': [{'name': 'resume.txt', 'content': 'Built a caching layer'}]}
        with patch.object(gemini, 'generate_initial_question', new=AsyncMock(return_value='Tell me about your project.')):
            self.assertEqual(self.client.post('/api/interview/initial-question', json=request).status_code, 200)
            self.assertEqual(self.client.post('/api/interview/initial-question', json=request).status_code, 200)
        main.ACTIVE_INTERVIEW_SESSIONS.clear()
        result = self.client.get('/api/interviews/session-storage-test')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.json()['documents']), 1)
        self.assertEqual(result.json()['documents'][0]['extracted_text'], 'Built a caching layer')

    def test_unknown_persistent_session_returns_404(self):
        response = self.client.post('/api/interview/initial-question', json={'job_role': 'Developer', 'interview_id': 'missing-record'})
        self.assertEqual(response.status_code, 404)
        database.init_db()
        with self.session_factory() as session:
            with self.assertRaises(main.HTTPException) as error:
                main.get_effective_interview_documents('missing-record', [], session)
        self.assertEqual(error.exception.status_code, 404)

    def test_transcription_endpoint_passes_bytes_in_memory_and_returns_200(self):
        payload = b'example audio payload' * 4
        result = {'text': 'Hello', 'language': 'en', 'language_probability': 1.0,
                  'duration': 1.0, 'processing_time_ms': 1.0, 'model': 'test',
                  'timings': {'upload_write_ms': 0.0, 'audio_decode_ms': 0.0,
                              'inference_ms': 0.0, 'total_processing_ms': 0.0}}
        with patch.object(main.STTService, 'get_instance') as service:
            service.return_value.transcribe_audio_payload.return_value = result
            response = self.client.post('/api/transcribe', files={'file': ('sample.wav', payload, 'audio/wav')}, data={'generate_ai_response': 'false'})
            self.assertEqual(service.return_value.transcribe_audio_payload.call_args.kwargs['audio_input'], payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['transcription'], 'Hello')

    def test_transcription_missing_session_stays_404(self):
        result = {'text': 'Hello', 'language': 'en', 'language_probability': 1.0,
                  'duration': 1.0, 'processing_time_ms': 1.0, 'model': 'test',
                  'timings': {'upload_write_ms': 0.0, 'audio_decode_ms': 0.0,
                              'inference_ms': 0.0, 'total_processing_ms': 0.0}}
        with patch.object(main.STTService, 'get_instance') as service:
            service.return_value.transcribe_audio_payload.return_value = result
            response = self.client.post('/api/transcribe', files={'file': ('sample.wav', b'x' * 64, 'audio/wav')}, data={'interview_id': 'missing-record'})
        self.assertEqual(response.status_code, 404)

    def test_schema_failure_is_503_and_does_not_leak_credentials(self):
        with patch.object(self.engine, 'begin', side_effect=OperationalError('secret SQL', {}, Exception('token=test-secret'))):
            response = self.client.post('/api/interview/initial-question', json={'job_role': 'Developer'})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('test-secret', response.text)
        self.assertNotIn('secret SQL', response.text)
        self.assertIn('schema initialization', response.text)


if __name__ == '__main__':
    unittest.main()
