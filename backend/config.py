import os
import tempfile
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Ensure writable directories in serverless environments (e.g. AWS Lambda / Vercel)
TMP_DIR = tempfile.gettempdir()
WHISPER_CACHE_DIR = os.getenv("WHISPER_CACHE_DIR", os.path.join(TMP_DIR, "whisper_models"))
HF_HOME = os.getenv("HF_HOME", os.path.join(TMP_DIR, "huggingface"))

# Ensure Hugging Face and transcription libraries write ONLY to writable temporary storage
os.environ.setdefault("HF_HOME", HF_HOME)
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", os.path.join(HF_HOME, "hub"))
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("TMPDIR", TMP_DIR)

try:
    os.makedirs(WHISPER_CACHE_DIR, exist_ok=True)
    os.makedirs(HF_HOME, exist_ok=True)
except Exception:
    pass

# Search and load .env from backend directory or project root
backend_env = Path(__file__).resolve().parent / ".env"
root_env = Path(__file__).resolve().parent.parent / ".env"

if backend_env.exists():
    load_dotenv(dotenv_path=backend_env, override=True)
elif root_env.exists():
    load_dotenv(dotenv_path=root_env, override=True)
else:
    load_dotenv(override=True)

# Gemini API Configuration
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
# Default to gemini-3.5-flash-lite for fast conversational responses
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

def _load_env_file():
    possible_paths = [
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
    ]
    for p in possible_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k and k not in os.environ:
                                os.environ[k] = v
            except Exception:
                pass

_load_env_file()

# Whisper Model Configuration
# Model size options: "tiny", "base", "small", "medium", "large-v3"
# Local default is small. Vercel uses external STT; base is only a legacy model label.
default_whisper_model = "base" if os.environ.get("VERCEL") else "small"
MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", default_whisper_model)

# Device: "cpu" or "cuda"
DEVICE: str = os.getenv("WHISPER_DEVICE", "cpu")

# Compute type: "int8", "float16", "float32"
# "int8" is optimized for CPU execution
COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

# Beam size: 1 (greedy, fastest for conversational voice with equal accuracy) or 5 (beam search)
BEAM_SIZE: int = int(os.getenv("WHISPER_BEAM_SIZE", "1"))

# CPU Threads
CPU_THREADS: int = int(os.getenv("WHISPER_CPU_THREADS", "4"))

# Language setting: Default to "en" for English interview pipeline to skip language identification overhead
DEFAULT_LANGUAGE: Optional[str] = os.getenv("WHISPER_LANGUAGE", "en")

# VAD Filter: False avoids Silero VAD latency overhead on conversational turns
VAD_FILTER: bool = os.getenv("WHISPER_VAD_FILTER", "false").lower() in ("true", "1", "yes")

# Condition on previous text: False prevents multi-segment latency penalties and repetition loops
CONDITION_ON_PREVIOUS_TEXT: bool = os.getenv("WHISPER_CONDITION_ON_PREV", "false").lower() in ("true", "1", "yes")

# Host & Port for FastAPI Server
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8000"))


# Kokoro ONNX TTS Configuration (Local CPU Text-to-Speech)
TTS_ENABLED: bool = os.getenv("TTS_ENABLED", "true").lower() in ("true", "1", "yes")
KOKORO_MODEL: str = os.getenv("KOKORO_MODEL", "onnx-community/Kokoro-82M-v1.0-ONNX")
KOKORO_VOICE: str = os.getenv("KOKORO_VOICE", "af_bella")
KOKORO_MODEL_PATH: Optional[str] = os.getenv("KOKORO_MODEL_PATH", None)
KOKORO_VOICES_PATH: Optional[str] = os.getenv("KOKORO_VOICES_PATH", None)

