import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Search and load .env from backend directory or project root
backend_env = Path(__file__).resolve().parent / ".env"
root_env = Path(__file__).resolve().parent.parent / ".env"

if backend_env.exists():
    load_dotenv(dotenv_path=backend_env)
elif root_env.exists():
    load_dotenv(dotenv_path=root_env)
else:
    load_dotenv()

# Gemini API Configuration
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
# Default to gemini-2.5-flash for fast conversational responses
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

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
# "small" is the recommended model for interview vocabulary accuracy and high reliability on CPU
MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "small")

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

# Gemini API Configuration (Job Interview Practice Brain)
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

