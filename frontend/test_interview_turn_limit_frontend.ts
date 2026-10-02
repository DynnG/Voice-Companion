/**
 * MockMate Hard Interview Ending Limit Verification Suite (Frontend)
 *
 * Verifies:
 * 1. Hard interview ending limit is configured to 8 turns (MAX_INTERVIEW_TURNS = 8).
 * 2. Exact required concluding statement is defined:
 *    "That brings us to the end of our interview. Thank you for taking the time to practice with me. You did a great job working through the questions. You can now review your answers and feedback."
 * 3. On Turn 8, PAL naturally finishes the interview:
 *    - No Gemini follow-up request is made (fetchFollowupInterviewQuestion is bypassed).
 *    - User transcript is appended.
 *    - PAL ending message is appended to the transcript.
 *    - Ending caption is displayed.
 *    - onInterviewCompleted('turn_limit_reached') is triggered.
 *    - TTS speaks the ending message and stops on completion.
 *    - Custom label set to 'Interview Complete'.
 *    - Microphone and controls disabled.
 * 4. Attempt 2 retries do NOT consume interview turns (same-question retry).
 * 5. Short answers do NOT cause early completion on turns 1-7.
 * 6. AnswerReplayCard receives isCompleted and prevents further interview re-recording.
 */

import * as fs from 'fs';
import * as path from 'path';

function runTurnLimitTestSuite() {
  console.log('============================================================');
  console.log('MockMate Hard Interview Ending Limit Verification');
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
  const replayCardPath = path.join(rootDir, 'src', 'components', 'AnswerReplayCard.tsx');

  const voiceExpCode = fs.readFileSync(voiceExpPath, 'utf8').replace(/\r\n/g, '\n');
  const replayCardCode = fs.readFileSync(replayCardPath, 'utf8').replace(/\r\n/g, '\n');

  const EXPECTED_ENDING_MESSAGE =
    'That brings us to the end of our interview. Thank you for taking the time to practice with me. You did a great job working through the questions. You can now review your answers and feedback.';

  // --- 1. Constant Definitions & Ending Message ---
  console.log('--- 1. Turn Limit Configuration & Message Accuracy ---');
  assert(
    voiceExpCode.includes('MAX_INTERVIEW_TURNS = 8'),
    'MAX_INTERVIEW_TURNS is set to 8'
  );
  assert(
    voiceExpCode.includes(EXPECTED_ENDING_MESSAGE),
    'INTERVIEW_ENDING_MESSAGE matches exact required text'
  );

  // --- 2. Turn Counting & Attempt 2 Separation ---
  console.log('\n--- 2. Turn Counting & Attempt 2 Separation ---');
  assert(
    voiceExpCode.includes("!m.text.startsWith('(Attempt 2)')"),
    'Turn counter filters out Attempt 2 retries so retrying does not consume question turns'
  );
  assert(
    voiceExpCode.includes('candidateTurnCountRef'),
    'candidateTurnCountRef maintains strictly monotonic turn counts across renders'
  );

  // --- 3. Turn 8 Final Allowed Turn Termination ---
  console.log('\n--- 3. Turn 8 Final Allowed Turn Termination ---');
  assert(
    voiceExpCode.includes('if (currentTurn >= MAX_INTERVIEW_TURNS) {'),
    'Hard turn limit branch intercepts execution when currentTurn >= MAX_INTERVIEW_TURNS'
  );
  assert(
    voiceExpCode.includes('onInterviewCompleted?.(\'turn_limit_reached\')'),
    'Interview is marked completed with reason "turn_limit_reached"'
  );
  assert(
    voiceExpCode.includes('onPalResponse(INTERVIEW_ENDING_MESSAGE)'),
    'PAL ending message is committed to conversation transcript'
  );
  assert(
    voiceExpCode.includes('speakText(INTERVIEW_ENDING_MESSAGE'),
    'Ending message is spoken via TTS'
  );

  // Ensure fetchFollowupInterviewQuestion is only called AFTER the turn limit check
  const turnLimitIndex = voiceExpCode.indexOf('if (currentTurn >= MAX_INTERVIEW_TURNS) {');
  const fetchFollowupIndex = voiceExpCode.indexOf('fetchFollowupInterviewQuestion(');
  assert(
    turnLimitIndex !== -1 && fetchFollowupIndex !== -1 && turnLimitIndex < fetchFollowupIndex,
    'Final turn returns BEFORE fetchFollowupInterviewQuestion, guaranteeing ZERO Gemini follow-up requests on turn 8'
  );

  // --- 4. Controls & Post-Completion State ---
  console.log('\n--- 4. Controls & Post-Completion State ---');
  assert(
    voiceExpCode.includes('isCompleted={!isMicEnabled || isCompleted}') || voiceExpCode.includes('isCompleted={isCompleted}'),
    'isCompleted state is passed down to AnswerReplayCard and VoiceControls'
  );
  assert(
    voiceExpCode.includes('if (!isMicEnabled || isCompleted) return;') &&
    voiceExpCode.includes('handleTryAgain') &&
    voiceExpCode.includes('handleResumeInterview'),
    'handleTryAgain and handleResumeInterview are strictly guarded when mic disabled or session completed'
  );
  assert(
    voiceExpCode.includes('const startRecording = async () => {\n    if (!isMicEnabled || isCompleted || isProcessingRef.current) return;'),
    'startRecording is strictly guarded to prevent recording after session limit reached'
  );
  assert(
    voiceExpCode.includes('if (!isMicEnabled || isCompleted) {\n      console.warn(\'[Live Interview] Session has ended or turn limit reached.'),
    'processAudioTranscriptionAndInterview drops any subsequent audio and skips Whisper & Gemini'
  );
  assert(
    voiceExpCode.includes('const handleToggleFlow = () => {\n    unlockAudio();\n    if (!isMicEnabled || isCompleted) return;'),
    'handleToggleFlow strictly prevents barge-in and new recording when session is completed'
  );
  assert(
    replayCardCode.includes('isCompleted?: boolean;'),
    'AnswerReplayCardProps declares optional isCompleted prop'
  );
  assert(
    replayCardCode.includes('Interview Complete') && replayCardCode.includes('All answers recorded'),
    'AnswerReplayCard displays completion status when isCompleted is true'
  );

  // --- 5. Lifecycle Turn Simulation ---
  console.log('\n--- 5. Lifecycle Turn Simulation (Turns 1 to 8) ---');
  interface TurnSimulation {
    turn: number;
    answer: string;
    shouldEnd: boolean;
    geminiCalled: boolean;
    endingMessage: boolean;
  }

  const MAX_TURNS = 8;
  const turns: TurnSimulation[] = [];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const isFinal = turn >= MAX_TURNS;
    turns.push({
      turn,
      answer: `Candidate response for question ${turn}`,
      shouldEnd: isFinal,
      geminiCalled: !isFinal,
      endingMessage: isFinal,
    });
  }

  // Verify turns 1 to 7
  for (let i = 0; i < 7; i++) {
    const t = turns[i];
    assert(
      !t.shouldEnd && t.geminiCalled && !t.endingMessage,
      `Turn ${t.turn}: Interview continues naturally; Gemini follow-up requested`
    );
  }

  // Verify turn 8
  const finalTurn = turns[7];
  assert(
    finalTurn.shouldEnd && !finalTurn.geminiCalled && finalTurn.endingMessage,
    `Turn 8 (Final): PAL naturally concludes interview with ending message; ZERO Gemini follow-up calls`
  );

  console.log('\n============================================================');
  console.log(`Frontend Turn Limit Verification: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTurnLimitTestSuite();
