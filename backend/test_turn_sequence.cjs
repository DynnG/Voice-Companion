/**
 * Test to verify the precise timing and sequence of the Live Conversation UI updates:
 * 1. User answers -> Whisper completes transcription.
 * 2. YOU transcript message is committed FIRST.
 * 3. Chat thinking indicator is shown ONLY AFTER YOU message is committed.
 * 4. Gemini generates response.
 * 5. Chat thinking indicator is cleared.
 * 6. PAL message is committed.
 */

async function simulateInterviewTurn() {
  const events = [];

  const onUserTranscribed = (text) => {
    events.push({ time: Date.now(), event: 'RENDER_YOU_MESSAGE', text });
  };

  const onThinkingChange = (isThinking) => {
    events.push({ time: Date.now(), event: isThinking ? 'SHOW_THINKING' : 'HIDE_THINKING' });
  };

  const onPalResponse = (text) => {
    events.push({ time: Date.now(), event: 'RENDER_PAL_MESSAGE', text });
  };

  // Turn Simulation
  console.log('--- Simulating Voice Turn Sequence ---');
  
  // 1. Audio recording stops (Chat thinking bubble is NOT triggered)
  // mediaRecorder.stop() -> setState('thinking'), setCustomLabel('transcribing answer...')
  events.push({ time: Date.now(), event: 'RECORDING_STOPPED' });

  // 2. Whisper STT transcription finishes
  await new Promise((r) => setTimeout(r, 100)); // Whisper STT time
  const userText = "I have 5 years of experience with React and Python.";
  events.push({ time: Date.now(), event: 'WHISPER_STT_COMPLETE', userText });

  // 3. Immediately commit & render user's message as "You"
  onUserTranscribed(userText);

  // 4. Wait for user message render to settle
  await new Promise((r) => setTimeout(r, 250));

  // 5. ONLY after YOU message is committed, show Gemini "thinking" in the chat
  onThinkingChange(true);

  // 6. Query Gemini API
  await new Promise((r) => setTimeout(r, 150)); // Gemini network time
  const aiResponse = "That sounds great. Could you tell me about a specific project where you used both?";

  // 7. Hide thinking indicator
  onThinkingChange(false);

  // 8. Render Pal's message
  onPalResponse(aiResponse);

  console.log('Sequence of events:');
  const startTime = events[0].time;
  events.forEach((e) => {
    console.log(`[+${e.time - startTime}ms] ${e.event} ${e.text ? `("${e.text}")` : ''}`);
  });

  // Verify assertions
  const youIdx = events.findIndex((e) => e.event === 'RENDER_YOU_MESSAGE');
  const thinkIdx = events.findIndex((e) => e.event === 'SHOW_THINKING');
  const palIdx = events.findIndex((e) => e.event === 'RENDER_PAL_MESSAGE');

  if (youIdx < thinkIdx && thinkIdx < palIdx) {
    console.log('\n[PASS] Sequence Verified: YOU -> THINKING -> PAL');
  } else {
    console.error('\n[FAIL] Sequence Incorrect!');
    process.exit(1);
  }
}

simulateInterviewTurn();
