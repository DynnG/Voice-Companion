import os
import re
import sys
import time
import subprocess
from typing import List, Dict, Any, Tuple
from faster_whisper import WhisperModel

# Ensure directories
AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_audio_samples")
os.makedirs(AUDIO_DIR, exist_ok=True)

TEST_PHRASES = [
    # Core technical phrases requested
    {"id": "phrase_01_mock_interview", "ground_truth": "mock interview", "category": "Key Phrase"},
    {"id": "phrase_02_cs_student", "ground_truth": "Computer Science student", "category": "Key Phrase"},
    {"id": "phrase_03_software_developer", "ground_truth": "Software Developer", "category": "Key Phrase"},
    {"id": "phrase_04_js_ts", "ground_truth": "JavaScript and TypeScript", "category": "Key Phrase"},
    {"id": "phrase_05_react_nodejs", "ground_truth": "React and Node.js", "category": "Key Phrase"},
    {"id": "phrase_06_bachelors_cs", "ground_truth": "bachelor's degree in Computer Science", "category": "Key Phrase"},
    {"id": "phrase_07_work_exp", "ground_truth": "previous work experience", "category": "Key Phrase"},
    
    # Common interview dialogue and answers
    {"id": "answer_01_intro", "ground_truth": "I am a Computer Science student preparing for this technical mock interview.", "category": "Interview Answer"},
    {"id": "answer_02_role", "ground_truth": "I am applying for the Software Developer position at your company.", "category": "Interview Answer"},
    {"id": "answer_03_skills", "ground_truth": "My primary programming languages are JavaScript and TypeScript.", "category": "Interview Answer"},
    {"id": "answer_04_frameworks", "ground_truth": "I have hands on experience building full stack web applications with React and Node.js.", "category": "Interview Answer"},
    {"id": "answer_05_education", "ground_truth": "I recently completed my bachelor's degree in Computer Science with top honors.", "category": "Interview Answer"},
    {"id": "answer_06_experience", "ground_truth": "In my previous work experience, I collaborated with cross-functional teams to deliver cloud software.", "category": "Interview Answer"},
    {"id": "answer_07_full_stack", "ground_truth": "In my previous work experience as a Software Developer, I designed backend APIs in Node.js and frontend components in React.", "category": "Interview Answer"}
]

# Generate both male (David) and female (Zira) voices
VOICES = ["Microsoft David Desktop", "Microsoft Zira Desktop"]

def synthesize_audio_dataset():
    """Synthesize speech audio dataset across multiple voices and realistic interview phrases."""
    print("Synthesizing multi-voice interview audio dataset...")
    generated_samples = []
    
    for voice in VOICES:
        voice_tag = "david" if "David" in voice else "zira"
        for item in TEST_PHRASES:
            sample_id = f"{item['id']}_{voice_tag}"
            audio_file = os.path.join(AUDIO_DIR, f"{sample_id}.wav")
            
            if not os.path.exists(audio_file):
                text_escaped = item["ground_truth"].replace('"', '`"')
                ps_cmd = (
                    f'Add-Type -AssemblyName System.Speech; '
                    f'$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
                    f'$synth.SelectVoice("{voice}"); '
                    f'$synth.Rate = 0; '
                    f'$synth.SetOutputToWaveFile("{audio_file.replace(chr(92), "/")}"); '
                    f'$synth.Speak("{text_escaped}"); '
                    f'$synth.Dispose()'
                )
                subprocess.run(["powershell", "-Command", ps_cmd], check=True, capture_output=True)
            
            generated_samples.append({
                "id": sample_id,
                "ground_truth": item["ground_truth"],
                "category": item["category"],
                "voice": voice_tag,
                "audio_path": audio_file
            })
            
    print(f"Generated and validated {len(generated_samples)} audio test files.\n")
    return generated_samples

def normalize_text(text: str) -> str:
    """Normalize text for fair word-level accuracy calculation."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = text.split()
    return " ".join(tokens)

def calculate_word_level_metrics(reference: str, hypothesis: str) -> Dict[str, Any]:
    ref_words = normalize_text(reference).split()
    hyp_words = normalize_text(hypothesis).split()
    
    n = len(ref_words)
    m = len(hyp_words)
    
    if n == 0:
        return {"wer": 0.0 if m == 0 else 1.0, "word_accuracy": 100.0 if m == 0 else 0.0, "ref_count": 0, "errors": m, "exact_match": (m == 0)}
    
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
        
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if ref_words[i - 1] == hyp_words[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(
                    dp[i - 1][j],      # Deletion
                    dp[i][j - 1],      # Insertion
                    dp[i - 1][j - 1]   # Substitution
                )
                
    edit_distance = dp[n][m]
    wer = edit_distance / n
    word_acc = max(0.0, (1.0 - wer)) * 100.0
    exact_match = (normalize_text(reference) == normalize_text(hypothesis))
    
    return {
        "wer": round(wer, 4),
        "word_accuracy": round(word_acc, 2),
        "edit_distance": edit_distance,
        "ref_word_count": n,
        "hyp_word_count": m,
        "exact_match": exact_match
    }

def evaluate_model_configuration(
    samples: List[Dict[str, Any]],
    model_size: str,
    beam_size: int,
    compute_type: str = "int8",
    cpu_threads: int = 4
) -> Dict[str, Any]:
    print(f"\n{'='*75}")
    print(f"BENCHMARKING CONFIGURATION: Model='{model_size}' | Beam Size={beam_size} | Compute={compute_type}")
    print(f"{'='*75}")
    
    load_start = time.perf_counter()
    model = WhisperModel(model_size, device="cpu", compute_type=compute_type, cpu_threads=cpu_threads)
    load_time_ms = round((time.perf_counter() - load_start) * 1000, 2)
    print(f"Model Initialization Time: {load_time_ms} ms")
    
    sample_details = []
    total_latency_ms = 0.0
    total_ref_words = 0
    total_errors = 0
    exact_matches = 0
    
    for item in samples:
        audio_path = item["audio_path"]
        ground_truth = item["ground_truth"]
        
        start_time = time.perf_counter()
        segments, info = model.transcribe(
            audio_path,
            beam_size=beam_size,
            language="en",
            vad_filter=True
        )
        transcribed_text = " ".join([s.text.strip() for s in segments]).strip()
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        total_latency_ms += latency_ms
        
        metrics = calculate_word_level_metrics(ground_truth, transcribed_text)
        total_ref_words += metrics["ref_word_count"]
        total_errors += metrics["edit_distance"]
        if metrics["exact_match"]:
            exact_matches += 1
            
        sample_details.append({
            "id": item["id"],
            "voice": item["voice"],
            "ground_truth": ground_truth,
            "hypothesis": transcribed_text,
            "latency_ms": latency_ms,
            "metrics": metrics
        })
        
        status_icon = "[MATCH]" if metrics["exact_match"] else "[DIFF]"
        print(f" {status_icon} [{item['voice']}] \"{ground_truth}\" -> \"{transcribed_text}\" ({latency_ms} ms, Acc: {metrics['word_accuracy']}%)")
        
    avg_latency = round(total_latency_ms / len(samples), 2)
    overall_wer = round(total_errors / total_ref_words, 4) if total_ref_words > 0 else 0.0
    overall_accuracy = round(max(0.0, 1.0 - overall_wer) * 100.0, 2)
    exact_match_rate = round((exact_matches / len(samples)) * 100.0, 2)
    
    print(f"\n--- RESULTS: {model_size.upper()} (beam_size={beam_size}) ---")
    print(f"Average Transcription Latency: {avg_latency} ms / phrase")
    print(f"Word Accuracy (1 - WER)      : {overall_accuracy}%")
    print(f"Word Error Rate (WER)        : {overall_wer:.2%}")
    print(f"Exact Sentence Match Rate    : {exact_match_rate}% ({exact_matches}/{len(samples)})")
    
    return {
        "model": model_size,
        "beam_size": beam_size,
        "load_time_ms": load_time_ms,
        "avg_latency_ms": avg_latency,
        "overall_wer": overall_wer,
        "overall_accuracy": overall_accuracy,
        "exact_match_rate": exact_match_rate,
        "sample_details": sample_details
    }

def run_benchmark():
    samples = synthesize_audio_dataset()
    
    configs = [
        {"model_size": "tiny", "beam_size": 1},
        {"model_size": "small", "beam_size": 1},
        {"model_size": "small", "beam_size": 5}
    ]
    
    matrix = []
    for cfg in configs:
        res = evaluate_model_configuration(samples, cfg["model_size"], cfg["beam_size"])
        matrix.append(res)
        
    print("\n" + "="*92)
    print("               FINAL REALISTIC INTERVIEW STT ACCURACY & LATENCY MATRIX")
    print("="*92)
    header = f"{'Configuration':<22} | {'Avg Latency (ms)':<18} | {'Word Accuracy (%)':<18} | {'Exact Match (%)':<16} | {'WER (%)':<10}"
    print(header)
    print("-" * len(header))
    
    for row in matrix:
        cfg_name = f"{row['model']} (beam={row['beam_size']})"
        line = f"{cfg_name:<22} | {row['avg_latency_ms']:<18.2f} | {row['overall_accuracy']:<18.2f} | {row['exact_match_rate']:<16.2f} | {row['overall_wer']*100:<10.2f}"
        print(line)
    print("="*92)
    
    print("\nNotable Misrecognitions by Configuration:")
    for res in matrix:
        cfg_name = f"{res['model']} (beam={res['beam_size']})"
        diffs = [d for d in res["sample_details"] if not d["metrics"]["exact_match"]]
        print(f"\n--- {cfg_name} ({len(diffs)} mismatches / {len(res['sample_details'])} samples) ---")
        if not diffs:
            print("  None! Perfect 100% exact transcription on all phrases.")
        else:
            for d in diffs:
                print(f"  • Ref: \"{d['ground_truth']}\"")
                print(f"    Hyp: \"{d['hypothesis']}\" ({d['metrics']['edit_distance']} word edit distance)\n")

if __name__ == "__main__":
    run_benchmark()
