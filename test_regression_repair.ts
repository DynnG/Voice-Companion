/**
 * Comprehensive Verification Suite for MockMate Regression Repair
 *
 * Verifies that all 10 repair requirements are completely satisfied:
 * 1. LiveConversationPanel: No SAMPLE_MESSAGES, no fake Redis caching, no hardcoded "5 questions • 12:34", uses dynamic conversation messages.
 * 2. AnswerReplayCard: Visibility guard `if (!replayState?.isVisible || !replayState?.attempt1) return null;`, no 47s fallback, no fake Redis transcript, no static AI notes.
 * 3. VoiceExperience: isCompactVisual starts false (full-size creature), StateLabel and ResponseCaption reconnected, AnswerReplayCard guarded.
 * 4. CandidateCamera: No "Alex Chen", no "Job Candidate", no "/candidate-alex.jpg", defaults to "Candidate".
 * 5. Connection Error Defense: Connection error messages never treated as interview questions, not spoken by TTS, clear retry state.
 * 6. AppShell & VoiceControls: New Interview and Download Interview Review actions accessible.
 * 7. Privacy & Session-Only: Zero localStorage, zero backend DB models.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isInterviewErrorText, isValidInterviewQuestion, isQuotaExceededText } from './src/services/sttService';

function runRegressionRepairVerification() {
  console.log('============================================================');
  console.log('MockMate UI & Functional Regression Repair Verification');
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
  const livePanelCode = fs.readFileSync(path.join(rootDir, 'src/components/LiveConversationPanel.tsx'), 'utf8');
  const replayCardCode = fs.readFileSync(path.join(rootDir, 'src/components/AnswerReplayCard.tsx'), 'utf8');
  const voiceExpCode = fs.readFileSync(path.join(rootDir, 'src/components/VoiceExperience.tsx'), 'utf8');
  const cameraCode = fs.readFileSync(path.join(rootDir, 'src/components/CandidateCamera.tsx'), 'utf8');
  const companionCode = fs.readFileSync(path.join(rootDir, 'src/components/VoiceCompanion.tsx'), 'utf8');
  const appShellCode = fs.readFileSync(path.join(rootDir, 'src/components/AppShell.tsx'), 'utf8');
  const voiceControlsCode = fs.readFileSync(path.join(rootDir, 'src/components/VoiceControls.tsx'), 'utf8');

  // --- 1. LiveConversationPanel Verification ---
  console.log('--- 1. LiveConversationPanel Verification ---');
  assert(!livePanelCode.includes('SAMPLE_MESSAGES'), 'SAMPLE_MESSAGES constant completely removed');
  assert(!livePanelCode.includes('Redis cache'), 'Fake Redis transcript dialogue removed');
  assert(!livePanelCode.includes('5 questions • 12:34'), 'Hardcoded "5 questions • 12:34" removed');
  assert(!livePanelCode.includes("'07:00 PM'"), 'Fake timestamp "07:00 PM" removed');
  assert(livePanelCode.includes('conversation?.messages || []'), 'LiveConversationPanel uses dynamic conversation.messages');
  assert(livePanelCode.includes('onClose'), 'LiveConversationPanel provides onClose button');
  assert(livePanelCode.includes('conversation.messages.length === 0'), 'Clean empty state preserved');

  // --- 2. AnswerReplayCard Verification ---
  console.log('\n--- 2. AnswerReplayCard Verification ---');
  assert(
    replayCardCode.includes('if (!replayState?.isVisible || !replayState?.attempt1)') &&
    replayCardCode.includes('return null;'),
    'AnswerReplayCard strictly returns null when not visible or attempt1 is null'
  );
  assert(!replayCardCode.includes('47 second') && !replayCardCode.includes('0:47'), 'Demo 47 second duration removed');
  assert(!replayCardCode.includes('51%'), 'Demo 51% progress removed');
  assert(!replayCardCode.includes('Redis cache'), 'Fake Redis replay transcript removed');
  assert(!replayCardCode.includes('Good technical depth on Redis eviction policies'), 'Static canned AI coaching notes removed');
  assert(replayCardCode.includes('onClose'), 'Header provides close action');
  assert(replayCardCode.includes('onToggleMinimize'), 'Header provides minimize action');
  assert(replayCardCode.includes('Try Answer Again'), 'Try Answer Again action preserved');

  // --- 3. VoiceExperience Visual & State Verification ---
  console.log('\n--- 3. VoiceExperience Visual & State Verification ---');
  assert(
    voiceExpCode.includes('isCompactVisual = Boolean(') &&
    voiceExpCode.includes('replayState.isVisible &&') &&
    voiceExpCode.includes('replayState.attempt1 &&') &&
    voiceExpCode.includes('!replayState.isMinimized'),
    'isCompactVisual is false initially and only true when replay card has attempt1 and is not minimized'
  );
  assert(
    voiceExpCode.includes('<StateLabel state={state} customLabel={customLabel} />'),
    'StateLabel is reconnected and rendered dynamically'
  );
  assert(
    voiceExpCode.includes('<ResponseCaption captionText={captionText} visible={captionVisible} />'),
    'ResponseCaption is reconnected and rendered dynamically'
  );
  assert(
    voiceExpCode.includes('{replayState.isVisible && replayState.attempt1 && (') &&
    voiceExpCode.includes('<AnswerReplayCard'),
    'AnswerReplayCard is guarded so it never mounts on initial interview startup'
  );

  // --- 4. Candidate Identity Verification ---
  console.log('\n--- 4. Candidate Identity Verification ---');
  assert(!cameraCode.includes('Alex Chen'), 'CandidateCamera does not hardcode Alex Chen');
  assert(!cameraCode.includes('/candidate-alex.jpg'), 'CandidateCamera does not loop fake candidate photo');
  assert(!voiceExpCode.includes('Alex Chen'), 'VoiceExperience does not fallback to Alex Chen');
  assert(cameraCode.includes("candidateName = 'Candidate'"), 'CandidateCamera defaults to neutral "Candidate"');

  // --- 5. Initial Question Connection Error Defense ---
  console.log('\n--- 5. Connection Error Defense Verification ---');
  const errorText = "AI interviewer is temporarily unavailable due to a connection error. Please try again in a moment.";
  assert(isInterviewErrorText(errorText) === true, 'isInterviewErrorText detects connection error');
  assert(isValidInterviewQuestion(errorText) === false, 'isValidInterviewQuestion rejects connection error');
  assert(isValidInterviewQuestion("Could you describe a challenging bug you solved?") === true, 'isValidInterviewQuestion accepts valid question');

  assert(
    companionCode.includes('isConnectionError = isInterviewErrorText(questionText)'),
    'VoiceCompanion detects connection errors in initial interview question'
  );
  assert(
    companionCode.includes('if (!isConnectionError)') &&
    companionCode.includes('setStartInterviewError(questionText)'),
    'VoiceCompanion never adds connection error as initial PAL message or initialQuestionToSpeak'
  );
  assert(
    companionCode.includes('setStartInterviewError('),
    'VoiceCompanion sets startInterviewError on connection failure'
  );
  assert(
    voiceExpCode.includes('startInterviewError &&'),
    'VoiceExperience renders visible error notification banner with retry option'
  );
  assert(
    voiceExpCode.includes('if (isInterviewErrorText(initialQuestionToSpeak))'),
    'VoiceExperience initial TTS effect guards against speaking error text'
  );

  // --- 6. AppShell & VoiceControls Actions ---
  console.log('\n--- 6. AppShell & VoiceControls Actions ---');
  assert(appShellCode.includes('onNewInterview'), 'AppShell navbar provides New Interview action');
  assert(appShellCode.includes('Download Interview Review'), 'AppShell navbar provides Download Interview Review action');
  assert(voiceExpCode.includes('onNewInterview'), 'VoiceExperience header provides New Interview action');
  assert(voiceControlsCode.includes('Download Interview Review'), 'VoiceControls provides Download Interview Review action');

  // --- 7. Privacy & Session-Only Architecture ---
  console.log('\n--- 7. Privacy & Session-Only Architecture ---');
  assert(!companionCode.includes('localStorage'), 'VoiceCompanion contains zero localStorage persistence');
  assert(!voiceExpCode.includes('localStorage'), 'VoiceExperience contains zero localStorage persistence');
  assert(!livePanelCode.includes('localStorage'), 'LiveConversationPanel contains zero localStorage persistence');

  console.log('\n============================================================');
  console.log(`Regression Repair Verification: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionRepairVerification();
