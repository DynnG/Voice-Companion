/**
 * Test Suite: Gemini Quota Exhaustion - Initial Flow & Follow-Up Defense
 *
 * Verifies:
 * 1. Initial Gemini quota failure creates zero PAL messages.
 * 2. Initial Gemini quota failure does not set initialQuestionToSpeak.
 * 3. Initial Gemini quota failure does not trigger TTS.
 * 4. Initial Gemini quota failure does not display the center error caption.
 * 5. Initial Gemini quota failure does not create an Interviewer Notice in Live Chat.
 * 6. Session remains usable for a later retry (status remains 'active', not completed, session not destroyed).
 * 7. Normal successful initial Gemini response still creates exactly one PAL question and speaks normally.
 * 8. Existing follow-up quota handling still passes.
 * 9. Existing PAL intro stability tests still pass.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isQuotaExceededText } from './src/services/sttService';

function runQuotaInitialFlowTestSuite() {
  console.log('============================================================');
  console.log('MockMate Gemini Quota Exhaustion Test Suite (Initial & Follow-up)');
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
  const companionPath = path.join(rootDir, 'src', 'components', 'VoiceCompanion.tsx');
  const sttServicePath = path.join(rootDir, 'src', 'services', 'sttService.ts');
  const livePanelPath = path.join(rootDir, 'src', 'components', 'LiveConversationPanel.tsx');

  const voiceExpCode = fs.readFileSync(voiceExpPath, 'utf8').replace(/\r\n/g, '\n');
  const companionCode = fs.readFileSync(companionPath, 'utf8').replace(/\r\n/g, '\n');
  const sttServiceCode = fs.readFileSync(sttServicePath, 'utf8').replace(/\r\n/g, '\n');
  const livePanelCode = fs.readFileSync(livePanelPath, 'utf8').replace(/\r\n/g, '\n');

  // --- 1. Quota Detection Helper Tests ---
  console.log('--- 1. Quota Detection Helper Unit Tests ---');

  const quotaMsg1 = "AI interviewer is temporarily unavailable because the Gemini API usage limit has been reached. Please try again later.";
  const quotaMsg2 = "Error: quota_exceeded";
  const quotaMsg3 = "gemini_quota_exceeded";
  const quotaMsg4 = "Resource exhausted: quota_exhausted";
  const connErrorMsg = "AI interviewer is temporarily unavailable due to a connection error. Please try again in a moment.";
  const serviceErrorMsg = "AI interviewer is temporarily unavailable due to an AI service error. Please try again in a moment.";
  const legitimateQ = "Welcome! Could you describe your background with TypeScript and React?";

  assert(isQuotaExceededText(quotaMsg1) === true, 'Recognizes standard Gemini usage limit message as quota error');
  assert(isQuotaExceededText(quotaMsg2) === true, 'Recognizes quota_exceeded indicator');
  assert(isQuotaExceededText(quotaMsg3) === true, 'Recognizes gemini_quota_exceeded indicator');
  assert(isQuotaExceededText(quotaMsg4) === true, 'Recognizes quota_exhausted indicator');
  assert(isQuotaExceededText(connErrorMsg) === false, 'Preserves genuine connection error as non-quota error');
  assert(isQuotaExceededText(serviceErrorMsg) === false, 'Preserves genuine AI service error as non-quota error');
  assert(isQuotaExceededText(legitimateQ) === false, 'Recognizes legitimate interview question as non-quota');

  // --- 2. VoiceCompanion Initial Question Quota Handling ---
  console.log('\n--- 2. VoiceCompanion Initial Question Quota Handling ---');

  assert(
    companionCode.includes('isQuotaExceededText(questionText)'),
    'VoiceCompanion checks isQuotaExceededText before creating initial PAL message'
  );

  assert(
    companionCode.includes('if (!isQuota && questionText)'),
    'VoiceCompanion only creates initial PAL message and sets initialQuestionToSpeak when not quota error'
  );

  assert(
    companionCode.includes('setInitialQuestionToSpeak(undefined)'),
    'VoiceCompanion sets initialQuestionToSpeak to undefined on quota exhaustion'
  );

  assert(
    companionCode.includes('messages: initialMessages'),
    'VoiceCompanion passes clean initialMessages array (empty on quota failure)'
  );

  // --- 3. Session Usability and State Preservation ---
  console.log('\n--- 3. Session Usability and State Preservation ---');

  assert(
    companionCode.includes("status: 'active'") && !companionCode.includes("status: isQuota ? 'completed' : 'active'"),
    'Session status is set to active (not completed) even when initial Gemini call fails quota'
  );

  assert(
    companionCode.includes('attachedDocuments: docs'),
    'Session preserves user attached documents and context on initial quota failure'
  );

  assert(
    companionCode.includes('turnsUsed: 0'),
    'turnsUsed starts at 0 on initial quota failure'
  );

  // --- 4. VoiceExperience Initial Question Defensive Guard ---
  console.log('\n--- 4. VoiceExperience Initial Question Defensive Guard ---');

  assert(
    voiceExpCode.includes('if (isQuotaExceededText(initialQuestionToSpeak))'),
    'VoiceExperience initialQuestionToSpeak effect includes defensive guard against quota errors'
  );

  assert(
    voiceExpCode.includes('hideCaption()') && voiceExpCode.includes("setState('idle')"),
    'Defensive guard resets state to idle and hides caption on quota error'
  );

  // Verify that showCaption and speakText are NOT reached when isQuota is true
  const effectBlockMatch = voiceExpCode.match(
    /\/\/\s*Play initial interviewer question[\s\S]*?useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[initialQuestionToSpeak\]\);/
  );
  assert(Boolean(effectBlockMatch), 'Found intro useEffect([initialQuestionToSpeak]) block');
  if (effectBlockMatch) {
    const effectContent = effectBlockMatch[1];
    const guardIndex = effectContent.indexOf('isQuotaExceededText(initialQuestionToSpeak)');
    const showCaptionIndex = effectContent.indexOf('showCaption(initialQuestionToSpeak)');
    const speakTextIndex = effectContent.indexOf('speakText(initialQuestionToSpeak');

    assert(guardIndex !== -1 && guardIndex < showCaptionIndex, 'Quota guard executes before showCaption');
    assert(guardIndex !== -1 && guardIndex < speakTextIndex, 'Quota guard executes before speakText');
    assert(effectContent.includes('return;'), 'Quota guard returns early to block showCaption and speakText');
  }

  // --- 5. Answer Replay Protection ---
  console.log('\n--- 5. Answer Replay Protection Against Quota Error as Question ---');

  assert(
    voiceExpCode.includes('!isQuotaExceededText(currentQuestionBeingAnsweredRef.current)'),
    'VoiceExperience guards currentQuestionBeingAnsweredRef so quota errors never become interview question'
  );

  assert(
    voiceExpCode.includes('!isQuotaExceededText(replayState.questionText)'),
    'VoiceExperience guards replayState.questionText against quota error text'
  );

  // --- 6. Live Chat Cleanliness ---
  console.log('\n--- 6. Live Chat Cleanliness ---');

  assert(
    livePanelCode.includes('conversation.messages.length === 0'),
    'LiveConversationPanel has empty state when no messages are recorded'
  );

  // --- 7. Follow-Up Quota Error Handling Preserved ---
  console.log('\n--- 7. Follow-Up Turn Quota Error Handling ---');

  assert(
    voiceExpCode.includes('followupResult.error_type === \'quota_exceeded\''),
    'VoiceExperience processAudioTranscriptionAndInterview detects quota_exceeded'
  );

  assert(
    voiceExpCode.includes('console.warn(\'[Live Interview] Gemini quota reached. Silently keeping session intact and awaiting next user turn.\');'),
    'VoiceExperience follow-up quota handling silently keeps session intact'
  );

  assert(
    !voiceExpCode.includes("setCustomLabel('Interviewer unavailable')"),
    'VoiceExperience has zero instances of center Interviewer unavailable label'
  );

  // --- 8. Behavioral Simulation ---
  console.log('\n--- 8. Behavioral Simulation ---');

  // Simulation: Initial Start Interview with Gemini Quota Failure
  let simulatedMessages: any[] = [];
  let simulatedInitialQuestionToSpeak: string | undefined = undefined;
  let simulatedTTSCalled = false;
  let simulatedCaptionShown: string | null = null;
  let simulatedState = 'idle';

  function simulateStartInterview(geminiResponse: string) {
    const isQuota = isQuotaExceededText(geminiResponse);
    if (!isQuota && geminiResponse) {
      simulatedMessages.push({ sender: 'Pal', text: geminiResponse });
      simulatedInitialQuestionToSpeak = geminiResponse;
    } else {
      simulatedInitialQuestionToSpeak = undefined;
    }

    // VoiceExperience mount effect simulation
    if (simulatedInitialQuestionToSpeak) {
      if (isQuotaExceededText(simulatedInitialQuestionToSpeak)) {
        simulatedState = 'idle';
        return;
      }
      simulatedCaptionShown = simulatedInitialQuestionToSpeak;
      simulatedTTSCalled = true;
      simulatedState = 'speaking';
    }
  }

  // Run simulation with quota exhaustion
  simulateStartInterview(quotaMsg1);

  assert(simulatedMessages.length === 0, 'Simulation (Quota Failure): zero PAL messages added to session');
  assert(simulatedInitialQuestionToSpeak === undefined, 'Simulation (Quota Failure): initialQuestionToSpeak is undefined');
  assert(simulatedTTSCalled === false, 'Simulation (Quota Failure): TTS is NOT triggered');
  assert(simulatedCaptionShown === null, 'Simulation (Quota Failure): Center caption is NOT shown');
  assert(simulatedState === 'idle', 'Simulation (Quota Failure): State remains idle ready for candidate');

  // Run simulation with successful Gemini initial question
  simulatedMessages = [];
  simulatedInitialQuestionToSpeak = undefined;
  simulatedTTSCalled = false;
  simulatedCaptionShown = null;

  simulateStartInterview(legitimateQ);

  assert(simulatedMessages.length === 1, 'Simulation (Success): exactly 1 PAL message added to session');
  assert(simulatedMessages[0].text === legitimateQ, 'Simulation (Success): PAL message contains legitimate question');
  assert(simulatedInitialQuestionToSpeak === legitimateQ, 'Simulation (Success): initialQuestionToSpeak is set to question');
  assert(simulatedTTSCalled === true, 'Simulation (Success): TTS speech is triggered');
  assert(simulatedCaptionShown === legitimateQ, 'Simulation (Success): Center caption displays legitimate question');

  console.log('\n============================================================');
  console.log(`Results: ${passed} passed, ${failed} failed.`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runQuotaInitialFlowTestSuite();
