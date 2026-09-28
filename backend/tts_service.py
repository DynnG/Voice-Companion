import os
import io
import re
import time
import logging
import urllib.request
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any

import numpy as np
import soundfile as sf

try:
    from .config import (
        TTS_ENABLED, KOKORO_MODEL, KOKORO_VOICE,
        KOKORO_MODEL_PATH, KOKORO_VOICES_PATH
    )
except ImportError:
    from config import (
        TTS_ENABLED, KOKORO_MODEL, KOKORO_VOICE,
        KOKORO_MODEL_PATH, KOKORO_VOICES_PATH
    )

logger = logging.getLogger("voice-companion-tts")

# Official Kokoro-82M ONNX release URLs (quantized INT8 model + all 54 voices)
KOKORO_INT8_MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx"
KOKORO_VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"


def clean_text_for_speech(raw_text: str) -> str:
    """
    Sanitize LLM output for natural speech synthesis.
    Removes markdown bold/italic asterisks, code blocks, bullet points,
    and unnecessary symbols that confuse phonemization.
    """
    if not raw_text:
        return ""
    
    text = raw_text.strip()
    # Strip markdown code blocks
    text = re.sub(r"```[\s\S]*?```", "", text)
    # Strip inline code backticks
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Strip bold/italic markdown asterisks and underscores
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"_([^_]+)_", r"\1", text)
    # Strip markdown headers or rogue hash symbols
    text = re.sub(r"#+", "", text)
    # Strip markdown bullet points and list dashes
    text = re.sub(r"^\s*[-*•]\s+", "", text, flags=re.MULTILINE)
    # Strip markdown links [text](url) -> text
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    # Replace multiple whitespace and newlines with a single space
    text = re.sub(r"\s+", " ", text).strip()
    return text


def split_text_into_speech_chunks(text: str, max_chars_per_chunk: int = 240) -> List[str]:
    """
    Split text into natural speech chunks along sentence boundaries (.!?),
    ensuring tokens stay comfortably within ONNX model sequence limits
    while preserving natural prosody and conversational flow.
    """
    clean = clean_text_for_speech(text)
    if not clean:
        return []

    # Split into rough sentences using punctuation lookbehind
    raw_sentences = re.split(r"(?<=[.!?])\s+", clean)
    chunks: List[str] = []

    for s in raw_sentences:
        s = s.strip()
        if not s:
            continue
        if len(s) <= max_chars_per_chunk:
            chunks.append(s)
        else:
            # If a single sentence is exceptionally long, split by clause boundaries (, ; :)
            clauses = re.split(r"(?<=[,;:])\s+", s)
            current_clause_chunk = ""
            for c in clauses:
                c = c.strip()
                if not c:
                    continue
                if len(current_clause_chunk) + len(c) + 1 <= max_chars_per_chunk:
                    current_clause_chunk = f"{current_clause_chunk} {c}".strip()
                else:
                    if current_clause_chunk:
                        chunks.append(current_clause_chunk)
                    current_clause_chunk = c
            if current_clause_chunk:
                chunks.append(current_clause_chunk)

    return chunks if chunks else [clean]


class TTSService:
    """
    Singleton service managing Kokoro-82M ONNX Text-to-Speech synthesis on CPU.
    Loads the ONNX model once on startup and keeps it in memory for low-latency requests.
    """
    _instance: Optional["TTSService"] = None

    @classmethod
    def get_instance(cls) -> "TTSService":
        if cls._instance is None:
            cls._instance = TTSService()
        return cls._instance

    def __init__(self):
        self.enabled: bool = TTS_ENABLED
        self.model_name: str = KOKORO_MODEL
        self.default_voice: str = KOKORO_VOICE or "af_bella"
        self.kokoro = None
        self.loaded: bool = False
        self.error: Optional[str] = None
        self.sample_rate: int = 24000
        self.available_voices: List[str] = []

    def is_enabled(self) -> bool:
        return self.enabled

    def is_loaded(self) -> bool:
        return self.loaded and self.kokoro is not None

    def get_error(self) -> Optional[str]:
        return self.error

    def get_available_voices(self) -> List[str]:
        return self.available_voices

    def _resolve_paths(self) -> Tuple[str, str]:
        """
        Locate the Kokoro ONNX model and voices file.
        Checks user-configured paths, HuggingFace download cache,
        and local backend/models directory. Downloads automatically if missing.
        """
        backend_dir = Path(__file__).resolve().parent
        kokoro_dir = backend_dir / "models" / "kokoro"
        kokoro_dir.mkdir(parents=True, exist_ok=True)

        model_path: Optional[str] = None
        voices_path: Optional[str] = None

        # 1. Check custom path from env if set
        if KOKORO_MODEL_PATH and os.path.exists(KOKORO_MODEL_PATH):
            model_path = KOKORO_MODEL_PATH
        if KOKORO_VOICES_PATH and os.path.exists(KOKORO_VOICES_PATH):
            voices_path = KOKORO_VOICES_PATH

        # 2. Check HuggingFace onnx-community model path
        hf_dir = backend_dir / "models" / "kokoro_hf" / "onnx" / "model_quantized.onnx"
        if not model_path and hf_dir.exists():
            model_path = str(hf_dir)

        # 3. Check default local model paths
        default_model = kokoro_dir / "kokoro-v1.0.int8.onnx"
        if not model_path and default_model.exists():
            model_path = str(default_model)

        default_fp32_model = kokoro_dir / "kokoro-v1.0.onnx"
        if not model_path and default_fp32_model.exists():
            model_path = str(default_fp32_model)

        default_voices = kokoro_dir / "voices-v1.0.bin"
        if not voices_path and default_voices.exists():
            voices_path = str(default_voices)

        # 4. If files are not present, download automatically
        if not model_path:
            target_model = str(default_model)
            logger.info(f"Downloading Kokoro ONNX model to {target_model}...")
            try:
                urllib.request.urlretrieve(KOKORO_INT8_MODEL_URL, target_model)
                logger.info("Kokoro ONNX model download complete.")
                model_path = target_model
            except Exception as e:
                logger.error(f"Failed to download Kokoro ONNX model: {e}")
                raise RuntimeError(f"Could not obtain Kokoro ONNX model: {e}")

        if not voices_path:
            target_voices = str(default_voices)
            logger.info(f"Downloading Kokoro voices to {target_voices}...")
            try:
                urllib.request.urlretrieve(KOKORO_VOICES_URL, target_voices)
                logger.info("Kokoro voices download complete.")
                voices_path = target_voices
            except Exception as e:
                logger.error(f"Failed to download Kokoro voices: {e}")
                raise RuntimeError(f"Could not obtain Kokoro voices: {e}")

        return model_path, voices_path

    def load_model(self) -> None:
        """
        Load the Kokoro-82M ONNX model into memory once.
        Ensures execution is CPU-compatible with ONNX Runtime.
        """
        if not self.enabled:
            logger.info("Kokoro TTS is disabled via configuration (TTS_ENABLED=false).")
            return

        start_time = time.perf_counter()
        try:
            from kokoro_onnx import Kokoro
            model_path, voices_path = self._resolve_paths()

            logger.info(
                f"Loading Kokoro-82M ONNX TTS from '{os.path.basename(model_path)}' "
                f"with voices '{os.path.basename(voices_path)}' on CPU..."
            )
            self.kokoro = Kokoro(model_path, voices_path)
            self.available_voices = self.kokoro.get_voices()
            self.loaded = True
            self.error = None

            load_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.info(
                f"Kokoro-82M ONNX initialized successfully in {load_ms}ms! "
                f"Available voices: {len(self.available_voices)}. Default: '{self.default_voice}'"
            )
        except Exception as e:
            self.loaded = False
            self.error = str(e)
            logger.error(f"Failed to initialize Kokoro ONNX TTS model: {e}", exc_info=True)

    def synthesize(
        self,
        text: str,
        voice: Optional[str] = None,
        speed: float = 1.0
    ) -> Tuple[bytes, int]:
        """
        Synthesize speech from input text using Kokoro ONNX.
        Handles long responses safely by segmenting into natural sentence chunks
        and concatenating audio with brief natural pauses.
        Returns:
            Tuple of (wav_bytes: bytes, sample_rate: int)
        """
        if not self.enabled:
            raise RuntimeError("TTS service is disabled in configuration.")
        if not self.loaded or self.kokoro is None:
            raise RuntimeError(f"Kokoro TTS model is not loaded: {self.error or 'Initialization failed'}")

        clean_text = clean_text_for_speech(text)
        if not clean_text:
            raise ValueError("Input text for speech synthesis cannot be empty.")

        selected_voice = (voice or self.default_voice).strip()
        if selected_voice not in self.available_voices and self.available_voices:
            logger.warning(
                f"Requested voice '{selected_voice}' not found. "
                f"Falling back to '{self.default_voice}' or '{self.available_voices[0]}'."
            )
            selected_voice = self.default_voice if self.default_voice in self.available_voices else self.available_voices[0]

        chunks = split_text_into_speech_chunks(clean_text)
        if not chunks:
            chunks = [clean_text]

        start_time = time.perf_counter()
        audio_segments: List[np.ndarray] = []
        sample_rate = self.sample_rate

        # Natural inter-sentence pause: 120ms of silence
        pause_samples = np.zeros(int(sample_rate * 0.12), dtype=np.float32)

        for i, chunk in enumerate(chunks):
            try:
                samples, sr = self.kokoro.create(
                    chunk,
                    voice=selected_voice,
                    speed=speed,
                    lang="en-us"
                )
                if len(samples) > 0:
                    audio_segments.append(samples)
                    sample_rate = sr
                    # Add pause between consecutive sentences
                    if i < len(chunks) - 1:
                        audio_segments.append(pause_samples)
            except Exception as chunk_err:
                logger.warning(f"Error synthesizing chunk '{chunk[:30]}...': {chunk_err}")
                continue

        if not audio_segments:
            raise RuntimeError("Kokoro synthesis produced no audio samples.")

        final_samples = np.concatenate(audio_segments) if len(audio_segments) > 1 else audio_segments[0]

        # Export to in-memory standard 16-bit PCM WAV
        buf = io.BytesIO()
        sf.write(buf, final_samples, sample_rate, format="WAV", subtype="PCM_16")
        wav_bytes = buf.getvalue()

        total_ms = round((time.perf_counter() - start_time) * 1000, 2)
        audio_duration_sec = round(len(final_samples) / sample_rate, 2)
        logger.info(
            f"Kokoro TTS synthesized {audio_duration_sec}s of audio ({len(wav_bytes)} bytes) "
            f"in {total_ms}ms (Voice: {selected_voice}, Chunks: {len(chunks)}): \"{clean_text[:50]}...\""
        )

        return wav_bytes, sample_rate
