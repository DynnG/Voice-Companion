import time
import os
import urllib.request
from faster_whisper import WhisperModel

# Download a real human spoken English audio sample (JFK sample from Whisper repository)
SAMPLE_URL = "https://raw.githubusercontent.com/SYSTRAN/faster-whisper/master/tests/data/jfk.flac"
SAMPLE_PATH = "backend/test_sample_jfk.flac"

def ensure_sample_audio():
    if not os.path.exists(SAMPLE_PATH):
        print(f"Downloading test speech audio sample from {SAMPLE_URL}...")
        urllib.request.urlretrieve(SAMPLE_URL, SAMPLE_PATH)
        print("Sample downloaded successfully.")

def benchmark_model(model_size: str, compute_type: str = "int8", beam_size: int = 1, runs: int = 3):
    print(f"\n--- Benchmarking Model: '{model_size}' (compute={compute_type}, beam_size={beam_size}) ---")
    load_start = time.perf_counter()
    model = WhisperModel(model_size, device="cpu", compute_type=compute_type, cpu_threads=4)
    load_time = (time.perf_counter() - load_start) * 1000
    print(f"Model Load Time: {load_time:.1f} ms")

    times = []
    text_result = ""
    lang_detected = ""
    lang_prob = 0.0

    for i in range(runs):
        start = time.perf_counter()
        segments, info = model.transcribe(
            SAMPLE_PATH,
            beam_size=beam_size,
            language="en",
            vad_filter=True
        )
        texts = [s.text.strip() for s in segments]
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)
        text_result = " ".join(texts)
        lang_detected = info.language
        lang_prob = info.language_probability
        print(f"  Run {i+1}: {elapsed:.1f} ms")

    avg_time = sum(times) / len(times)
    min_time = min(times)
    print(f"Average Inference Time: {avg_time:.1f} ms (Min: {min_time:.1f} ms)")
    print(f"Detected: {lang_detected} ({lang_prob:.2f})")
    print(f"Transcribed Text: \"{text_result}\"")
    return {
        "model": model_size,
        "beam_size": beam_size,
        "avg_ms": avg_time,
        "min_ms": min_time,
        "load_ms": load_time,
        "text": text_result
    }

if __name__ == "__main__":
    ensure_sample_audio()
    
    # 1. Benchmark small model (Before)
    res_small_beam5 = benchmark_model("small", compute_type="int8", beam_size=5, runs=2)
    res_small_beam1 = benchmark_model("small", compute_type="int8", beam_size=1, runs=2)
    
    # 2. Benchmark tiny model (After)
    res_tiny_beam5 = benchmark_model("tiny", compute_type="int8", beam_size=5, runs=2)
    res_tiny_beam1 = benchmark_model("tiny", compute_type="int8", beam_size=1, runs=3)
    
    print("\n========================================================")
    print("                 BENCHMARK SUMMARY                      ")
    print("========================================================")
    print(f"Small (beam=5): {res_small_beam5['avg_ms']:.1f} ms | Text: {res_small_beam5['text']}")
    print(f"Small (beam=1): {res_small_beam1['avg_ms']:.1f} ms | Text: {res_small_beam1['text']}")
    print(f"Tiny  (beam=5): {res_tiny_beam5['avg_ms']:.1f} ms | Text: {res_tiny_beam5['text']}")
    print(f"Tiny  (beam=1): {res_tiny_beam1['avg_ms']:.1f} ms | Text: {res_tiny_beam1['text']}")
    
    speedup = res_small_beam5['avg_ms'] / res_tiny_beam1['avg_ms']
    print(f"\nSpeedup from Small (beam=5) -> Tiny (beam=1): {speedup:.2f}x faster!")
    print("========================================================")
