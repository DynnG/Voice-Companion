export interface VisualPoint { x: number; y: number; z: number; visibility?: number }
export type CameraIssue = 'dark' | 'bright' | 'close' | 'far' | 'framing';
export const cameraGuidance: Record<CameraIssue, string> = {
  dark: 'It’s too dark for visual analysis. Add light in front of you so your face and shoulders are clear.',
  bright: 'The camera image is too bright. Reduce direct light or move away from the bright window.',
  close: 'Move back a little so your head and shoulders fit in view.',
  far: 'Move a little closer so your face is easier to see.',
  framing: 'Keep your face and shoulders clearly in view. Check that your camera is uncovered and you are centered.',
};
export interface VisualSample {
  timestamp: number;
  facing: boolean | null;
  positioned: boolean | null;
  head: [number, number] | null;
  wrists: [number, number][];
  hands?: { side: 'left' | 'right'; point: [number, number] }[];
  handTracking?: 'dedicated' | 'pose';
  shoulderCenter?: number;
  shoulderTilt?: number;
  shoulderY?: number;
  eyeTrackingAvailable?: boolean;
  eyePosition?: [number, number] | null;

  distance: 'close' | 'far' | null;
  issue?: CameraIssue | null;
}
export const visualDimensions = ['Camera Engagement', 'Posture & Positioning', 'Facial / Head Movement', 'Gesture Control'];

// Iris position relative to the eye opening, not absolute screen coordinates.
// Closed eyes, small faces, and disagreement between the eyes are rejected.
export function measureEyePosition(points: VisualPoint[]): [number, number] | null {
  const eye = (cornerA: number, cornerB: number, upper: number, lower: number, iris: number): [number, number] | null => {
    const [a, b, top, bottom, pupil] = [points[cornerA], points[cornerB], points[upper], points[lower], points[iris]];
    if (![a, b, top, bottom, pupil].every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
    const dx = b.x - a.x, dy = b.y - a.y, width = Math.hypot(dx, dy);
    if (width < 0.018) return null;
    const ux = dx / width, uy = dy / width;
    const opening = (bottom.x - top.x) * -uy + (bottom.y - top.y) * ux;
    if (opening / width < 0.12) return null;
    const horizontal = ((pupil.x - a.x) * ux + (pupil.y - a.y) * uy) / width;
    const vertical = ((pupil.x - top.x) * -uy + (pupil.y - top.y) * ux) / opening;
    return horizontal >= 0 && horizontal <= 1 && vertical >= -0.2 && vertical <= 1.2 ? [horizontal, vertical] : null;
  };
  const left = eye(33, 133, 159, 145, 468), right = eye(362, 263, 386, 374, 473);
  if (!left || !right || Math.abs(left[0] - right[0]) > 0.18 || Math.abs(left[1] - right[1]) > 0.25) return null;
  return [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
}

// Conservative motion heuristic, not a reading classifier or calibrated gaze point.
export function hasReadingLikePattern(samples: VisualSample[]): boolean {
  let window: VisualSample[] = [];
  const matches = (observations: VisualSample[]) => {
    if (observations.length < 20 || observations[observations.length - 1].timestamp - observations[0].timestamp < 8000) return false;
    const eyeX = observations.map(sample => sample.eyePosition![0]);
    const headX = observations.map(sample => sample.head![0]);
    const headY = observations.map(sample => sample.head![1]);
    if (Math.max(...eyeX) - Math.min(...eyeX) < 0.13 ||
        Math.max(...headX) - Math.min(...headX) > 0.2 || Math.max(...headY) - Math.min(...headY) > 0.2 ||
        observations.filter(sample => sample.eyePosition![1] > 0.65).length < observations.length * 0.7) return false;
    let anchor = eyeX[0], direction = 0, reversals = 0;
    for (const x of eyeX.slice(1)) {
      const delta = x - anchor;
      if (Math.abs(delta) < 0.05) continue;
      const next = Math.sign(delta);
      if (direction && next !== direction) reversals++;
      direction = next; anchor = x;
    }
    return reversals >= 4;
  };
  for (const sample of samples) {
    if (sample.issue || sample.distance || !sample.facing || !sample.head || !sample.eyePosition || sample.eyeTrackingAvailable === false ||
        (window.length && sample.timestamp - window[window.length - 1].timestamp > 1200)) {
      window = [];
    }
    if (!sample.issue && !sample.distance && sample.facing && sample.head && sample.eyePosition && sample.eyeTrackingAvailable !== false) {
      window.push(sample);
      while (window.length && sample.timestamp - window[0].timestamp > 12000) window.shift();
      if (matches(window)) return true;
    }
  }
  return false;
}

const visible = (point: VisualPoint | undefined): point is VisualPoint =>
  !!point && (point.visibility ?? 0) > 0.65 && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;

// These are framing/head-orientation estimates, not eye tracking or posture diagnoses.
export function measureVisualSample(points: VisualPoint[], timestamp: number): VisualSample {
  const [nose, leftEar, rightEar, leftShoulder, rightShoulder] = [points[0], points[7], points[8], points[11], points[12]];
  const shoulders = visible(leftShoulder) && visible(rightShoulder);
  const width = shoulders ? Math.abs(leftShoulder.x - rightShoulder.x) : 0;
  const center = shoulders ? (leftShoulder.x + rightShoulder.x) / 2 : 0.5;
  const ears = visible(leftEar) && visible(rightEar);
  const earWidth = ears ? Math.abs(leftEar.x - rightEar.x) : 0;
  const faceVisible = visible(nose) && ears && earWidth > 0.025;
  return {
    timestamp,
    facing: faceVisible ? Math.abs(nose.x - (leftEar.x + rightEar.x) / 2) / earWidth < 0.24 && Math.abs(leftEar.z - rightEar.z) < 0.14 : null,
    positioned: shoulders && width > 0.1 ? Math.abs(leftShoulder.y - rightShoulder.y) / width < 0.18 && Math.abs(center - 0.5) < 0.16 : null,
    head: visible(nose) && shoulders && width > 0.1 ? [(nose.x - center) / width, (nose.y - (leftShoulder.y + rightShoulder.y) / 2) / width] : null,
    shoulderCenter: shoulders ? center : undefined,
    shoulderTilt: shoulders && width > 0.1 ? Math.abs(leftShoulder.y - rightShoulder.y) / width : undefined,
    shoulderY: shoulders ? (leftShoulder.y + rightShoulder.y) / 2 : undefined,
    hands: [15, 16].flatMap((landmark, index) => {
      const point = points[landmark];
      return point && (point.visibility ?? 0) > 0.5 && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
        ? [{ side: index === 0 ? 'left' as const : 'right' as const, point: [point.x, point.y] as [number, number] }] : [];
    }),
    handTracking: 'pose',
    wrists: shoulders && width > 0.1 ? [points[15], points[16]].filter(visible).map(point => [(point.x - center) / width, (point.y - leftShoulder.y) / width]) : [],
    distance: faceVisible ? (earWidth > 0.34 ? 'close' : earWidth < 0.075 ? 'far' : null) : null,
  };
}

export function measureLighting(pixels: Uint8ClampedArray): 'dark' | 'bright' | null {
  let sum = 0, dark = 0, bright = 0;
  const count = pixels.length / 4;
  if (!count) return null;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
    sum += luminance;
    if (luminance < 40) dark++;
    if (luminance > 240) bright++;
  }
  return sum / count < 38 && dark / count > 0.7 ? 'dark' : sum / count > 240 && bright / count > 0.85 ? 'bright' : null;
}

export function evaluateVisualAnswer(samples: VisualSample[]): string[] | null {
  const originalSamples = samples;
  const usable = samples.filter(sample => !sample.issue && !sample.distance && sample.head && sample.facing !== null && sample.positioned !== null);
  // Never publish a dimension table from an answer dominated by unusable footage.
  if (usable.length < 6 || usable.length < samples.length * 0.7) return null;
  samples = usable;
  const origin = samples[0].timestamp;
  // Describe sustained events, rather than counting detector flicker as behavior.
  const runs = (matches: (sample: VisualSample) => boolean) => {
    const events: { start: number; end: number }[] = [];
    let active: { start: number; end: number } | null = null;
    for (const sample of samples) {
      if (active && (sample.timestamp - active.end > 1200 || !matches(sample))) {
        if (active.end - active.start >= 800) events.push(active);
        active = null;
      }
      if (matches(sample)) {
        if (!active) active = { start: sample.timestamp, end: sample.timestamp };
        active.end = sample.timestamp;
      }
    }
    if (active && active.end - active.start >= 800) events.push(active);
    return events;
  };
  const baseline = samples.slice(0, 3).reduce((sum, sample) => sum + sample.head![1], 0) / 3;
  const turned = runs(sample => sample.facing === false);
  const offCenter = runs(sample => sample.shoulderCenter !== undefined && Math.abs(sample.shoulderCenter - 0.5) > 0.16);
  const tilted = runs(sample => sample.shoulderTilt !== undefined && sample.shoulderTilt > 0.18);
  const lowered = runs(sample => sample.head![1] - baseline > 0.16);
  const raised = runs(sample => sample.head![1] - baseline < -0.16);
  let headPairs = 0, headMoves = 0, handPairs = 0, movingPairs = 0;
  let verticalHandMoves = 0, sidewaysHandMoves = 0;

  const trackedSides = new Set<string>();
  let firstMove: number | null = null;
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1], current = samples[i];
    const dt = (current.timestamp - previous.timestamp) / 1000;
    if (dt <= 0 || dt > 1.2) continue;
    headPairs++;
    if (Math.hypot(current.head![0] - previous.head![0], current.head![1] - previous.head![1]) / dt > 0.22) headMoves++;
    let comparable = false, moving = false;
    for (const hand of current.hands || []) {
      const before = previous.hands?.find(other => other.side === hand.side);
      if (!before || current.handTracking !== previous.handTracking) continue;
      comparable = true; trackedSides.add(hand.side);
      const dx = hand.point[0] - before.point[0], dy = hand.point[1] - before.point[1];
      if (Math.hypot(dx, dy) / dt > 0.08) {
        moving = true;
        if (Math.abs(dy) > Math.abs(dx) * 1.25) verticalHandMoves++;
        else if (Math.abs(dx) > Math.abs(dy) * 1.25) sidewaysHandMoves++;
      }
    }
    if (comparable) handPairs++;
    if (moving) {
      movingPairs++;
      if (firstMove === null) firstMove = current.timestamp;
    }
  }
  if (headPairs < 5) return null;

  const handsRaised = runs(sample => sample.shoulderY !== undefined && !!sample.hands?.some(hand => hand.point[1] < sample.shoulderY! - 0.04));
  const headX = samples.map(sample => sample.head![0]);
  const horizontalRange = Math.max(...headX) - Math.min(...headX);
  const longestSeconds = (events: { start: number; end: number }[]) =>
    Math.max(0, ...events.map(event => (event.end - event.start) / 1000));
  const trackedSeconds = samples.slice(1).reduce((total, sample, index) => {
    const gap = (sample.timestamp - samples[index].timestamp) / 1000;
    return total + (gap > 0 && gap <= 1.2 ? gap : 0);
  }, 0);
  // Coaching heuristics: brief glances and position changes are ordinary, not faults.
  // These thresholds do not diagnose attention, confidence, personality or disability.
  const repeatedTurns = longestSeconds(turned) >= 4 || (turned.length >= 3 && longestSeconds(turned) >= 1.5);
  const unsettledPosition = longestSeconds(offCenter) >= 5 || longestSeconds(tilted) >= 5 || offCenter.length >= 3;
  // Equivalent wording stays deterministic for the same recorded observations.
  const seed = samples.reduce((hash, sample) => Math.imul(hash ^ (
    Math.round((sample.head![0] + sample.head![1]) * 100) +
    Math.round(sample.timestamp - origin) + (sample.hands?.length || 0)
  ), 16777619) >>> 0, 2166136261);
  const choose = (options: string[], offset: number) => options[((seed + offset) % options.length + options.length) % options.length];
  let engagement = repeatedTurns ? choose([
    `You turned away from the camera for prolonged stretches, which may weaken visual connection; return toward the lens as you continue your answer.`,
    `Your camera engagement was inconsistent, with repeated or prolonged turns away while answering; brief glances are natural, but sustained turns can interrupt visual connection.`,
    `You faced away from the camera for a noticeable stretch, rather than returning forward between points; facing the camera again would improve visual connection.`,
  ], 0) : turned.length ? choose([
    'You generally addressed the camera, with brief turns away before returning to a forward position.',
    'Your head remained mostly oriented toward the camera, with a few short changes in direction.',
    'You maintained a mostly forward-facing position; the brief turns away did not become sustained.',
  ], 0) : choose([
    'You consistently faced the camera throughout the clearly tracked parts of this answer.',
    'Your camera-facing direction stayed steady, without a sustained turn away.',
    'You maintained a forward-facing position throughout this answer, keeping your face clearly presented to the camera.',
  ], 0);
  const postureEvents = offCenter.length ? offCenter : tilted;
  const positionAction = offCenter.length && tilted.length ? 'shifted off-center and tilted your shoulder line' : offCenter.length ? 'shifted your shoulders away from the center of the frame' : 'held your shoulder line at a tilt';
  const posture = unsettledPosition ? choose([
    `You ${positionAction} for a noticeable stretch. Settle into a comfortable, balanced position between movements.`,
    `You ${positionAction}, making your framing less settled. Returning to a balanced position can make your presentation easier to follow.`,
    `You ${positionAction} repeatedly or for a prolonged stretch. A comfortable, balanced position would give the interviewer a more consistent view.`,
  ], 1) : postureEvents.length ? choose([
    'Your shoulders remained mostly centered and level, with brief position changes during the answer.',
    'Your upper-body position was generally settled; the occasional shift did not become prolonged.',
    'You maintained balanced framing for most of this answer, with a few natural changes in position.',
  ], 1) : choose([
    'Your upper-body position remained centered and balanced throughout the visible parts of your answer.',
    'You maintained a settled upper-body position, with your shoulders balanced near the center of the frame.',
    'Your positioning stayed consistent, keeping your shoulders approximately level and your upper body centered.',
  ], 1);
  const frequentHeadMovement = trackedSeconds >= 5 && headMoves / headPairs > 0.45;
  const head = longestSeconds(lowered) >= 4 ? choose([
    `Your head remained lowered for a prolonged stretch, which made your forward-facing presentation less consistent; bring it back toward the camera between points.`,
    `Your head position stayed lowered rather than returning forward after a brief movement; lifting it between points would keep your face easier to see.`,
    `Your head remained down for a noticeable stretch while answering; returning to a comfortable forward position would improve your visual presentation.`,
  ], 2) : lowered.length ? choose([
    'Your head position was generally stable, with brief downward movements before returning toward its starting position.',
    'You made a few short downward head movements, without holding a prolonged lowered position.',
    'Your head stayed mostly steady, with occasional brief drops during the answer.',
  ], 2) : frequentHeadMovement ? choose([
    'Your head moved frequently during this answer. Pausing the movement briefly between points may make your visual delivery easier to follow.',
    'Repeated head movements were observed throughout the tracked answer. Aim for a comfortable resting position between movements.',
    'Your head position changed often rather than settling between points. A little less continuous movement could make your presentation clearer.',
  ], 2) : raised.length ? choose([
    `Your head was generally steady, with a sustained upward change in position.`,
    `You briefly held your head above its starting position; otherwise the movement remained measured.`,
    `Your head position stayed fairly consistent apart from an upward movement.`,
  ], 2) : horizontalRange > 0.35 ? choose([
    'Your head moved side to side relative to your shoulders, without a prolonged lowered position.',
    'Sideways head movements were visible during your answer, with pauses between changes in position.',
    'Your head position varied mainly from side to side rather than staying in a lowered position.',
  ], 2) : choose([
    'Your head position was generally stable, with only small movements while answering.',
    'You maintained a mostly steady head position without prolonged downward or sideways movement.',
    'Your head stayed close to its starting position, with natural small movements while answering.',
  ], 2);
  const frequentGestures = trackedSeconds >= 5 && handPairs >= 8 && movingPairs / handPairs > 0.65;
  const gesture = handPairs < 3 ? choose([
    'Hand tracking was too intermittent to assess your gestures reliably during this answer.',
    'There was not enough continuous hand tracking to describe your gesture pattern for this answer.',
    'Your gestures could not be evaluated reliably from the available hand detections.',
  ], 3) : firstMove === null ? choose([
    'Your hands remained mostly at rest, with no need to add gestures unless they feel natural.',
    'Your hand movements were minimal, giving your gestures a restrained, settled appearance.',
    'Your hands remained mostly still during the visible parts of your answer.',
  ], 3) : frequentGestures ? choose([
    'Your gestures were frequent and continuous, which may draw attention away from your explanation; brief pauses would make them more measured.',
    'Your gestures remained frequent during this answer, with little rest between movements; allowing your hands to settle could reduce visual distraction.',
    `Your gestures remained active through much of the answer, though fewer continuous movements could make your presentation easier to follow.`,
  ], 3) : handsRaised.length ? choose([
    `Your gestures were generally measured, though some upward movements were more pronounced; you paused between gestures.`,
    `You used occasional larger upward gestures, while keeping your hand movements separated by pauses.`,
    `Your hand movements were mostly controlled, with a few more noticeable upward gestures.`,
  ], 3) : verticalHandMoves > sidewaysHandMoves * 1.5 && verticalHandMoves > 2 ? choose([
    'Your gestures were generally measured, with occasional upward and downward movements while answering.',
    'You used intermittent upward and downward gestures, allowing your hands to settle between movements.',
    'Your gestures followed a mostly upward and downward pattern, with pauses that kept the movement from becoming continuous.',
  ], 3) : sidewaysHandMoves > verticalHandMoves * 1.5 && sidewaysHandMoves > 2 ? choose([
    'Your gestures were generally controlled, with occasional sweeping movements to the side.',
    'You used intermittent sideways gestures, with pauses between movements.',
    'Your gestures included sideways sweeps, though you allowed your hands to settle between them.',
  ], 3) : choose([
    `${trackedSides.size > 1 ? 'Your gestures involved both hands' : 'Your gestures mainly involved one visible hand'}, with measured pauses between movements.`,
    'Your gestures were generally measured, with comfortable pauses between hand movements.',
    'Your gestures stayed balanced, with hand movements separated by pauses rather than becoming continuous.',
  ], 3);
  const eyeSamples = samples.filter(sample => sample.eyePosition && sample.eyeTrackingAvailable !== false && sample.facing);
  if (eyeSamples.length >= 20 && eyeSamples.length >= samples.length * 0.7) {
    if (hasReadingLikePattern(originalSamples)) {
      engagement += ' Your eyes repeatedly swept sideways while directed lower, with your head staying relatively still. This pattern may indicate reading, but it can also occur when scanning the screen. Return toward the camera between points.';
    } else {
      const lower = runs(sample => !!sample.eyePosition && sample.eyePosition[1] > 0.65 && sample.facing === true);
      if (longestSeconds(lower) >= 4) engagement += ' Your eyes appeared directed downward for a sustained stretch while your head remained forward. Bring your gaze back toward the camera between points; this alone does not indicate reading.';
    }
  }
  return [engagement, posture, head, gesture];
}
