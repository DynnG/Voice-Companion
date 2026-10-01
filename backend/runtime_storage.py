"""Writable scratch storage for upload spooling and speech-library caches."""
import os
import tempfile
import sys
from pathlib import Path


# Capture the OS directory before redirecting Python multipart spooling.
PLATFORM_TEMP = Path("/tmp") if os.environ.get("VERCEL") else Path(tempfile.gettempdir())


def runtime_directory(name: str) -> Path:
    base = Path("/tmp") if os.environ.get("VERCEL") else PLATFORM_TEMP
    path = base / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def sqlite_database_path(backend_dir: Path) -> Path:
    if os.environ.get("VERCEL"):
        raise RuntimeError("Local SQLite is disabled on Vercel; configure DATABASE_URL and DATABASE_AUTH_TOKEN.")
    return backend_dir / "voice_companion.db"


def configure_transcription_storage() -> Path:
    # Vercel only permits runtime writes in /tmp. Ignore project-relative TMPDIR.
    base = Path("/tmp") if os.environ.get("VERCEL") else Path(tempfile.gettempdir())
    root = base / "savi-transcription"
    root.mkdir(parents=True, exist_ok=True)
    tempfile.tempdir = str(root)
    if os.environ.get("VERCEL"):
        sys.dont_write_bytecode = True
    os.environ["SQLITE_TMPDIR"] = str(root)
    os.environ["XDG_CACHE_HOME"] = str(root / "cache")
    os.environ["TMPDIR"] = str(root)
    os.environ["HF_HOME"] = str(root / "huggingface")
    os.environ["HF_HUB_CACHE"] = str(root / "huggingface" / "hub")
    os.environ["HUGGINGFACE_HUB_CACHE"] = os.environ["HF_HUB_CACHE"]
    os.environ["HF_XET_CACHE"] = str(root / "huggingface" / "xet")
    os.environ["TRANSFORMERS_CACHE"] = str(root / "huggingface" / "hub")
    # Disable Xet transfer acceleration to prevent 'Task error: File reconstruction failed' in serverless
    os.environ["HF_HUB_DISABLE_XET"] = "1"
    os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"
    (root / "huggingface" / "hub").mkdir(parents=True, exist_ok=True)
    (root / "huggingface" / "xet").mkdir(parents=True, exist_ok=True)
    (root / "cache").mkdir(parents=True, exist_ok=True)
    return root


TRANSCRIPTION_STORAGE = configure_transcription_storage()
