"""Use a disposable database and one module identity during backend pytest runs."""
import os
import sys
import tempfile
from pathlib import Path

import pytest

_backend = Path(__file__).resolve().parent
sys.path[:0] = [str(_backend), str(_backend.parent)]
_test_directory = tempfile.TemporaryDirectory(prefix="savi-pytest-")
_previous_database_url = os.environ.get("DATABASE_URL")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_directory.name) / 'tests.db'}"

import database
import main

database.init_db()
# Legacy tests import both main and backend.main; keep the app and ORM identical.
for _name in ("runtime_storage", "database", "models", "main", "config",
              "gemini_service", "stt_service", "tts_service"):
    if _name in sys.modules:
        sys.modules["backend." + _name] = sys.modules[_name]


@pytest.fixture(scope="session", autouse=True)
def disposable_database():
    try:
        yield
    finally:
        database.engine.dispose()
        _test_directory.cleanup()
        if _previous_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = _previous_database_url
