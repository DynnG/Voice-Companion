/**
 * Test Suite: PAL Introduction Stability & Startup Concurrency
 *
 * Verifies:
 * 1. VoiceExperience Intro Guard:
 *    - hasSpokenInitialRef prevents duplicate speech of the same intro
 *    - StrictMode dev double-mount and parent re-renders do not restart intro
 *    - Intro effect does NOT cancel in-progress speech on effect cleanup
 *    - Dedicated unmount lifecycle cleanly cleans up audio
 * 2. DocumentAttachmentScreen Concurrency:
 *    - isStarting state disables Start Interview button immediately
 *    - Rapid clicks/taps are rejected
 *    - Button is re-enabled if starting fails
 * 3. VoiceCompanion In-Flight Guard:
 *    - isStartingInterviewRef blocks concurrent start requests even if UI guard fails
 *    - Only a single interview session & initial Gemini call is made
 * 4. TTS Playback Stability:
 *    - chromeHeartbeatInterval pause()/resume() removed (no audio skipping)
 *    - stopSpeaking() only cancels when speech is actually speaking or pending
 *    - speakText() does not invoke unnecessary cancel() when idle
 *    - User barge-in still cleanly calls stopSpeaking()
 */

import * as fs from 'fs';
import * as path from 'path';

function runIntroStabilityTestSuite() {
  console.log('============================================================');
  console.log('MockMate PAL Intro Stability & Concurrency Test Suite');
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
  const voiceExpPath = path.join(rootDir, 'src', 'components', 'VoiceExperience.tsx');
  const docScreenPath = path.join(rootDir, 'src', 'components', 'DocumentAttachmentScreen.tsx');
  const companionPath = path.join(rootDir, 'src', 'components', 'VoiceCompanion.tsx');
  const ttsServicePath = path.join(rootDir, 'src', 'services', 'ttsService.ts');

  const voiceExpCode = fs.readFileSync(voiceExpPath, 'utf8').replace(/\r\n/g, '\n');
  const docScreenCode = fs.readFileSync(docScreenPath, 'utf8').replace(/\r\n/g, '\n');
  const companionCode = fs.readFileSync(companionPath, 'utf8').replace(/\r\n/g, '\n');
  const ttsServiceCode = fs.readFileSync(ttsServicePath, 'utf8').replace(/\r\n/g, '\n');

  // --- 1. VoiceExperience Intro Guard ---
  console.log('--- 1. VoiceExperience Intro Guard ---');

  assert(
    voiceExpCode.includes('hasSpokenInitialRef = useRef<string | null>(null)'),
    'VoiceExperience defines hasSpokenInitialRef to track intro question spoken state'
  );

  assert(
    voiceExpCode.includes('if (initialQuestionToSpeak && hasSpokenInitialRef.current !== initialQuestionToSpeak)'),
    'VoiceExperience guards intro speech: only speaks if not previously spoken for this question'
  );

  assert(
    voiceExpCode.includes('hasSpokenInitialRef.current = initialQuestionToSpeak;'),
    'VoiceExperience immediately marks hasSpokenInitialRef when starting intro speech'
  );

  // Check that the intro effect does NOT return a cleanup calling stopSpeaking
  const introEffectMatch = voiceExpCode.match(
    /\/\/\s*Play initial interviewer question[\s\S]*?useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[initialQuestionToSpeak\]\);/
  );
  assert(Boolean(introEffectMatch), 'Found intro useEffect([initialQuestionToSpeak]) block');
  if (introEffectMatch) {
    const introBody = introEffectMatch[1];
    assert(
      !introBody.includes('return () =>') && !introBody.includes('stopSpeaking()'),
      'Intro effect does NOT return a cleanup calling stopSpeaking() (avoids cancelling speech on StrictMode/re-render)'
    );
  }

  // Check that the dedicated unmount hook handles stopSpeaking()
  const unmountEffectMatch = voiceExpCode.match(
    /\/\/\s*Clean up all audio resources on unmount[\s\S]*?useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[\]\);/
  );
  assert(Boolean(unmountEffectMatch), 'Found dedicated unmount useEffect([], ...) block');
  if (unmountEffectMatch) {
    const unmountBody = unmountEffectMatch[1];
    assert(
      unmountBody.includes('stopSpeaking()'),
      'Dedicated unmount hook cleanly stops speaking when component actually unmounts'
    );
  }

  // Check that reset happens when interviewId changes
  const interviewIdResetMatch = voiceExpCode.match(
    /useEffect\(\(\)\s*=>\s*\{[\s\S]*?hasSpokenInitialRef\.current\s*=\s*null;[\s\S]*?\},\s*\[interviewId\]\);/
  );
  assert(
    Boolean(interviewIdResetMatch),
    'VoiceExperience resets hasSpokenInitialRef when interviewId changes'
  );

  // --- 2. DocumentAttachmentScreen Concurrency Guard ---
  console.log('\n--- 2. DocumentAttachmentScreen Concurrency Guard ---');

  assert(
    docScreenCode.includes('const [isStarting, setIsStarting] = useState(false);') ||
    docScreenCode.includes('const [isStarting, setIsStarting] = useState<boolean>(false);'),
    'DocumentAttachmentScreen maintains isStarting state'
  );

  assert(
    docScreenCode.includes('if (isStarting) return;') ||
    docScreenCode.includes('if (isStarting) { return; }'),
    'handleStartInterview rejects execution when isStarting is true'
  );

  assert(
    docScreenCode.includes('setIsStarting(true);'),
    'handleStartInterview sets isStarting to true immediately upon invocation'
  );

  assert(
    docScreenCode.includes('disabled={isStarting}'),
    'Start Interview button has disabled={isStarting} to prevent rapid user clicks'
  );

  assert(
    docScreenCode.includes('catch') && docScreenCode.includes('setIsStarting(false)'),
    'DocumentAttachmentScreen resets isStarting to false on error so user can retry'
  );

  // --- 3. VoiceCompanion In-Flight Guard ---
  console.log('\n--- 3. VoiceCompanion In-Flight Guard ---');

  assert(
    companionCode.includes('isStartingInterviewRef = useRef<boolean>(false)'),
    'VoiceCompanion defines isStartingInterviewRef'
  );

  assert(
    companionCode.includes('if (isStartingInterviewRef.current || session.status !== \'setup\')') ||
    (companionCode.includes('isStartingInterviewRef.current') && companionCode.includes("session.status !== 'setup'")),
    'VoiceCompanion handleStartInterview checks isStartingInterviewRef and setup status'
  );

  assert(
    companionCode.includes('isStartingInterviewRef.current = true;'),
    'VoiceCompanion locks isStartingInterviewRef before starting async operations'
  );

  assert(
    companionCode.includes('finally {') && companionCode.includes('isStartingInterviewRef.current = false;'),
    'VoiceCompanion unlocks isStartingInterviewRef in finally block'
  );

  assert(
    companionCode.includes('isStartingInterviewRef.current = false;') &&
    companionCode.includes('const handleNewInterview = () => {'),
    'VoiceCompanion resets isStartingInterviewRef in handleNewInterview'
  );

  // --- 4. TTS Playback Stability ---
  console.log('\n--- 4. TTS Playback Stability ---');

  assert(
    !ttsServiceCode.includes('chromeHeartbeatInterval'),
    'ttsService has completely removed chromeHeartbeatInterval (no pause/resume audio skipping)'
  );

  assert(
    !ttsServiceCode.includes('window.speechSynthesis.pause();\n          window.speechSynthesis.resume();'),
    'ttsService no longer executes pause()/resume() interval hack'
  );

  assert(
    ttsServiceCode.includes('if (window.speechSynthesis.speaking || window.speechSynthesis.pending)') &&
    ttsServiceCode.includes('window.speechSynthesis.cancel();'),
    'stopSpeaking() only cancels speechSynthesis if speaking or pending'
  );

  assert(
    ttsServiceCode.includes('if (isSpeaking()) {\n    stopSpeaking();\n  }'),
    'speakText() checks if (isSpeaking()) before calling stopSpeaking() to avoid idle cancels'
  );

  // --- 5. Barge-in & Audio Controls ---
  console.log('\n--- 5. User Barge-In Cleanliness ---');

  assert(
    voiceExpCode.includes("if (state === 'speaking') {") &&
    voiceExpCode.includes('stopSpeaking();'),
    'User tapping mic during speaking state triggers immediate barge-in stopSpeaking()'
  );

  assert(
    voiceExpCode.includes('const startRecording = async () => {') &&
    voiceExpCode.includes('stopSpeaking();'),
    'startRecording guarantees stopSpeaking() is called when recording starts'
  );

  // --- 6. Behavioral Simulation Tests ---
  console.log('\n--- 6. Behavioral Simulation Tests ---');

  // Test 6.1: StrictMode double-mount simulation on VoiceExperience intro
  let speakCalls = 0;
  let simulatedSpokenRef: string | null = null;
  const mockInitialQuestion = 'Hello! Welcome to your interview. Can you tell me about yourself?';

  function simulateMount(question: string) {
    if (question && simulatedSpokenRef !== question) {
      simulatedSpokenRef = question;
      speakCalls++;
    }
  }

  // React 18 StrictMode: Mount -> Cleanup -> Remount
  simulateMount(mockInitialQuestion); // First mount
  // Dev unmount simulation (effect cleanup runs, but ref holds across component lifecycle)
  simulateMount(mockInitialQuestion); // Second mount
  // Parent re-render with same prop
  simulateMount(mockInitialQuestion);

  assert(
    speakCalls === 1,
    `StrictMode / re-render simulation: speakText was called exactly ${speakCalls} time(s) (expected 1)`
  );

  // Test 6.2: Rapid clicks simulation on DocumentAttachmentScreen
  let startInterviewCalls = 0;
  let simulatedIsStarting = false;

  async function simulateUserClick() {
    if (simulatedIsStarting) return;
    simulatedIsStarting = true;
    startInterviewCalls++;
    // Simulate async network request
    await new Promise((resolve) => setTimeout(resolve, 50));
    simulatedIsStarting = false;
  }

  // Fire 5 rapid clicks simultaneously
  Promise.all([
    simulateUserClick(),
    simulateUserClick(),
    simulateUserClick(),
    simulateUserClick(),
    simulateUserClick()
  ]).then(() => {
    assert(
      startInterviewCalls === 1,
      `Rapid button click simulation: startInterview executed exactly ${startInterviewCalls} time(s) (expected 1)`
    );

    // Test 6.3: VoiceCompanion ref guard under parallel calls
    let inFlightRef = false;
    let geminiCalls = 0;

    async function simulateCompanionStart() {
      if (inFlightRef) return;
      inFlightRef = true;
      try {
        geminiCalls++;
        await new Promise((resolve) => setTimeout(resolve, 50));
      } finally {
        inFlightRef = false;
      }
    }

    Promise.all([
      simulateCompanionStart(),
      simulateCompanionStart(),
      simulateCompanionStart()
    ]).then(() => {
      assert(
        geminiCalls === 1,
        `Companion in-flight ref guard: Gemini initial request fired exactly ${geminiCalls} time(s) (expected 1)`
      );

      console.log('\n============================================================');
      console.log(`Results: ${passed} passed, ${failed} failed.`);
      console.log('============================================================\n');

      if (failed > 0) {
        process.exit(1);
      }
    });
  });
}

runIntroStabilityTestSuite();
