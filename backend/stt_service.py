import io
import gc
import time
import logging
from typing import Dict, Any, Optional, Tuple, Union, List
import av
import av.audio.resampler
import numpy as np
from faster_whisper import WhisperModel

try:
    from .config import (
        MODEL_SIZE,
        DEVICE,
        COMPUTE_TYPE,
        BEAM_SIZE,
        CPU_THREADS,
        DEFAULT_LANGUAGE,
        VAD_FILTER,
        CONDITION_ON_PREVIOUS_TEXT
    )
except ImportError:
    from config import (
        MODEL_SIZE,
        DEVICE,
        COMPUTE_TYPE,
        BEAM_SIZE,
        CPU_THREADS,
        DEFAULT_LANGUAGE,
        VAD_FILTER,
        CONDITION_ON_PREVIOUS_TEXT
    )

logger = logging.getLogger(__name__)

def decode_audio_bytes(
    file_bytes: bytes,
    sampling_rate: int = 16000
) -> Tuple[np.ndarray, float, float]:
    """
    Decode audio bytes into a 16kHz mono float32 NumPy array using PyAV.
    Handles containers (WebM, WAV, OGG, MP3, FLAC) in memory with validation.
    
    Returns:
        (audio_array, duration_seconds, decode_time_ms)
    Raises:
        ValueError: If audio payload is empty, corrupted, or contains no decodable frames.
    """
    start_decode = time.perf_counter()
    if not file_bytes:
        raise ValueError("Uploaded audio file is empty (0 bytes).")

    if len(file_bytes) < 32:
        raise ValueError("Audio payload is too small to contain valid audio stream headers.")

    try:
        container = av.open(io.BytesIO(file_bytes), mode="r", metadata_errors="ignore")
    except Exception as e:
        raise ValueError(f"Could not open audio container: {str(e)}") from e

    if not container.streams.audio:
        container.close()
        raise ValueError("Audio container contains no valid audio stream tracks.")

    resampler = av.audio.resampler.AudioResampler(
        format="s16",
        layout="mono",
        rate=sampling_rate,
    )

    raw_buffer = io.BytesIO()
    dtype = None
    frame_count = 0

    try:
        for frame in container.decode(audio=0):
            frame.pts = None
            resampled_frames = resampler.resample(frame)
            if resampled_frames is not None:
                if not isinstance(resampled_frames, list):
                    resampled_frames = [resampled_frames]
                for rf in resampled_frames:
                    array = rf.to_ndarray()
                    dtype = array.dtype
                    raw_buffer.write(array)
                    frame_count += 1
    except (av.error.InvalidDataError, av.error.FFmpegError, Exception) as err:
        if frame_count == 0:
            container.close()
            raise ValueError(f"Corrupted or invalid audio stream data: {str(err)}") from err
        logger.warning(f"PyAV warning encountered during stream decode (recovered {frame_count} frames): {err}")
    finally:
        container.close()
        del resampler
        gc.collect()

    if frame_count == 0 or raw_buffer.tell() == 0:
        raise ValueError("No valid audio frames could be decoded from the provided audio data.")

    audio = np.frombuffer(raw_buffer.getbuffer(), dtype=dtype or np.int16)
    audio = audio.astype(np.float32) / 32768.0
    duration = float(len(audio)) / float(sampling_rate)
    decode_time_ms = round((time.perf_counter() - start_decode) * 1000, 2)

    return audio, duration, decode_time_ms


class STTService:
    _instance: Optional["STTService"] = None
    _model: Optional[WhisperModel] = None

    @classmethod
    def get_instance(cls) -> "STTService":
        if cls._instance is None:
            cls._instance = STTService()
        return cls._instance

    def __init__(self):
        self.model_size = MODEL_SIZE
        self.device = DEVICE
        self.compute_type = COMPUTE_TYPE
        self.beam_size = BEAM_SIZE
        self.cpu_threads = CPU_THREADS
        self.default_language = DEFAULT_LANGUAGE
        self.vad_filter = VAD_FILTER
        self.condition_on_previous_text = CONDITION_ON_PREVIOUS_TEXT

    def load_model(self) -> WhisperModel:
        if self._model is None:
            logger.info(
                f"Loading faster-whisper model '{self.model_size}' on {self.device} with {self.compute_type} "
                f"(threads={self.cpu_threads}, default_lang={self.default_language})..."
            )
            self._model = WhisperModel(
                model_size_or_path=self.model_size,
                device=self.device,
                compute_type=self.compute_type,
                cpu_threads=self.cpu_threads
            )
            logger.info("faster-whisper model successfully loaded and cached in memory.")
        return self._model

    def transcribe_audio_payload(
        self,
        audio_input: Union[bytes, np.ndarray, str],
        beam_size: Optional[int] = None,
        language: Optional[str] = None,
        upload_write_ms: float = 0.0
    ) -> Dict[str, Any]:
        """
        Transcribe an audio payload (bytes, numpy array, or file path) with stage-by-stage latency tracking.
        """
        model = self.load_model()
        eff_beam = beam_size if beam_size is not None else self.beam_size
        eff_lang = language if language is not None else self.default_language

        # 1. Audio Decode Stage
        if isinstance(audio_input, bytes):
            audio_array, duration, audio_decode_ms = decode_audio_bytes(audio_input)
        elif isinstance(audio_input, np.ndarray):
            audio_array = audio_input
            duration = float(len(audio_array)) / 16000.0
            audio_decode_ms = 0.0
        elif isinstance(audio_input, str):
            with open(audio_input, "rb") as f:
                file_bytes = f.read()
            audio_array, duration, audio_decode_ms = decode_audio_bytes(file_bytes)
        else:
            raise ValueError(f"Unsupported audio input type: {type(audio_input)}")

        # 2. Whisper Model Inference Stage
        start_inference = time.perf_counter()

        segments, info = model.transcribe(
            audio_array,
            beam_size=eff_beam,
            language=eff_lang,
            temperature=0.0,
            condition_on_previous_text=self.condition_on_previous_text,
            vad_filter=self.vad_filter
        )

        segment_list = []
        text_parts = []

        for segment in segments:
            clean_text = segment.text.strip()
            if clean_text:
                text_parts.append(clean_text)
                segment_list.append({
                    "id": segment.id,
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": clean_text
                })

        inference_time_ms = round((time.perf_counter() - start_inference) * 1000, 2)
        full_text = " ".join(text_parts).strip()
        total_processing_ms = round(upload_write_ms + audio_decode_ms + inference_time_ms, 2)

        timings = {
            "upload_write_ms": upload_write_ms,
            "audio_decode_ms": audio_decode_ms,
            "inference_ms": inference_time_ms,
            "total_processing_ms": total_processing_ms
        }

        logger.info(
            f"Transcription finished: text=\"{full_text}\" | "
            f"Duration={duration:.2f}s | "
            f"Timings: decode={audio_decode_ms}ms, inference={inference_time_ms}ms, total={total_processing_ms}ms | "
            f"[model={self.model_size}, beam={eff_beam}, lang={info.language}]"
        )

        return {
            "text": full_text,
            "language": info.language,
            "language_probability": round(info.language_probability, 4) if info.language_probability is not None else 1.0,
            "duration": round(duration, 2),
            "processing_time_ms": total_processing_ms,
            "inference_time_ms": inference_time_ms,
            "timings": timings,
            "model": self.model_size,
            "segments": segment_list
        }

    # Backward compatible helper
    def transcribe(
        self,
        audio_path: str,
        beam_size: Optional[int] = None,
        language: Optional[str] = None
    ) -> Dict[str, Any]:
        return self.transcribe_audio_payload(
            audio_input=audio_path,
            beam_size=beam_size,
            language=language
        )
