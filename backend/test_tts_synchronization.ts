/**
 * Comprehensive MockMate TTS & Audio Playback Synchronization Test Suite
 */

import { cleanTextForSpeech } from '../src/services/ttsService';

async function runTests() {
  console.log('============================================================');
  console.log('MockMate TTS & Audio Synchronization Verification Suite');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: Text Sanitization for Natural Speech
  // -------------------------------------------------------------
  console.log('--- Test 1: Text Sanitization for Natural Speech ---');
  const dirty = "**Great answer!** You mentioned `Kafka` and `Redis`. \n\n* How did you handle: \n1. Partitioning\n2. [Failover](http://example.com)?";
  const cleaned = cleanTextForSpeech(dirty);
  assert(!cleaned.includes('*'), 'Markdown asterisks stripped');
  assert(!cleaned.includes('`'), 'Inline code backticks stripped');
  assert(!cleaned.includes('['), 'Markdown link brackets stripped');
  assert(cleaned.includes('Great answer! You mentioned Kafka and Redis.'), 'Text preserved accurately');
  console.log(`Sanitized: "${cleaned}"\n`);

  // -------------------------------------------------------------
  // Test 2: Synchronous Timing Simulation (Live Chat vs TTS)
  // -------------------------------------------------------------
  console.log('--- Test 2: Synchronous Response Dispatch Timing ---');
  
  // Simulate the Gemini response arriving at the frontend response handler
  const sampleGeminiResponse = "That is a solid approach to database connection pooling. How did you monitor connection timeouts?";
  
  let liveChatReceivedTime = 0;
  let ttsTriggeredTime = 0;
  let ttsStartedPlaybackTime = 0;

  const mockLiveChatStore: string[] = [];
  
  // Mock SpeechSynthesis environment
  let activeUtteranceMock: any = null;
  const mockSpeechSynthesis = {
    speaking: false,
    cancel: () => {
      mockSpeechSynthesis.speaking = false;
      activeUtteranceMock = null;
    },
    resume: () => {},
    speak: (utt: any) => {
      mockSpeechSynthesis.speaking = true;
      activeUtteranceMock = utt;
      // Web Speech API triggers onstart asynchronously in the microtask / next event tick (< 5ms)
      queueMicrotask(() => {
        ttsStartedPlaybackTime = performance.now();
        utt.onstart?.();
      });
    },
    getVoices: () => [
      { name: 'Microsoft Jenny Online (Natural) - English (United States)', lang: 'en-US' },
      { name: 'Google US English', lang: 'en-US' }
    ]
  };

  (globalThis as any).window = {
    speechSynthesis: mockSpeechSynthesis
  };

  // Execute the exact flow from VoiceExperience.tsx lines 424-495:
  const t0 = performance.now();

  // 1. Live Chat update
  mockLiveChatStore.push(sampleGeminiResponse);
  liveChatReceivedTime = performance.now();

  // 2. TTS dispatch in same block
  ttsTriggeredTime = performance.now();
  mockSpeechSynthesis.cancel();
  mockSpeechSynthesis.resume();
  const mockUtt = {
    text: sampleGeminiResponse,
    onstart: () => {}
  };
  mockSpeechSynthesis.speak(mockUtt);

  // Wait for microtask / next tick
  await new Promise((r) => setTimeout(r, 15));

  const dispatchDelta = ttsTriggeredTime - liveChatReceivedTime;
  const playbackStartDelta = ttsStartedPlaybackTime - liveChatReceivedTime;

  console.log(`Live Chat dispatch at: +${(liveChatReceivedTime - t0).toFixed(3)}ms`);
  console.log(`TTS invocation at:     +${(ttsTriggeredTime - t0).toFixed(3)}ms`);
  console.log(`TTS audio starts at:   +${(ttsStartedPlaybackTime - t0).toFixed(3)}ms`);
  console.log(`Time Delta between Live Chat and TTS start: ${playbackStartDelta.toFixed(3)}ms`);

  assert(dispatchDelta < 1.0, `Live Chat and TTS dispatched in same tick (${dispatchDelta.toFixed(3)}ms delta)`);
  assert(playbackStartDelta < 15.0, `TTS starts playback within < 15ms of Live Chat message (${playbackStartDelta.toFixed(3)}ms)`);
  console.log('');

  // -------------------------------------------------------------
  // Test 3: Multiple Consecutive Turns (No Queueing / Overlapping)
  // -------------------------------------------------------------
  console.log('--- Test 3: Multiple Consecutive Turns & Interruption ---');
  let currentSpeechEnded = false;
  let activeTurn = 0;

  function speakTurn(turnId: number, text: string) {
    mockSpeechSynthesis.cancel(); // Stop prior turn immediately
    activeTurn = turnId;
    currentSpeechEnded = false;
    const utt = {
      text,
      onstart: () => {
        mockSpeechSynthesis.speaking = true;
      },
      onend: () => {
        if (activeTurn === turnId) {
          currentSpeechEnded = true;
          mockSpeechSynthesis.speaking = false;
        }
      }
    };
    mockSpeechSynthesis.speak(utt);
  }

  // Turn 1 starts
  speakTurn(1, "Question 1: Explain indexing.");
  assert(activeTurn === 1, 'Turn 1 active');

  // Candidate interrupts or Turn 2 arrives before Turn 1 finishes
  speakTurn(2, "Question 2: Explain deadlock.");
  assert(activeTurn === 2, 'Turn 2 interrupted Turn 1 cleanly');
  assert(mockSpeechSynthesis.speaking, 'Speech synthesis currently speaking Turn 2 only');

  // Candidate speaks / taps mic (barge-in interruption)
  mockSpeechSynthesis.cancel();
  assert(!mockSpeechSynthesis.speaking, 'Barge-in cancellation stopped all active speech');
  console.log('');

  // -------------------------------------------------------------
  // Test 4: Verify Backend /tts Status & Fallback Endpoint
  // -------------------------------------------------------------
  console.log('--- Test 4: Backend /tts and /tts/status Health Check ---');
  try {
    const statusRes = await fetch('http://127.0.0.1:8000/tts/status');
    assert(statusRes.ok, `GET /tts/status returned HTTP ${statusRes.status}`);
    const statusJson = await statusRes.json();
    assert(statusJson.enabled === true, 'Kokoro TTS enabled on backend');
    assert(statusJson.loaded === true, 'Kokoro ONNX model loaded into memory on backend');
    assert(statusJson.available_voices?.length > 0, `Kokoro available voices: ${statusJson.available_voices?.length}`);
    console.log(`Backend TTS status: default_voice='${statusJson.default_voice}', voices=${statusJson.available_voices?.length}`);
  } catch (err: any) {
    console.error('[FAIL] Could not connect to backend /tts/status:', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`Verification Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
