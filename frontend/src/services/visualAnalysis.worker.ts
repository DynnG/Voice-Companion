import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { measureHandPose, measureEyePosition, measureMouthOpening, measureLighting, measureVisualSample } from './visualAnalysis';

let tracker: PoseLandmarker | undefined;
let handTracker: HandLandmarker | undefined;
let faceTracker: FaceLandmarker | undefined;
const lightingCanvas = new OffscreenCanvas(64, 64);
const lightingContext = lightingCanvas.getContext('2d', { willReadFrequently: true });
// MediaPipe's classic WASM loader needs its factory exposed in module workers.
// Load it as a module (no eval) while leaving the pinned vendor code untouched.
const workerScope = self as unknown as { import: (path: string) => Promise<void>; ModuleFactory?: unknown; custom_dbg: (...messages: unknown[]) => void };
workerScope.custom_dbg = (...messages) => console.warn(...messages);
workerScope.import = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Visual tracking runtime could not load');
  const source = await response.text();
  const url = URL.createObjectURL(new Blob([source, '\nexport default ModuleFactory;'], { type: 'text/javascript' }));
  try { workerScope.ModuleFactory = (await import(/* @vite-ignore */ url)).default; }
  finally { URL.revokeObjectURL(url); }
};
const initialize = async () => {
  try {
    const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
    tracker = await PoseLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'CPU',
      },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
    });
    try {
      handTracker = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
    } catch { console.warn('Dedicated hand tracking unavailable; using pose wrists.'); }
    try {
      faceTracker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU',
        },
        runningMode: 'VIDEO', numFaces: 1,
        minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      });
    } catch { console.warn('Gaze tracking unavailable; continuing head and hand tracking.'); }
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({ type: 'error', reason: error instanceof Error ? error.message : 'Tracker failed to initialize' });
  }
};
self.onmessage = (event: MessageEvent<{ frame: ImageBitmap; timestamp: number }>) => {
  const { frame, timestamp } = event.data;
  try {
    if (!tracker) return;
    const result = tracker.detectForVideo(frame, timestamp);
    const sample = measureVisualSample(result.landmarks[0] || [], timestamp);
    sample.eyeTrackingAvailable = !!faceTracker;
    if (faceTracker) {
      try {
        const face = faceTracker.detectForVideo(frame, timestamp).faceLandmarks[0];
        sample.eyePosition = face ? measureEyePosition(face) : null;
        sample.mouthOpeningRatio = face ? measureMouthOpening(face) : null;
      } catch {
        faceTracker.close(); faceTracker = undefined;
        sample.eyeTrackingAvailable = false;
      }
    }
    if (handTracker) {
      try {
        const hands = handTracker.detectForVideo(frame, timestamp);
        sample.hands = hands.landmarks.flatMap((points, index) => {
          const wrist = points[0];
          const identity = hands.handedness[index]?.[0];
          if (!wrist || !identity || identity.score < 0.5 || wrist.x < 0 || wrist.x > 1 || wrist.y < 0 || wrist.y > 1) return [];
          return [{ side: identity.categoryName === 'Left' ? 'left' as const : 'right' as const, point: [wrist.x, wrist.y] as [number, number] }];
        });
        sample.handPose = hands.landmarks.reduce<ReturnType<typeof measureHandPose>>((pose, points, index) =>
          pose || (hands.handedness[index]?.[0]?.score >= .8 ? measureHandPose(points) : null), null);
        sample.handTracking = 'dedicated';
      } catch {
        handTracker.close(); handTracker = undefined;
        sample.handTracking = 'pose';
      }
    }
    // Check the central subject area rather than a dark background around them.
    lightingContext?.drawImage(frame, frame.width * 0.25, frame.height * 0.15, frame.width * 0.5, frame.height * 0.65, 0, 0, 64, 64);
    const lighting = lightingContext ? measureLighting(lightingContext.getImageData(0, 0, 64, 64).data) : null;
    sample.issue = lighting || sample.distance || (sample.shouldersVisible === false ? 'shoulders' : null) || (sample.facing === null || sample.positioned === null || !sample.head ? 'framing' : null);
    self.postMessage({ type: 'sample', sample });
  } catch (error) {
    self.postMessage({ type: 'error', reason: error instanceof Error ? error.message : 'Tracking failed' });
  } finally { frame.close(); }
};
void initialize();
