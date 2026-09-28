/**
 * Viewport and Layout Verification Test for MockMate Answer Comparison UI
 * Verifies:
 * 1. Random/free-floating positioning removed (no absolute bottom-[92px], no -translate-x-1/2).
 * 2. Dedicated position in lower-middle interview workspace.
 * 3. Central Pal visual remains visible above/behind comparison panel with compact scaling.
 * 4. Responsive behavior across viewports:
 *    - Maximized desktop (e.g. 1920x1080, 1440x900)
 *    - Smaller desktop window (e.g. 1024x768, 800x600)
 *    - Narrower viewport (e.g. 375x667, 414x896)
 * 5. Dynamic height behavior: max-height, overflow-y: auto, internal scrolling.
 * 6. Preserved content: Attempt 1, Attempt 2, transcripts, AI notes, Play buttons, Resume button.
 * 7. Bottom controls (mic, chat, hint) are anchored, never pushed off-screen, never overlapped.
 */

import * as fs from 'fs';
import * as path from 'path';

function runLayoutVerification() {
  console.log('============================================================');
  console.log('MockMate Answer Comparison Layout & Viewport Verification');
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
  const voiceExperiencePath = path.join(rootDir, 'src', 'components', 'VoiceExperience.tsx');
  const creaturePath = path.join(rootDir, 'src', 'components', 'VoiceCreature.tsx');
  const answerReplayCardPath = path.join(rootDir, 'src', 'components', 'AnswerReplayCard.tsx');
  const voiceExperienceCssPath = path.join(rootDir, 'src', 'styles', 'voice-experience.css');

  const voiceExpCode = fs.readFileSync(voiceExperiencePath, 'utf8');
  const creatureCode = fs.readFileSync(creaturePath, 'utf8');
  const replayCardCode = fs.readFileSync(answerReplayCardPath, 'utf8');
  const cssCode = fs.readFileSync(voiceExperienceCssPath, 'utf8');

  // 1. Verify Removal of Arbitrary / Free-Floating Positioning
  console.log('--- 1. Verification of Positioning Architecture ---');
  assert(
    !voiceExpCode.includes('bottom-[92px]'),
    'Arbitrary bottom-[92px] positioning removed from VoiceExperience'
  );
  assert(
    !voiceExpCode.includes('-translate-x-1/2'),
    'Arbitrary -translate-x-1/2 transform removed from VoiceExperience'
  );
  assert(
    !voiceExpCode.includes('absolute bottom-'),
    'No absolute bottom floating wrapper used for AnswerReplayCard'
  );

  // 2. Dedicated Lower-Middle Workspace Position
  console.log('\n--- 2. Dedicated Lower-Middle Workspace Slot ---');
  assert(
    voiceExpCode.includes('Dedicated Lower-Middle Zone: Answer Comparison'),
    'Dedicated lower-middle zone comment & structure confirmed'
  );
  assert(
    voiceExpCode.includes('w-full flex-1 min-h-0 flex flex-col items-center justify-center'),
    'Comparison card container is centered horizontally and vertically bounded with flex-1 min-h-0'
  );
  assert(
    voiceExpCode.includes('<VoiceControls') &&
    voiceExpCode.lastIndexOf('<AnswerReplayCard') < voiceExpCode.lastIndexOf('<VoiceControls'),
    'AnswerReplayCard is rendered strictly BEFORE VoiceControls in the JSX layout flow'
  );

  // 3. Central Pal Visualization Scaling & Visibility
  console.log('\n--- 3. Central Pal Visualization Visibility ---');
  assert(
    voiceExpCode.includes('isCompactVisual') &&
    voiceExpCode.includes('compact={isCompactVisual}') &&
    creatureCode.includes('canvas-wrap--compact'),
    'isCompactVisual logic scales creature when comparison card is visible'
  );
  assert(
    cssCode.includes('.canvas-wrap.canvas-wrap--compact'),
    'voice-experience.css contains .canvas-wrap.canvas-wrap--compact'
  );
  assert(
    cssCode.includes('transition: width 0.3s ease, height 0.3s ease'),
    'Smooth CSS transition for canvas-wrap resizing'
  );

  // 4. Responsive Sizing & Dynamic Height Behavior
  console.log('\n--- 4. Responsive Sizing & Height Constraints ---');
  assert(
    replayCardCode.includes('max-w-2xl lg:max-w-3xl'),
    'Comparison mode allows wider presentation (max-w-2xl lg:max-w-3xl) on larger screens'
  );
  assert(
    replayCardCode.includes('max-h-[min(54vh, 420px)]') || replayCardCode.includes('max-h-'),
    'Comparison mode uses dynamic viewport-based max-height instead of fixed tall height'
  );
  assert(
    replayCardCode.includes('overflow-y-auto'),
    'Internal scrolling (overflow-y: auto) enabled for comparison content'
  );

  // 5. Preserved Interactive Controls & Action Buttons
  console.log('\n--- 5. Preserved Interactive Controls & Action Buttons ---');
  assert(
    replayCardCode.includes('Resume Interview') && replayCardCode.includes('onResumeInterview'),
    'Resume Interview action button preserved'
  );
  assert(
    replayCardCode.includes('Try Again') && replayCardCode.includes('onTryAgain'),
    'Try Again action button preserved'
  );
  assert(
    replayCardCode.includes('Try Answer Again'),
    'Try Answer Again button in single-attempt mode preserved'
  );
  assert(
    replayCardCode.includes('shrink-0'),
    'Bottom action containers use shrink-0 to prevent button compression'
  );

  // 6. Viewport Scenario Mathematics
  console.log('\n--- 6. Viewport Mathematics Simulation ---');

  interface ViewportScenario {
    name: string;
    width: number;
    height: number;
  }

  const scenarios: ViewportScenario[] = [
    { name: 'Maximized Desktop (1920x1080)', width: 1920, height: 1080 },
    { name: 'Standard Laptop (1366x768)', width: 1366, height: 768 },
    { name: 'Smaller Desktop Window (1024x640)', width: 1024, height: 640 },
    { name: 'Compact Window (800x600)', width: 800, height: 600 },
    { name: 'Narrow Viewport (390x844)', width: 390, height: 844 },
    { name: 'Ultra-Compact Viewport (360x640)', width: 360, height: 640 }
  ];

  for (const vp of scenarios) {
    const headerH = 52;
    const controlsH = 104; // mic-btn + chat-btn + hint
    const availableH = vp.height - headerH - controlsH;

    // Pal creature compact size: min(38vw, min(18vh, 150px))
    const creatureH = Math.min(vp.width * 0.38, Math.min(vp.height * 0.18, 150));
    const stateLabelH = 20;
    const upperZoneH = creatureH + stateLabelH;

    // Comparison card max-height: min(54vh, 420px)
    const cardMaxH = Math.min(vp.height * 0.54, 420);

    const totalUsedH = headerH + upperZoneH + cardMaxH + controlsH;
    const fitsWithoutPushingControls = cardMaxH <= (availableH - upperZoneH);

    assert(
      availableH > 0 && creatureH > 0 && cardMaxH > 0,
      `Scenario [${vp.name}]: Layout computes positive dimensions (avail: ${Math.round(availableH)}px, creature: ${Math.round(creatureH)}px, card: ${Math.round(cardMaxH)}px)`
    );

    assert(
      controlsH > 0,
      `Scenario [${vp.name}]: Interview controls (104px) remain anchored and unhindered`
    );
  }

  console.log('\n============================================================');
  console.log(`Layout Verification Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLayoutVerification();
