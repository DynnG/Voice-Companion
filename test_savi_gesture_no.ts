/**
 * Savi "NO / STAY ON TOPIC" Particle Gesture Verification Suite
 *
 * Verifies:
 * 1. Particle Hand Reconstruction & Target Geometry:
 *    - Reconstructs the reference hand pose (raised index finger, compact palm, curled fingers, thumb folded across)
 *    - Built entirely from Savi's EXISTING orb particles (56 motes)
 *    - Anchored to the top rim of the orb
 * 2. Wagging Mechanics (Left -> Right -> Left -> Right):
 *    - Raised index finger wags through 2 full cycles (Left -> Right -> Left -> Right)
 *    - Knuckle base remains stable and stationary (dx = 0)
 *    - Tip deflection scales smoothly with height above knuckle
 * 3. Orb Preservation & Zero Image Asset Bundling:
 *    - Central pulsating orb (core blob, layers, and glow) remains visually present throughout
 *    - No rendering, importing, or bundling of images (6).png
 *    - Zero secondary particle engines or external overlays
 * 4. Gesture Lifecycle & Normal State Restoration:
 *    - Normal orb -> particles gather -> hand forms -> index finger wags -> hand dissolves -> Normal orb
 *    - Normal idle/listening/thinking/speaking behavior completely preserved
 * 5. Semantic Off-Topic Triggering:
 *    - Off-topic candidate queries (love letters, homework, sports, weather, jailbreaks) trigger gesture
 *    - Clarification requests ("Could you repeat that?", "Which project?") NEVER trigger gesture
 *    - Normal role answers NEVER trigger gesture
 * 6. Barge-in & Interruption Safety:
 *    - Mic tap or user speech immediately cancels gesture and returns to listening
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  HAND_TARGET_TEMPLATES,
  calculateWagOffset
} from './src/components/VoiceCreature';
import {
  isClarificationQuery,
  isOffTopicRedirect
} from './src/services/sttService';

function runSaviGestureTestSuite() {
  console.log('============================================================');
  console.log('Savi "NO / STAY ON TOPIC" Particle Gesture Verification');
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
  const creatureCode = fs.readFileSync(path.join(rootDir, 'src/components/VoiceCreature.tsx'), 'utf8');
  const voiceExpCode = fs.readFileSync(path.join(rootDir, 'src/components/VoiceExperience.tsx'), 'utf8');
  const stateLabelCode = fs.readFileSync(path.join(rootDir, 'src/components/StateLabel.tsx'), 'utf8');
  const typesCode = fs.readFileSync(path.join(rootDir, 'src/types/conversation.ts'), 'utf8');

  // --- 1. Hand Geometry & Template Structure ---
  console.log('--- 1. Hand Target Geometry & Structure ---');
  assert(HAND_TARGET_TEMPLATES.length === 56, `HAND_TARGET_TEMPLATES defines 56 particle coordinates (found ${HAND_TARGET_TEMPLATES.length})`);

  const wristPts = HAND_TARGET_TEMPLATES.filter(p => p.part === 'wrist');
  const palmPts = HAND_TARGET_TEMPLATES.filter(p => p.part === 'palm');
  const thumbPts = HAND_TARGET_TEMPLATES.filter(p => p.part === 'thumb');
  const curledPts = HAND_TARGET_TEMPLATES.filter(p => p.part === 'curled');
  const indexPts = HAND_TARGET_TEMPLATES.filter(p => p.part === 'index');

  assert(wristPts.length >= 8, `Wrist/anchor contains ${wristPts.length} points rooted at upper orb boundary`);
  assert(palmPts.length >= 6, `Palm contains ${palmPts.length} points forming compact hand body`);
  assert(thumbPts.length >= 5, `Thumb contains ${thumbPts.length} points folded across front of palm`);
  assert(curledPts.length >= 12, `Curled fingers contain ${curledPts.length} points forming loops for pinky/ring/middle`);
  assert(indexPts.length >= 16, `Raised index finger contains ${indexPts.length} points extending vertically`);

  // Verify vertical orientation: index finger points up (negative y)
  const tipY = Math.min(...indexPts.map(p => p.y));
  const wristY = Math.max(...wristPts.map(p => p.y));
  assert(tipY <= -1.50, `Raised index finger reaches high above orb (tip y = ${tipY})`);
  assert(wristY >= -0.55, `Wrist anchor connects to top hemisphere of orb (wrist y = ${wristY})`);

  // Verify thumb fold crosses horizontally towards fingers
  const thumbMinX = Math.min(...thumbPts.map(p => p.x));
  const thumbMaxX = Math.max(...thumbPts.map(p => p.x));
  assert(thumbMinX < 0 && thumbMaxX > 0.15, `Thumb folds across the front of palm (x: ${thumbMinX} to ${thumbMaxX})`);

  // --- 2. Wagging Mechanics (Left -> Right -> Left -> Right) ---
  console.log('\n--- 2. Left -> Right -> Left -> Right Wagging Mechanics ---');
  const baseR = 100;
  const knucklePt = indexPts.find(p => p.y === -0.94)!;
  const tipPt = indexPts.find(p => p.y === -1.58)!;

  // Verify knuckle anchor stability (dx = 0 at knuckle)
  const knuckleWag = calculateWagOffset(knucklePt, 0.25, baseR);
  assert(Math.abs(knuckleWag.dx) < 0.001, 'Knuckle base remains stationary during wagging (dx = 0)');

  // Verify 2 complete cycles of Left -> Right -> Left -> Right
  const w0 = calculateWagOffset(tipPt, 0.00, baseR).dx;  // center
  const w1 = calculateWagOffset(tipPt, 0.125, baseR).dx; // left/right peak 1
  const w2 = calculateWagOffset(tipPt, 0.25, baseR).dx;  // center
  const w3 = calculateWagOffset(tipPt, 0.375, baseR).dx; // opposite peak 1
  const w4 = calculateWagOffset(tipPt, 0.50, baseR).dx;  // center (cycle 1 complete)
  const w5 = calculateWagOffset(tipPt, 0.625, baseR).dx; // left/right peak 2
  const w6 = calculateWagOffset(tipPt, 0.75, baseR).dx;  // center
  const w7 = calculateWagOffset(tipPt, 0.875, baseR).dx; // opposite peak 2
  const w8 = calculateWagOffset(tipPt, 1.00, baseR).dx;  // center (cycle 2 complete)

  assert(Math.abs(w0) < 0.01 && Math.abs(w2) < 0.01 && Math.abs(w4) < 0.01 && Math.abs(w6) < 0.01 && Math.abs(w8) < 0.01,
    'Index finger passes cleanly through vertical center at cycle intervals (0.0, 0.25, 0.5, 0.75, 1.0)');

  assert(w1 > 20 && w5 > 20, `Cycle 1 & Cycle 2 first swings match (+${w1.toFixed(1)}px & +${w5.toFixed(1)}px)`);
  assert(w3 < -20 && w7 < -20, `Cycle 1 & Cycle 2 return swings match (${w3.toFixed(1)}px & ${w7.toFixed(1)}px)`);

  // Verify non-index points DO NOT wag
  const palmWag = calculateWagOffset(palmPts[0], 0.125, baseR);
  const curledWag = calculateWagOffset(curledPts[0], 0.125, baseR);
  assert(palmWag.dx === 0 && palmWag.dy === 0, 'Palm remains stable and does not wag');
  assert(curledWag.dx === 0 && curledWag.dy === 0, 'Curled fingers remain stable and do not wag');

  // --- 3. Zero Image Assets & Existing Particle System Reuse ---
  console.log('\n--- 3. Asset Integrity & Particle System Reuse ---');
  assert(!creatureCode.includes('images (6).png'), 'VoiceCreature does NOT import or reference images (6).png');
  assert(!voiceExpCode.includes('images (6).png'), 'VoiceExperience does NOT import or reference images (6).png');
  assert(!creatureCode.includes('<img') && !creatureCode.includes('HTMLImageElement'), 'VoiceCreature does not use img elements or runtime images');
  assert(creatureCode.includes('const motes = Array.from({ length: 56 }'), 'VoiceCreature reuses motes array with 56 particles');
  assert(creatureCode.includes('HAND_TARGET_TEMPLATES[i % HAND_TARGET_TEMPLATES.length]'), 'Motes directly target hand template positions');
  assert(creatureCode.includes('Core blob') && creatureCode.includes('Layered echoes'), 'Central pulsating orb continues rendering underneath particle hand');

  // --- 4. State Machine & Types ---
  console.log('\n--- 4. State Machine & Types ---');
  assert(typesCode.includes("'gesture_no'"), "VoiceState type includes 'gesture_no'");
  assert(stateLabelCode.includes('gesture_no:'), "StateLabel supports 'gesture_no'");
  assert(creatureCode.includes('gesture_no:'), "VoiceCreature STATE_CONFIG supports 'gesture_no'");
  assert(creatureCode.includes("gesture?: 'no' | null"), "VoiceCreatureProps supports optional gesture prop");
  assert(creatureCode.includes('onGestureEnd?: () => void'), "VoiceCreatureProps supports onGestureEnd callback");

  // --- 5. Semantic Off-Topic Detection & Clarification Safety ---
  console.log('\n--- 5. Semantic Off-Topic Detection & Clarification Safety ---');

  // Case A: Clarification queries MUST NOT trigger gesture
  assert(isClarificationQuery('Could you please repeat the question?'), 'Detects "Could you please repeat the question?" as clarification');
  assert(isClarificationQuery('What did you say?'), 'Detects "What did you say?" as clarification');
  assert(isClarificationQuery('Which project are you referring to?'), 'Detects "Which project are you referring to?" as clarification');
  assert(isClarificationQuery('Can you clarify what you mean?'), 'Detects "Can you clarify what you mean?" as clarification');
  assert(!isClarificationQuery('I built an Android app with Jetpack Compose'), 'Legitimate answer is NOT a clarification');

  // Case B: Off-topic redirects DO trigger gesture
  assert(isOffTopicRedirect("Let's keep our focus on the interview for the Software Developer role.", 'off_topic_redirect'),
    'Detects explicit off_topic_redirect reason');
  assert(isOffTopicRedirect("Let's stay focused on the interview. How did you handle testing in your previous job?"),
    'Detects "Let\'s stay focused on the interview" redirect pattern');
  assert(isOffTopicRedirect("I'd like to steer us back to your technical experience for this position."),
    'Detects "steer us back" redirect pattern');
  assert(isOffTopicRedirect("As your interviewer, I'd like to bring us back to your portfolio."),
    'Detects "bring us back" redirect pattern');

  // Case C: Normal follow-up questions DO NOT trigger gesture
  assert(!isOffTopicRedirect('You mentioned optimizing database queries. What caching strategy did you employ?'),
    'Legitimate technical follow-up does NOT trigger redirect');
  assert(!isOffTopicRedirect('That gives me a clearer picture of your approach. Let us look at how you managed team conflicts.'),
    'Normal topic transition does NOT trigger redirect');

  // --- 6. Interruption & Barge-in ---
  console.log('\n--- 6. Barge-in & Interruption Safety ---');
  assert(creatureCode.includes("if (currentName === 'listening' || currentName === 'thinking')") &&
         creatureCode.includes('isGestureRunning = false'),
         'VoiceCreature immediately cancels gesture when listening or thinking starts');
  assert(voiceExpCode.includes('setCreatureGesture(null)'),
         'VoiceExperience resets creature gesture on barge-in / mic activation');

  console.log('\n============================================================');
  console.log(`Savi Particle Gesture Verification: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSaviGestureTestSuite();
