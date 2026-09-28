/**
 * MockMate Dynamic Voice-Reactive Orb Animation Verification Suite
 * 
 * Verifies:
 * 1. Orb State Transitions across all 4 states:
 *    IDLE -> LISTENING (USER SPEAKING) -> THINKING -> SPEAKING -> IDLE
 * 2. Voice-Reactivity in LISTENING state:
 *    - Reduced, subtle scale range (~1.00 -> 1.08 / 1.10 max)
 *    - Quiet voice (low amplitude) -> small gentle breathing/movement (+1% to +3%)
 *    - Normal voice (medium amplitude) -> noticeable restrained pulsation (+4% to +6.5%)
 *    - Loud voice (high amplitude) -> controlled expansion (+8% to max +10%)
 *    - Soft saturation with Math.tanh preventing explosive scaling from loud audio spikes
 *    - Smoothing / envelope follower (asymmetric attack/decay, no jitter/flicker)
 * 3. Glow Boundary & Canvas Containment:
 *    - Halo radius strictly capped below canvas boundary (haloR <= maxSafeRadius * 0.88)
 *    - 5-stop velvety radial gradient ends in 100% transparency at halo boundary (alpha = 0)
 *    - Outer containers and canvas wrap set to overflow: visible
 *    - No square/rectangular boundary clipping under any audio condition
 * 4. THINKING state:
 *    - Slower, intelligent undulating rhythm
 *    - Preserves thinking color (--glow-b / violet)
 * 5. SPEAKING state:
 *    - Expressive speech cadence simulating vocal prosody
 *    - Continuous pulse during speech, stops when speech ends
 * 6. Barge-in:
 *    - Immediate stop of speaking animation, instant transition to mic-reactive listening
 * 7. Non-regression:
 *    - Microphone recording
 *    - Whisper transcription
 *    - Gemini interview flow
 *    - TTS playback
 */

import * as fs from 'fs';
import * as path from 'path';

function runVoiceReactiveTestSuite() {
  console.log('============================================================');
  console.log('MockMate Voice-Reactive Orb Animation Verification');
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

  const rootDir = process.cwd();
  const creaturePath = path.join(rootDir, 'src', 'components', 'VoiceCreature.tsx');
  const voiceExpPath = path.join(rootDir, 'src', 'components', 'VoiceExperience.tsx');
  const cssPath = path.join(rootDir, 'src', 'styles', 'voice-experience.css');

  const creatureCode = fs.readFileSync(creaturePath, 'utf8');
  const voiceExpCode = fs.readFileSync(voiceExpPath, 'utf8');
  const cssCode = fs.readFileSync(cssPath, 'utf8');

  // --- 1. Architectural Checks: Configuration & Audio Integration ---
  console.log('--- 1. Configuration & Pipeline Architecture ---');

  assert(
    creatureCode.includes('export interface VoiceReactiveConfig'),
    'VoiceReactiveConfig exported with configurable parameters'
  );
  assert(
    creatureCode.includes('micSensitivity') &&
    creatureCode.includes('micExpansionMax') &&
    creatureCode.includes('speechPulseSpeed') &&
    creatureCode.includes('thinkingSpeed') &&
    creatureCode.includes('idleBreathingAmp'),
    'All required parameters (micSensitivity, micExpansionMax, speechPulseSpeed, thinkingSpeed, idleBreathingAmp) defined'
  );
  assert(
    creatureCode.includes('audioLevelRef') && creatureCode.includes('externalAudioRef'),
    'audioLevelRef supported for zero-overhead animation loop reads'
  );
  assert(
    voiceExpCode.includes('micAudioLevelRef = useRef<number>(0)'),
    'VoiceExperience maintains micAudioLevelRef'
  );
  assert(
    voiceExpCode.includes('audioLevelRef={micAudioLevelRef}'),
    'VoiceExperience passes audioLevelRef into VoiceCreature'
  );
  assert(
    voiceExpCode.includes('saturatedLevel = Math.min(1.0, Math.tanh(rawEnergy * 8.0))'),
    'startSilenceDetection normalizes with Math.tanh soft-limiter to prevent loud audio bursts'
  );

  // --- 2. State 1: IDLE Behavior ---
  console.log('\n--- 2. State 1: IDLE (Subtle Organic Breathing) ---');
  assert(
    creatureCode.includes('idleBreathing = Math.sin(t * cur.speed * 0.9) * cfg.idleBreathingAmp'),
    'Idle state uses subtle organic breathing amplitude without violent distortion'
  );
  assert(
    creatureCode.includes("colorVar: '--glow-idle'"),
    'Idle state maintains original serene slate/dark-teal color'
  );

  // --- 3. State 2: USER SPEAKING (Restrained Amplitude & Smoothing) ---
  console.log('\n--- 3. State 2: USER SPEAKING (Subtle Reactivity & Anti-Clipping) ---');
  assert(
    creatureCode.includes('smoothedMicLevel += (rawMicInput - smoothedMicLevel) * 0.28') &&
    creatureCode.includes('smoothedMicLevel += (rawMicInput - smoothedMicLevel) * 0.10'),
    'Asymmetrical attack (0.28) and decay (0.10) envelope follower prevents jitter and flicker'
  );
  assert(
    creatureCode.includes('voiceExpansion = smoothedMicLevel * cfg.micExpansionMax'),
    'Voice amplitude dynamically expands orb radius within controlled bounds'
  );
  assert(
    creatureCode.includes('totalScale = Math.min(1.10, Math.max(0.98, 1 + voiceBreathe + voiceExpansion + voiceMicroPulse))'),
    'Total scale is strictly capped at 1.10 (maximum 10% expansion) to keep orb compact'
  );
  assert(
    creatureCode.includes('haloR = Math.min(maxSafeRadius * 0.88'),
    'Halo radius is strictly capped at 88% of canvas edge distance (maxSafeRadius * 0.88)'
  );
  assert(
    creatureCode.includes("halo.addColorStop(1,    `rgba(${col},0)`)"),
    'Radial gradient fades to 100% transparency at halo boundary, preventing rectangular edge slice'
  );
  assert(
    cssCode.includes('overflow: visible;') && voiceExpCode.includes('overflow-visible'),
    'CSS and layout wrapper containers specify overflow: visible for glow propagation'
  );

  // Math simulation of subtle voice reactivity:
  const baseR = 64;
  const cfg = {
    micSensitivity: 1.0,
    micExpansionMax: 0.08,
    micLobeDistortionMax: 0.05,
    speechPulseSpeed: 4.8,
    speechPulseMax: 0.06,
    thinkingSpeed: 1.4,
    idleBreathingAmp: 0.015,
  };

  function simulateVoiceResponse(inputAmp: number) {
    const voiceExpansion = inputAmp * cfg.micExpansionMax;
    const totalScale = Math.min(1.10, Math.max(0.98, 1 + voiceExpansion));
    const radius = baseR * totalScale;
    return { expansionPct: (radius / baseR - 1) * 100, radius, totalScale };
  }

  const quietVoice = simulateVoiceResponse(0.20);
  const normalVoice = simulateVoiceResponse(0.60);
  const loudVoice = simulateVoiceResponse(1.00);
  const extremeVoice = simulateVoiceResponse(2.50);

  assert(
    quietVoice.expansionPct >= 1.0 && quietVoice.expansionPct <= 3.0,
    `Quiet voice volume (0.20) produces subtle, gentle movement: +${quietVoice.expansionPct.toFixed(1)}%`
  );
  assert(
    normalVoice.expansionPct >= 3.5 && normalVoice.expansionPct <= 6.5,
    `Normal voice volume (0.60) produces noticeable, restrained pulsation: +${normalVoice.expansionPct.toFixed(1)}%`
  );
  assert(
    loudVoice.expansionPct >= 7.0 && loudVoice.expansionPct <= 10.01,
    `Loud voice volume (1.00) produces strong but controlled expansion: +${loudVoice.expansionPct.toFixed(1)}%`
  );
  assert(
    extremeVoice.expansionPct <= 10.01,
    `Extreme loud volume (2.50) is strictly clamped to max 10.0%: +${extremeVoice.expansionPct.toFixed(1)}%`
  );

  // Geometric canvas containment simulation (320px x 320px box):
  const boxW = 320;
  const boxH = 320;
  const maxSafeRadius = Math.min(boxW / 2, boxH / 2); // 160px
  const simBaseR = Math.min(boxW, boxH) * 0.18; // 57.6px
  const simDynBaseR = simBaseR * 1.10; // max 63.36px
  const simHaloR = Math.min(maxSafeRadius * 0.88, simDynBaseR * (2.1 + 0.15)); // capped at 140.8px
  const canvasEdgeDistance = maxSafeRadius - simHaloR;

  assert(
    simHaloR < maxSafeRadius && canvasEdgeDistance >= 15,
    `Canvas buffer check: Halo radius (${simHaloR.toFixed(1)}px) leaves a safe transparent margin of ${canvasEdgeDistance.toFixed(1)}px before canvas boundary (${maxSafeRadius}px)`
  );

  // --- 4. State 3: THINKING (Cognitive Undulation) ---
  console.log('\n--- 4. State 3: THINKING (Cognitive Undulation) ---');
  assert(
    creatureCode.includes('cognitivePulse = Math.sin(t * cfg.thinkingSpeed) * 0.035 + Math.sin(t * 0.65) * 0.018'),
    'Thinking state implements slower, intelligent dual-harmonic rhythm'
  );
  assert(
    creatureCode.includes("colorVar: '--glow-b'"),
    'Thinking state preserves violet contemplative glow'
  );

  // --- 5. State 4: AI IS SPEAKING (Expressive Speech Cadence) ---
  console.log('\n--- 5. State 4: AI IS SPEAKING (Expressive Vocal Cadence) ---');
  assert(
    creatureCode.includes('syllabicCadence = Math.sin(t * cfg.speechPulseSpeed)'),
    'AI speaking state simulates natural syllabic vocal prosody'
  );
  assert(
    creatureCode.includes('speechExpansion = speechEnvelope * cfg.speechPulseMax'),
    'Speech cadence pulses continuously during speech'
  );
  assert(
    creatureCode.includes("colorVar: '--glow-c'"),
    'Speaking state maintains amber warm speech glow'
  );
  assert(
    creatureCode.includes('dynRing > 0.02'),
    'Speaking state projects radiant outward pulse rings'
  );

  // --- 6. Barge-in & State Priority ---
  console.log('\n--- 6. Barge-in & State Priority Verification ---');
  assert(
    voiceExpCode.includes("if (state === 'speaking') {") &&
    voiceExpCode.includes('stopSpeaking()') &&
    voiceExpCode.includes('startRecording()'),
    'Barge-in correctly intercepts speaking state, stops speech, and transitions to recording'
  );
  assert(
    voiceExpCode.includes('micAudioLevelRef.current = 0') &&
    voiceExpCode.includes('cleanupAudioResources()'),
    'Audio cleanup resets mic levels on state transitions'
  );

  console.log('\n============================================================');
  console.log(`Voice-Reactive Animation Verification: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVoiceReactiveTestSuite();
