import sys
import os
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient
from main import app

def run_test():
    client = TestClient(app)
    h = client.get('/health')
    print('HEALTH STATUS:', h.status_code, h.json())

    wav_path = os.path.join(os.path.dirname(__file__), 'test_vad_turn.wav')
    ps_cmd = (
        'Add-Type -AssemblyName System.Speech; '
        '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
        '$synth.Rate = 0; '
        f'$synth.SetOutputToWaveFile("{wav_path.replace(chr(92), "/")}"); '
        '$synth.Speak("I have five years of experience building scalable backend services with Python and FastAPI."); '
        '$synth.Dispose()'
    )
    subprocess.run(['powershell', '-Command', ps_cmd], check=True)

    with open(wav_path, 'rb') as f:
        audio_bytes = f.read()

    print(f'Sending {len(audio_bytes)} audio bytes to /transcribe endpoint...')
    res = client.post(
        '/transcribe',
        files={'file': ('answer.wav', audio_bytes, 'audio/wav')},
        data={
            'job_role': 'Senior Backend Engineer',
            'generate_ai_response': 'true'
        }
    )

    print('TRANSCRIBE STATUS:', res.status_code)
    data = res.json()
    print('\n[TRANSCRIPTION]:', data.get('transcription'))
    print('\n[GEMINI AI INTERVIEWER RESPONSE]:', data.get('ai_response'))
    return res.status_code == 200

if __name__ == '__main__':
    ok = run_test()
    sys.exit(0 if ok else 1)
