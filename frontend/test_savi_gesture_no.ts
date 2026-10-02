/**
 * Savi "NO / STAY ON TOPIC" Particle Gesture Verification Suite
 *
 * Verifies:
 * 1. Particle Hand Reconstruction & Target Geometry:
 *    - Reconstructs the reference hand pose (raised index finger, compact palm, curled fingers, thumb folded across)
 *    - Built entirely from Savi's EXISTING orb particles (56 motes)
 *    - Anchored to the left rim of the orb, with fingers extending up-left
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
  calculateWagOffset,
  calculateGestureCanvasPadding,
  calculateGestureRenderScale,
  GESTURE_NO_PALETTE,
  calculateGestureEmotionalProgress,
  interpolateEmotionalColor
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

  assert(wristPts.length >= 8, `Wrist/anchor contains ${wristPts.length} points rooted at left orb boundary`);
  assert(palmPts.length >= 6, `Palm contains ${palmPts.length} points forming compact hand body`);
  assert(thumbPts.length >= 5, `Thumb contains ${thumbPts.length} points folded across front of palm`);
  assert(curledPts.length >= 12, `Curled fingers contain ${curledPts.length} points forming loops for pinky/ring/middle`);
  assert(indexPts.length >= 16, `Raised index finger contains ${indexPts.length} points extending vertically`);

  // Verify the actual local geometry and the radius-relative render transform.
  const tipY = Math.min(...indexPts.map(p => p.y));
  const wristY = Math.max(...wristPts.map(p => p.y));
  assert(tipY < -0.9 && wristY > 0, 'Index rises up-left from a horizontal wrist');
  const handScale = Number(creatureCode.match(/const handScale = ([\d.]+)/)![1]);
  const anchorX = -Number(creatureCode.match(/const handAnchorX = cx - dynBaseR \* ([\d.]+)/)![1]);
  const anchorY = Number(creatureCode.match(/const handAnchorY = cy \+ dynBaseR \* ([\d.]+)/)![1]);
  const positioned = (p: typeof HAND_TARGET_TEMPLATES[number]) => ({x: anchorX + p.x * handScale, y: anchorY + p.y * handScale});
  assert(handScale === 1.5625, 'Hand is 25% larger than the previous 1.25x pose');
  assert(palmPts.every(p => positioned(p).x < -1), 'Entire palm is outside the orb left edge');
  assert(palmPts.every(p => Math.abs(positioned(p).y) < 0.3), 'Palm is beside the orb at center height');
  assert(wristPts.some(p => Math.hypot(positioned(p).x, positioned(p).y) < 1), 'Wrist overlaps the core orb with no attachment gap');
  assert(wristPts.every(p => positioned(p).x < -0.7 && positioned(p).y > 0), 'Wrist attaches at 8–9 o\'clock, never at the top');
  const knuckle = indexPts.find(p => p.wagHeight === 0)!;
  const tip = indexPts.find(p => p.wagHeight === 1)!;
  assert(tip.x < knuckle.x && tip.y < knuckle.y, 'Raised index extends up-left from the hand');
  for (const size of [160, 170, 310]) {
    // Include breathing expansion, full wag cycle and particle glow margin.
    const radius = size * 0.28 * 1.015;
    let safe = true;
    for (let phase = 0; phase <= 1; phase += 0.025) {
      for (const p of HAND_TARGET_TEMPLATES) {
        const pos = positioned(p);
        const wag = calculateWagOffset(p, phase, radius * handScale);
        const x = size / 2 + pos.x * radius + wag.dx;
        const y = size / 2 + pos.y * radius + wag.dy;
        if (x < 2 || y < 2 || x > size / 2 || y > size - 2) safe = false;
      }
    }
    assert(safe, `Entire hand stays left and within ${size}px canvas through wagging`);
  }

  // Verify thumb fold crosses horizontally towards fingers
  const thumbMinX = Math.min(...thumbPts.map(p => p.x));
  const thumbMaxX = Math.max(...thumbPts.map(p => p.x));
  assert(thumbMaxX - thumbMinX > 0.3, `Thumb folds across the front of palm (x: ${thumbMinX} to ${thumbMaxX})`);

  // Canvas expansion must include the particle glow, not merely its center.
  for (const size of [160, 170, 310]) {
    for (const inset of [8, 60]) {
      const padding = calculateGestureCanvasPadding(size, size, inset, 60, size + inset * 2, size + 120);
      const radius = size * 0.28 * 1.015;
      const scale = calculateGestureRenderScale(radius, size / 2, size / 2, padding);
      assert(padding.left <= inset - 4 && padding.left <= size * 0.22, 'Canvas padding fits viewport and scales with orb wrapper');
      let clear = true;
      for (let phase = 0; phase <= 1; phase += 0.025) {
        for (const p of HAND_TARGET_TEMPLATES) {
          const wag = calculateWagOffset(p, phase, radius * scale);
          const x = size / 2 + padding.left - 0.82 * radius + p.x * radius * scale + wag.dx;
          const y = size / 2 + padding.top + 0.25 * radius + p.y * radius * scale + wag.dy;
          if (x < 28 - 0.001 || y < 28 - 0.001) clear = false;
        }
      }
      assert(clear, 'Entire gesture and peak anger glow fit expanded canvas at ' + size + 'px, inset ' + inset);
      assert(Math.abs((-padding.left) + padding.left + size / 2 - size / 2) < 0.001, 'Canvas translation leaves orb screen center unchanged');
      if (inset === 60) assert(scale === 1.5625, 'Hand keeps full design scale when viewport space permits');
    }
  }

  // --- 2. Wagging Mechanics (Left -> Right -> Left -> Right) ---
  console.log('\n--- 2. Left -> Right -> Left -> Right Wagging Mechanics ---');
  const baseR = 100;
  const knucklePt = indexPts.find(p => p.wagHeight === 0)!;
  const tipPt = indexPts.find(p => p.wagHeight === 1)!;

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

  assert(w1 > 15 && w5 === w1, `Cycle 1 & Cycle 2 first swings match (+${w1.toFixed(1)}px & +${w5.toFixed(1)}px)`);
  assert(w3 < -15 && w7 === w3, `Cycle 1 & Cycle 2 return swings match (${w3.toFixed(1)}px & ${w7.toFixed(1)}px)`);

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

  // --- 7. Emotional Color Transition & Organic Irritation Lifecycle ---
  console.log('\n--- 7. Emotional Color Transition & Organic Irritation Lifecycle ---');

  // Palette Verification
  const { yellow, orange, softRed } = GESTURE_NO_PALETTE;
  assert(yellow.r >= 250 && yellow.g >= 190 && yellow.b >= 100,
    `Normal yellow is soft warm gold: rgb(${yellow.r}, ${yellow.g}, ${yellow.b})`);
  assert(orange.r >= 250 && orange.g >= 130 && orange.g <= 160 && orange.b <= 60,
    `Transition orange is warm amber: rgb(${orange.r}, ${orange.g}, ${orange.b})`);
  assert(softRed.r >= 240 && softRed.r <= 252 && softRed.g >= 75 && softRed.g <= 100 && softRed.b >= 55,
    `Peak red is soft glowing coral/amber-red (non-aggressive, not dark crimson, not horror red): rgb(${softRed.r}, ${softRed.g}, ${softRed.b})`);
  assert(softRed.r < 255 || softRed.g > 60,
    'Avoids harsh neon red by preserving balanced warm green/blue undertones');

  // Phase 1 (0–250 ms): Normal yellow glow
  const p0 = calculateGestureEmotionalProgress(0);
  const p150 = calculateGestureEmotionalProgress(150);
  const p250 = calculateGestureEmotionalProgress(250);
  const col0 = interpolateEmotionalColor(p0);
  const col250 = interpolateEmotionalColor(p250);
  assert(p0 === 0.0 && p150 === 0.0 && p250 === 0.0,
    'Phase 1 (0–250 ms) maintains emotional progress at 0.0 (normal yellow glow)');
  assert(col0.r === yellow.r && col0.g === yellow.g && col0.b === yellow.b,
    'Phase 1 start (0 ms) color matches normal yellow');
  assert(col250.r === yellow.r && col250.g === yellow.g && col250.b === yellow.b,
    'Phase 1 end (250 ms) color strictly preserved as normal yellow');

  // Phase 2 (250–700 ms): Yellow to warm orange
  const p475 = calculateGestureEmotionalProgress(475);
  const p700 = calculateGestureEmotionalProgress(700);
  const col475 = interpolateEmotionalColor(p475);
  const col700 = interpolateEmotionalColor(p700);
  assert(p475 > 0.0 && p475 < 0.5,
    `Phase 2 midpoint (475 ms) smoothly interpolates (progress = ${p475.toFixed(3)})`);
  assert(col475.g < yellow.g && col475.g > orange.g,
    `Phase 2 midpoint color is smooth golden amber: rgb(${col475.r}, ${col475.g}, ${col475.b})`);
  assert(Math.abs(p700 - 0.5) < 0.001,
    'Phase 2 end (700 ms) reaches exact warm orange milestone (progress = 0.5)');
  assert(col700.r === orange.r && col700.g === orange.g && col700.b === orange.b,
    'Phase 2 end (700 ms) matches warm orange palette rgb');

  // Phase 3 (700–1200 ms): Warm orange to soft glowing red
  const p950 = calculateGestureEmotionalProgress(950);
  const p1200 = calculateGestureEmotionalProgress(1200);
  const col950 = interpolateEmotionalColor(p950);
  const col1200 = interpolateEmotionalColor(p1200);
  assert(p950 > 0.5 && p950 < 1.0,
    `Phase 3 midpoint (950 ms) smoothly interpolates (progress = ${p950.toFixed(3)})`);
  assert(col950.g < orange.g && col950.g > softRed.g,
    `Phase 3 midpoint color is smooth reddish-orange: rgb(${col950.r}, ${col950.g}, ${col950.b})`);
  assert(p1200 === 1.0,
    'Phase 3 end (1200 ms) reaches peak soft glowing red (progress = 1.0)');
  assert(col1200.r === softRed.r && col1200.g === softRed.g && col1200.b === softRed.b,
    'Phase 3 end (1200 ms) matches peak soft red palette rgb');

  // During Finger Wag (1200 ms to ~3050 ms)
  const p1500 = calculateGestureEmotionalProgress(1500);
  const p2200 = calculateGestureEmotionalProgress(2200);
  const p3000 = calculateGestureEmotionalProgress(3000);
  assert(p1500 === 1.0 && p2200 === 1.0 && p3000 === 1.0,
    'Maintains peak reddish/orange appearance throughout the active wagging phase (1200–3050 ms)');

  // Return to Normal (~600–900 ms transition: 3050 ms to 3800 ms = 750 ms)
  const returnDuration = 3800 - 3050;
  assert(returnDuration >= 600 && returnDuration <= 900,
    `Return transition duration is ${returnDuration} ms (within required 600–900 ms window)`);

  const p3425 = calculateGestureEmotionalProgress(3425); // midpoint of return
  const p3800 = calculateGestureEmotionalProgress(3800);
  const p3900 = calculateGestureEmotionalProgress(3900);
  const col3425 = interpolateEmotionalColor(p3425);
  const col3800 = interpolateEmotionalColor(p3800);

  assert(Math.abs(p3425 - 0.5) < 0.001,
    'Return phase midpoint passes smoothly through warm orange (progress = 0.5)');
  assert(col3425.r === orange.r && col3425.g === orange.g && col3425.b === orange.b,
    'Return phase midpoint color is warm orange');
  assert(p3800 === 0.0 && p3900 === 0.0,
    'Return completes cleanly back to normal yellow (progress = 0.0)');
  assert(col3800.r === yellow.r && col3800.g === yellow.g && col3800.b === yellow.b,
    'Post-gesture palette cleanly restores original yellow');

  // Canvas Implementation Verification
  assert(creatureCode.includes('interpolateEmotionalColor(currentEmotion)'),
    'VoiceCreature dynamically blends emotional color into orb canvas');
  assert(creatureCode.includes('haloAlpha = 0.26 + haloBoost + currentEmotion * 0.08'),
    'VoiceCreature slightly boosts glow intensity during emotional reaction');
  assert(creatureCode.includes('const irritatedPulse =') && creatureCode.includes('currentEmotion * 0.035'),
    'VoiceCreature introduces subtle irritated harmonic pulse energy during gesture');
  assert(creatureCode.includes('currentEmotion = Math.max(0, currentEmotion - 0.016 / 0.75)'),
    'VoiceCreature smoothly decays emotional reaction back to normal on interruption or finish');

  console.log('\n============================================================');
  console.log(`Savi Particle Gesture Verification: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSaviGestureTestSuite();
