import { readSpeechLevel } from '../services/ttsService';
import React, { useEffect, useRef } from 'react';
import { VoiceState } from '../types/conversation';

export type SaviOrbState = 'idle' | 'speaking' | 'transcribing';

const SAVI_PALETTES: Record<SaviOrbState, string> = {
  idle: '#9DBDA4',
  speaking: '#FFB347',
  transcribing: '#A293C2',
};

export interface VoiceReactiveConfig {
  micSensitivity?: number;      // Multiplier for microphone amplitude response (default 1.0)
  micExpansionMax?: number;     // Maximum radius expansion ratio during loud speech (default 0.08 = +8% to +10%)
  micLobeDistortionMax?: number;// Maximum organic contour distortion from speech (default 0.05)
  speechPulseSpeed?: number;    // Frequency of procedural AI speech cadence (default 1.8)
  speechPulseMax?: number;      // Maximum expansion during AI speech (default 0.025)
  thinkingSpeed?: number;       // Speed of cognitive pulsation (default 1.4)
  idleBreathingAmp?: number;    // Subtle breathing amplitude in idle state (default 0.015)
}

const DEFAULT_CONFIG: Required<VoiceReactiveConfig> = {
  micSensitivity: 1.0,
  micExpansionMax: 0.08,        // Subtly bounded: 1.00 -> 1.08 (up to ~1.10 max)
  micLobeDistortionMax: 0.05,   // Gentle contour ripple
  speechPulseSpeed: 1.8,
  speechPulseMax: 0.025,         // Subtly bounded for AI voice
  thinkingSpeed: 1.4,
  idleBreathingAmp: 0.015,      // Very gentle organic breathing (+-1.5%)
};

export interface VoiceCreatureProps {
  state: VoiceState;
  celebration?: number;
  gesture?: 'no' | null;
  onGestureEnd?: () => void;
  onTap?: () => void;
  audioLevelRef?: React.MutableRefObject<number> | React.RefObject<number>;
  audioLevel?: number;
  config?: VoiceReactiveConfig;
  className?: string;
  compact?: boolean;
  respectReducedMotion?: boolean;
  visualState?: SaviOrbState;
  /** Decorative setup-page animation; never represents interview activity. */
  ambientLoop?: boolean;
}

const STATE_CONFIG: Record<VoiceState, { colorVar: string; amp: number; speed: number; lobes: number; ring: number }> = {
  idle:       { colorVar: '--glow-idle', amp: 0.06,  speed: 0.25, lobes: 3, ring: 0 },
  listening:  { colorVar: '--glow-a',    amp: 0.055, speed: 0.20, lobes: 7, ring: 0 },
  thinking:   { colorVar: '--glow-b',    amp: 0.09,  speed: 1.3,  lobes: 7, ring: 0 },
  speaking:   { colorVar: '--glow-c',    amp: 0.055, speed: 0.20, lobes: 7, ring: 1 },
  gesture_no: { colorVar: '--glow-b',    amp: 0.08,  speed: 0.6,  lobes: 4, ring: 0 },
};

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export const GESTURE_NO_PALETTE = {
  yellow:  { r: 255, g: 195, b: 112 }, // Normal yellow / warm earth gold (--glow-b)
  orange:  { r: 255, g: 138, b: 48 },  // Transition amber / warm orange
  softRed: { r: 248, g: 86,  b: 68 },  // Peak soft glowing red (warm coral/amber-red, gentle boundary)
} as const;

export function calculateGestureEmotionalProgress(timeMs: number): number {
  if (timeMs <= 250) {
    return 0.0;
  }
  if (timeMs <= 700) {
    const p = (timeMs - 250) / 450;
    return 0.5 * (p * p * (3 - 2 * p));
  }
  if (timeMs <= 1200) {
    const p = (timeMs - 700) / 500;
    return 0.5 + 0.5 * (p * p * (3 - 2 * p));
  }
  if (timeMs <= 3050) {
    return 1.0;
  }
  if (timeMs <= 3800) {
    const p = (timeMs - 3050) / 750;
    return 1.0 - (p * p * (3 - 2 * p));
  }
  return 0.0;
}

export function interpolateEmotionalColor(emotionalProgress: number): RGBColor {
  const clamped = Math.max(0, Math.min(1, emotionalProgress));
  const { yellow, orange, softRed } = GESTURE_NO_PALETTE;

  if (clamped <= 0.5) {
    const t = clamped / 0.5;
    return {
      r: Math.round(yellow.r + (orange.r - yellow.r) * t),
      g: Math.round(yellow.g + (orange.g - yellow.g) * t),
      b: Math.round(yellow.b + (orange.b - yellow.b) * t),
    };
  } else {
    const t = (clamped - 0.5) / 0.5;
    return {
      r: Math.round(orange.r + (softRed.r - orange.r) * t),
      g: Math.round(orange.g + (softRed.g - orange.g) * t),
      b: Math.round(orange.b + (softRed.b - orange.b) * t),
    };
  }
}

export interface HandTargetPoint {
  x: number;      // local hand coordinates normalized relative to baseR
  y: number;      // normalized relative to baseR (negative = above orb center)
  part: 'wrist' | 'palm' | 'thumb' | 'curled' | 'index';
  isWagging?: boolean;
  wagHeight?: number; // distance along the raised index, 0 at knuckle and 1 at tip
}

// Local pose around a wrist at the orb's 8–9 o'clock edge. The wrist runs
// rightward into the orb; palm/curled fingers sit left; index rises up-left.
export const HAND_TARGET_TEMPLATES: readonly HandTargetPoint[] = [
  { x: 0.0600, y: -0.0800, part: 'wrist' },
  { x: -0.0200, y: -0.0700, part: 'wrist' },
  { x: -0.1000, y: -0.0600, part: 'wrist' },
  { x: -0.1800, y: -0.0400, part: 'wrist' },
  { x: -0.2600, y: -0.0200, part: 'wrist' },
  { x: 0.0600, y: 0.0800, part: 'wrist' },
  { x: -0.0200, y: 0.0800, part: 'wrist' },
  { x: -0.1000, y: 0.0900, part: 'wrist' },
  { x: -0.1800, y: 0.0900, part: 'wrist' },
  { x: -0.2600, y: 0.0800, part: 'wrist' },
  { x: -0.4890, y: -0.0309, part: 'palm' },
  { x: -0.3989, y: -0.0959, part: 'palm' },
  { x: -0.3019, y: -0.1659, part: 'palm' },
  { x: -0.2188, y: -0.2259, part: 'palm' },
  { x: -0.5439, y: -0.1298, part: 'palm' },
  { x: -0.4607, y: -0.1898, part: 'palm' },
  { x: -0.3638, y: -0.2598, part: 'palm' },
  { x: -0.2806, y: -0.3198, part: 'palm' },
  { x: -0.1495, y: -0.2486, part: 'thumb' },
  { x: -0.2068, y: -0.3078, part: 'thumb' },
  { x: -0.3011, y: -0.3111, part: 'thumb' },
  { x: -0.3940, y: -0.2921, part: 'thumb' },
  { x: -0.4633, y: -0.2521, part: 'thumb' },
  { x: -0.5089, y: -0.1911, part: 'thumb' },
  { x: -0.5025, y: -0.2064, part: 'curled' },
  { x: -0.5648, y: -0.2744, part: 'curled' },
  { x: -0.5378, y: -0.3477, part: 'curled' },
  { x: -0.4582, y: -0.2897, part: 'curled' },
  { x: -0.4259, y: -0.2737, part: 'curled' },
  { x: -0.5082, y: -0.3763, part: 'curled' },
  { x: -0.4999, y: -0.4619, part: 'curled' },
  { x: -0.4316, y: -0.4436, part: 'curled' },
  { x: -0.3753, y: -0.3261, part: 'curled' },
  { x: -0.3356, y: -0.3374, part: 'curled' },
  { x: -0.4243, y: -0.4710, part: 'curled' },
  { x: -0.4346, y: -0.5689, part: 'curled' },
  { x: -0.3577, y: -0.5556, part: 'curled' },
  { x: -0.2763, y: -0.3947, part: 'curled' },
  { x: -0.2867, y: -0.4061, part: 'index', isWagging: true, wagHeight: 0.0000 },
  { x: -0.2174, y: -0.4461, part: 'index', isWagging: true, wagHeight: 0.0000 },
  { x: -0.3212, y: -0.4963, part: 'index', isWagging: true, wagHeight: 0.1719 },
  { x: -0.2779, y: -0.5213, part: 'index', isWagging: true, wagHeight: 0.1719 },
  { x: -0.2346, y: -0.5463, part: 'index', isWagging: true, wagHeight: 0.1719 },
  { x: -0.3517, y: -0.6089, part: 'index', isWagging: true, wagHeight: 0.3750 },
  { x: -0.3084, y: -0.6339, part: 'index', isWagging: true, wagHeight: 0.3750 },
  { x: -0.2651, y: -0.6589, part: 'index', isWagging: true, wagHeight: 0.3750 },
  { x: -0.3845, y: -0.7301, part: 'index', isWagging: true, wagHeight: 0.5938 },
  { x: -0.3412, y: -0.7551, part: 'index', isWagging: true, wagHeight: 0.5938 },
  { x: -0.2979, y: -0.7801, part: 'index', isWagging: true, wagHeight: 0.5938 },
  { x: -0.4062, y: -0.8477, part: 'index', isWagging: true, wagHeight: 0.7969 },
  { x: -0.3716, y: -0.8677, part: 'index', isWagging: true, wagHeight: 0.7969 },
  { x: -0.3369, y: -0.8877, part: 'index', isWagging: true, wagHeight: 0.7969 },
  { x: -0.4186, y: -0.9307, part: 'index', isWagging: true, wagHeight: 0.9375 },
  { x: -0.4021, y: -0.9803, part: 'index', isWagging: true, wagHeight: 1.0000 },
  { x: -0.3667, y: -0.9607, part: 'index', isWagging: true, wagHeight: 0.9375 },
  { x: -0.3833, y: -0.9110, part: 'index', isWagging: true, wagHeight: 0.8750 },
];

export function calculateWagOffset(point: HandTargetPoint, wagPhase: number, baseR: number): { dx: number; dy: number } {
  if (!point.isWagging) {
    return { dx: 0, dy: 0 };
  }
  const h = point.wagHeight ?? 0;
  const sway = Math.sin(wagPhase * Math.PI * 4); // 2 complete wag cycles
  const dx = sway * baseR * 0.16 * h;
  const dy = (1 - Math.cos(sway * 0.35)) * baseR * 0.12 * h;
  return { dx, dy };
}

export function calculateGestureCanvasPadding(width: number, height: number, left: number, top: number, viewportWidth: number, viewportHeight: number) {
  const allowance = Math.min(width, height) * 0.22;
  return {
    left: Math.max(0, Math.min(allowance, left - 4)),
    right: Math.max(0, Math.min(allowance, viewportWidth - left - width - 4)),
    top: Math.max(0, Math.min(allowance, top - 4)),
    bottom: Math.max(0, Math.min(allowance, viewportHeight - top - height - 4)),
  };
}

export function calculateGestureRenderScale(radius: number, cx: number, cy: number, padding: { left: number; top: number }) {
  // Existing particles reach 3.45px radius and 12px shadow blur at peak anger.
  // Reserve two blur radii so the natural glow fades before any bitmap edge.
  const glowMargin = 28;
  const leftExtent = Math.max(...HAND_TARGET_TEMPLATES.map(p => -p.x + 0.16 * (p.wagHeight ?? 0)));
  const topExtent = Math.max(...HAND_TARGET_TEMPLATES.map(p => -p.y));
  return Math.max(0, Math.min(1.5625,
    (cx + padding.left - glowMargin - radius * 0.82) / (radius * leftExtent),
    (cy + padding.top - glowMargin + radius * 0.25) / (radius * topExtent),
  ));
}

function hexToRgb(h: string) {
  const clean = h.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16) || 75,
    g: parseInt(clean.slice(2, 4), 16) || 86,
    b: parseInt(clean.slice(4, 6), 16) || 117
  };
}

function hueShift({ r, g, b }: { r: number; g: number; b: number }, deg: number) {
  let rNorm = r / 255;
  let gNorm = g / 255;
  let bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rNorm) h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
    else if (max === gNorm) h = (bNorm - rNorm) / d + 2;
    else h = (rNorm - gNorm) / d + 4;
    h /= 6;
  }
  h = ((h + deg / 360) % 1 + 1) % 1;

  function hue2rgb(p: number, q: number, tt: number) {
    let t = tt;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  let r2: number, g2: number, b2: number;
  if (s === 0) {
    r2 = g2 = b2 = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r2 = hue2rgb(p, q, h + 1 / 3);
    g2 = hue2rgb(p, q, h);
    b2 = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r2 * 255), g: Math.round(g2 * 255), b: Math.round(b2 * 255) };
}

export const VoiceCreature: React.FC<VoiceCreatureProps> = ({
  state,
  gesture,
  onGestureEnd,
  onTap,
  audioLevelRef,
  audioLevel,
  config,
  className,
  compact,
  respectReducedMotion = false,
  visualState,
  ambientLoop = false,
  celebration = 0
}) => {
  const burstStartedRef = useRef<number | null>(null);
  useEffect(() => {
    if (celebration > 0) burstStartedRef.current = performance.now();
  }, [celebration]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const currentStateRef = useRef<VoiceState>(state);
  const gesturePropRef = useRef<'no' | null | undefined>(gesture);
  const onGestureEndRef = useRef<(() => void) | undefined>(onGestureEnd);
  const audioLevelPropRef = useRef<number | undefined>(audioLevel);
  const externalAudioRef = useRef<React.MutableRefObject<number> | React.RefObject<number> | undefined>(audioLevelRef);
  const configRef = useRef<VoiceReactiveConfig | undefined>(config);
  const visualStateRef = useRef(visualState);
  const redrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    visualStateRef.current = visualState;
    redrawRef.current?.();
  }, [visualState]);

  useEffect(() => {
    currentStateRef.current = state;
  }, [state]);

  useEffect(() => {
    gesturePropRef.current = gesture;
  }, [gesture]);

  useEffect(() => {
    onGestureEndRef.current = onGestureEnd;
  }, [onGestureEnd]);

  useEffect(() => {
    audioLevelPropRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    externalAudioRef.current = audioLevelRef;
  }, [audioLevelRef]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isMotionReduced = () => respectReducedMotion && motionQuery.matches;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let cx = 0;
    let cy = 0;
    let canvasPadding = { left: 0, right: 0, top: 0, bottom: 0 };
    let pointer: { x: number; y: number } | null = null;
    let pointerPressed = false;
    let grabbedPointer: number | null = null;
    let grabX = 0;
    let grabY = 0;
    let grabFollowX = 0;
    let grabFollowY = 0;
    let contactAngle = 0;
    let contactStrength = 0;
    let contactVelocity = 0;
    let followX = 0;
    let followY = 0;
    let followVelocityX = 0;
    let followVelocityY = 0;
    let hitOutline: { x: number; y: number }[] = [];

    const movePointer = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (isMotionReduced()) draw();
    };
    const leavePointer = () => {
      if (grabbedPointer !== null) return;
      pointer = null;
      pointerPressed = false;
      if (isMotionReduced()) draw();
    };
    const pressPointer = (event: PointerEvent) => {
      pointerPressed = true;
      movePointer(event);
      if (ambientLoop && pointer && touchesOrb()) {
        grabbedPointer = event.pointerId;
        grabX = pointer.x;
        grabY = pointer.y;
        grabFollowX = followX;
        grabFollowY = followY;
        wrap.setPointerCapture(event.pointerId);
      }
    };
    const releasePointer = (event: PointerEvent) => {
      pointerPressed = false;
      if (grabbedPointer !== null) {
        const id = grabbedPointer;
        grabbedPointer = null;
        if (wrap.hasPointerCapture(id)) wrap.releasePointerCapture(id);
        const rect = wrap.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) pointer = null;
      }
      if (event.pointerType === 'touch') pointer = null;
      if (isMotionReduced()) draw();
    };
    const cancelPointer = () => {
      grabbedPointer = null;
      leavePointer();
    };
    wrap.addEventListener('pointermove', movePointer, { passive: true });
    wrap.addEventListener('pointerleave', leavePointer);
    wrap.addEventListener('pointerdown', pressPointer, { passive: true });
    wrap.addEventListener('pointercancel', cancelPointer);
    wrap.addEventListener('lostpointercapture', cancelPointer);
    window.addEventListener('pointerup', releasePointer);

    function touchesOrb(): boolean {
      if (!pointer) return false;
      let inside = false;
      for (let i = 0, j = hitOutline.length - 1; i < hitOutline.length; j = i++) {
        const a = hitOutline[i], b = hitOutline[j];
        if ((a.y > pointer.y) !== (b.y > pointer.y)
          && pointer.x < (b.x - a.x) * (pointer.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    }

    function resize() {
      if (!wrap || !canvas || !ctx) return;
      const rect = wrap.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvasPadding = calculateGestureCanvasPadding(W, H, rect.left, rect.top, window.innerWidth, window.innerHeight);
      const drawWidth = W + canvasPadding.left + canvasPadding.right;
      const drawHeight = H + canvasPadding.top + canvasPadding.bottom;
      canvas.width = Math.ceil(drawWidth * dpr);
      canvas.height = Math.ceil(drawHeight * dpr);
      canvas.style.position = 'absolute';
      canvas.style.left = -canvasPadding.left + 'px';
      canvas.style.top = -canvasPadding.top + 'px';
      canvas.style.width = drawWidth + 'px';
      canvas.style.height = drawHeight + 'px';
      // W/H, cx/cy and all normal orb radii still use the original wrapper.
      ctx.setTransform(dpr, 0, 0, dpr, canvasPadding.left * dpr, canvasPadding.top * dpr);
      cx = W / 2;
      cy = H / 2;
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (isMotionReduced()) draw();
    });
    resizeObserver.observe(wrap);
    window.addEventListener('resize', resize);
    resize();

    let cur = {
      amp: STATE_CONFIG.idle.amp,
      speed: STATE_CONFIG.idle.speed,
      lobes: STATE_CONFIG.idle.lobes,
      ring: 0
    };
    let colorMix = hexToRgb(visualStateRef.current ? SAVI_PALETTES[visualStateRef.current] : hex(STATE_CONFIG.idle.colorVar));
    let smoothedMicLevel = 0;
    let speechActivity = 0;
    let phaseAccumulator = 0;
    // Voice-reactive surface shared by the two warm-yellow speaking states.
    let listeningLevel = 0;
    let speechPulseLevel = 0;
    let listeningMix = 0;
    let listeningPhase = 0;
    let listeningAmplitude = 0.075;
    const listeningSurface = new Float64Array(84);
    let lastVoiceRise = -Infinity;
    let previousVoiceInput = 0;
    let voiceCadence = 0;
    let edgeFlowTarget = Math.random() * Math.PI * 2;
    let edgeFlowPhase = edgeFlowTarget;
    let userFlowMix = 0;

    interface RippleWave {
      progress: number;
      speed: number;
      maxDistance: number;
      peakAlpha: number;
      type: 'candidate' | 'savi';
    }
    const activeRipples: RippleWave[] = [];
    let rippleCadenceCooldown = 0;
    let rippleSpeechEnergy = 0;

    let gestureTime = 0;
    let isGestureRunning = false;
    let currentEmotion = 0;
    const GESTURE_DURATION = 3.8;

    const motes = Array.from({ length: 56 }, (_, i) => ({
      radiusF: 1.10 + Math.random() * 0.45,
      speed: 0.2 + Math.random() * 0.4,
      dir: i % 2 === 0 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
      size: 1 + Math.random() * 1.3
    }));

    let t = 0;
    let rot = 0;
    let angularSpeed = 0.12;
    let lastFrameTime = performance.now();
    const ambientColors = ['#9DBDA4', '#A293C2', '#FFD66B'].map(hexToRgb);

    function hex(v: string): string {
      return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#4b5675';
    }

    function blobPoints(baseR: number, amp: number, lobes: number, phase: number, n: number = 72, rotation = rot, saveHitOutline = false) {
      const pts = [];
      const outline: { x: number; y: number }[] = [];
      let listeningMean = 0;
      if (listeningMix > 0) {
        const flowPhase = phase + listeningPhase - phaseAccumulator;
        for (let i = 0; i < n; i++) {
          const a = i * Math.PI * 2 / n;
          // Seven rounded swells stretch and relax at different rates, with
          // smoothly traveling emphasis rather than identical repeated petals.
          const voiceLift = Math.pow(Math.max(0, speechPulseLevel), 0.65);
          const flowingAngle = a
            + 0.035 * Math.sin(2 * a - flowPhase * 0.46)
            + 0.018 * Math.sin(3 * a + flowPhase * 0.33);
          const waveAngle = 7 * flowingAngle + flowPhase
            + userFlowMix * 0.25 * Math.sin(flowPhase * 0.61);
          const envelope = 0.86
            + (0.10 + voiceLift * 0.14) * Math.sin(2 * a + edgeFlowPhase)
            + 0.10 * Math.cos(3 * a - flowPhase * 0.39 + edgeFlowPhase * 0.41);
          const surface = envelope * Math.sin(waveAngle)
            + 0.025 * Math.sin(2 * waveAngle + flowPhase * 0.43)
            + 0.16 * Math.sin(2 * a - flowPhase * 0.61)
            + 0.12 * Math.sin(3 * a + flowPhase * 0.47 + 0.65);
          listeningSurface[i] = surface;
          listeningMean += surface / n;
        }
      }
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        // Contained fluid mass: asymmetrical traveling edge waves moving around circumference
        // Conservation of volume: all harmonic components integrate to 0 over [0, 2pi]
        // 1. Primary traveling swell packet (flows around the perimeter)
        const wave1 = Math.sin(lobes * a + phase);
        // 2. Counter-propagating capillary wave (fluid shear & surface folding)
        const wave2 = Math.sin((lobes + 2) * a - phase * 1.35 + 0.65);
        // 3. Harmonic mass redistribution (adjacent stretch and draw)
        const wave3 = Math.sin((lobes - 2) * a + phase * 0.80 + 1.25);
        // 4. Asymmetrical traveling wave envelope: one section pushes outward while opposite section pulls inward
        const wave4 = Math.sin(a + phase * 0.60) * Math.cos(2 * a - phase * 0.70 + 0.45);
        const originalSurface = 0.60 * wave1 + 0.40 * wave2 + 0.35 * wave3 + 0.50 * wave4;
        const surface = listeningMix > 0
          ? originalSurface * (1 - listeningMix) + (listeningSurface[i] - listeningMean) * listeningMix
          : originalSurface;
        const r = baseR * (1 + amp * surface);
        const worldAngle = a + rotation;
        if (saveHitOutline) outline.push({ x: cx + followX + Math.cos(worldAngle) * r, y: cy + followY + Math.sin(worldAngle) * r });
        // Local pressure creates a soft dent with small neighboring shoulders.
        // It overlays the live shape, so speech and state motion stay intact.
        const distance = Math.atan2(Math.sin(worldAngle - contactAngle), Math.cos(worldAngle - contactAngle));
        const dent = Math.exp(-distance * distance / 0.18);
        const shoulders = Math.exp(-Math.pow(Math.abs(distance) - 0.65, 2) / 0.13);
        const touchOffset = contactStrength * baseR * (-dent + 0.35 * shoulders);
        // The setup bubble softly stretches along the pointer's pull and glide.
        const stretch = ambientLoop
          ? Math.min(0.045, Math.hypot(followX, followY) / baseR * 0.25
            + Math.hypot(followVelocityX, followVelocityY) / baseR * 0.015)
          : 0;
        const followOffset = baseR * stretch * Math.cos(2 * (worldAngle - contactAngle));
        pts.push({ x: cx + followX + Math.cos(worldAngle) * (r + touchOffset + followOffset), y: cy + followY + Math.sin(worldAngle) * (r + touchOffset + followOffset) });
      }
      if (saveHitOutline) hitOutline = outline;
      return pts;
    }

    function smoothPath(pts: { x: number; y: number }[]) {
      if (!ctx) return;
      ctx.beginPath();
      const n = pts.length;
      const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
      });
      const m0 = mid(pts[n - 1], pts[0]);
      ctx.moveTo(m0.x, m0.y);
      for (let i = 0; i < n; i++) {
        const curPt = pts[i];
        const nextPt = pts[(i + 1) % n];
        const m = mid(curPt, nextPt);
        ctx.quadraticCurveTo(curPt.x, curPt.y, m.x, m.y);
      }
      ctx.closePath();
    }

    function draw() {
      const now = performance.now();
      const elapsed = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;
      const dragging = ambientLoop && grabbedPointer !== null;
      const touching = dragging || touchesOrb();
      const pressure = touching
        ? ambientLoop ? (pointerPressed ? 0.16 : 0.09) : (pointerPressed ? 0.11 : 0.065)
        : 0;
      const followLimit = Math.min(W, H) * 0.28 * (dragging ? 0.32 : 0.12);
      const pointerDistance = pointer ? Math.hypot(pointer.x - cx, pointer.y - cy) : 0;
      const followAmount = ambientLoop && touching && pointerDistance > 0
        ? Math.min(0.16, followLimit / pointerDistance)
        : 0;
      let targetFollowX = pointer ? (pointer.x - cx) * followAmount : 0;
      let targetFollowY = pointer ? (pointer.y - cy) * followAmount : 0;
      if (dragging && pointer) {
        targetFollowX = grabFollowX + (pointer.x - grabX) * 0.55;
        targetFollowY = grabFollowY + (pointer.y - grabY) * 0.55;
        const pull = Math.hypot(targetFollowX, targetFollowY);
        if (pull > followLimit) {
          targetFollowX *= followLimit / pull;
          targetFollowY *= followLimit / pull;
        }
      }
      if (touching && pointer) {
        const targetAngle = Math.atan2(pointer.y - cy, pointer.x - cx);
        const delta = Math.atan2(Math.sin(targetAngle - contactAngle), Math.cos(targetAngle - contactAngle));
        contactAngle = isMotionReduced()
          ? targetAngle
          : contactAngle + delta * (1 - Math.exp(-elapsed / (ambientLoop ? 0.13 : 0.09)));
      }
      if (isMotionReduced()) {
        contactStrength = pressure * 0.5;
        contactVelocity = 0;
        followX = targetFollowX * 0.5;
        followY = targetFollowY * 0.5;
        followVelocityX = followVelocityY = 0;
      } else {
        // Substeps keep the damped spring stable even during a slow frame.
        const steps = Math.max(1, Math.ceil(elapsed / 0.008));
        const dt = elapsed / steps;
        for (let i = 0; i < steps; i++) {
          contactVelocity += ((pressure - contactStrength) * 110 - contactVelocity * 19) * dt;
          contactStrength += contactVelocity * dt;
          const followSpring = ambientLoop ? (dragging ? 80 : 65) : 120;
          const followDamping = ambientLoop ? (dragging ? 18 : 14) : 20;
          followVelocityX += ((targetFollowX - followX) * followSpring - followVelocityX * followDamping) * dt;
          followVelocityY += ((targetFollowY - followY) * followSpring - followVelocityY * followDamping) * dt;
          followX += followVelocityX * dt;
          followY += followVelocityY * dt;
        }
      }
      t += isMotionReduced() ? 0 : elapsed;
      const currentName = currentStateRef.current;
      const visual = ambientLoop ? 'idle' : visualStateRef.current;
      const target = ambientLoop
        ? { ...STATE_CONFIG.idle, amp: 0.115, speed: 0.95 }
        : visual === 'idle' && currentName === 'idle'
        ? { ...STATE_CONFIG.idle, amp: 0.09, speed: 0.65 }
        : STATE_CONFIG[currentName];
      const cfg = { ...DEFAULT_CONFIG, ...configRef.current };

      // 1. Audio amplitude input & smoothing
      let rawMicInput = 0;
      if (currentName === 'speaking') {
        rawMicInput = readSpeechLevel();
      } else if (currentName === 'listening') {
        const fromRef = externalAudioRef.current?.current;
        const fromProp = audioLevelPropRef.current;
        const val = typeof fromRef === 'number' ? fromRef : fromProp;
        if (typeof val === 'number' && !isNaN(val)) {
          // Clamped input range [0.0, 1.0]
          rawMicInput = Math.max(0, Math.min(1.0, val * cfg.micSensitivity));
        }
      }

      // Asymmetrical attack (0.28) and decay (0.10) envelope follower prevents jitter and flicker
      if (rawMicInput > smoothedMicLevel) {
        smoothedMicLevel += (rawMicInput - smoothedMicLevel) * 0.28;
      } else {
        smoothedMicLevel += (rawMicInput - smoothedMicLevel) * 0.10;
      }
      if (smoothedMicLevel < 0.001) smoothedMicLevel = 0;
      smoothedMicLevel = Math.min(1.0, smoothedMicLevel);

      // Measure active speech signal for User and AI
      let currentSpeechSignal = 0;
      if (currentName === 'speaking') {
        const liveSpeech = readSpeechLevel();
        const syllabicCadence = Math.sin(t * cfg.speechPulseSpeed);
        const phraseCadence = Math.sin(t * (cfg.speechPulseSpeed * 0.45) + 0.6);
        const breathCadence = Math.sin(t * 1.2 + 1.0);
        const speechEnvelope = Math.max(0, syllabicCadence * 0.45 + phraseCadence * 0.35 + breathCadence * 0.2);
        currentSpeechSignal = Math.max(speechEnvelope * 0.65, liveSpeech * 1.2, smoothedMicLevel);
      } else if (currentName === 'listening') {
        currentSpeechSignal = smoothedMicLevel;
      }

      // Smooth inertia: speech activity gradually accelerates (~380ms) and gracefully decelerates (~1200ms)
      if (currentSpeechSignal > speechActivity) {
        speechActivity += (currentSpeechSignal - speechActivity) * (1 - Math.exp(-elapsed / 0.38));
      } else {
        speechActivity += (currentSpeechSignal - speechActivity) * (1 - Math.exp(-elapsed / 1.20));
      }
      if (speechActivity < 0.001) speechActivity = 0;

      // Lerp baseline state attributes
      cur.amp += (target.amp - cur.amp) * 0.05;
      cur.speed += (target.speed - cur.speed) * 0.05;
      cur.lobes += (target.lobes - cur.lobes) * (1 - Math.exp(-elapsed / 0.65));
      cur.ring += (target.ring - cur.ring) * 0.06;

      const isSpeech = currentName === 'speaking' || currentName === 'listening';

      // Listening turns with the same smoothed voice envelope as its edge pulse.
      // Keep the turn continuous and bounded; pauses settle without stopping it.
      const listeningTurn = 0.20
        + Math.pow(Math.max(0, speechPulseLevel), 0.65) * 0.18;
      const targetAngularSpeed = visual === 'transcribing'
        ? 0.35
        : currentName === 'listening'
        ? listeningTurn
        : currentName === 'speaking'
        ? 0.15 + Math.sqrt(smoothedMicLevel) * 0.17 + voiceCadence * 0.05
        : cur.speed * 0.75;
      angularSpeed += (targetAngularSpeed - angularSpeed)
        * (1 - Math.exp(-elapsed / 0.65));
      if (!isMotionReduced()) rot += elapsed * angularSpeed;

      // Continuous phase integration: traveling edge waves moving around circumference
      // Silence: 0.75 rad/s (long, slow traveling edge waves)
      // Normal speech: ~1.85 rad/s (clearly noticeable flowing edge deformation traveling around circumference)
      // Fast/energetic speech: ~2.60 rad/s (quicker traveling edge movement)
      const baseFluidSpeed = isSpeech ? 0.75 + speechActivity * 1.85 : cur.speed;
      phaseAccumulator += elapsed * baseFluidSpeed * 1.5;

      const listening = isSpeech && !ambientLoop;
      const listeningInput = listening ? rawMicInput : 0;
      const userListening = currentName === 'listening' && !ambientLoop;
      userFlowMix += ((userListening ? 1 : 0) - userFlowMix)
        * (1 - Math.exp(-elapsed / 0.25));
      if (!userListening && userFlowMix < 0.001) userFlowMix = 0;
      // Estimate phrase/syllable activity from spaced rises in the existing signal.
      // This observes speech rhythm; it does not infer words or capture more audio.
      if (listeningInput - previousVoiceInput > 0.025 && t - lastVoiceRise > 0.16) {
        const interval = t - lastVoiceRise;
        if (interval < 1.4) {
          const cadence = Math.max(0, Math.min(1, (1 / interval - 1) / 5));
          voiceCadence += (cadence - voiceCadence) * 0.35;
        }
        edgeFlowTarget += Math.PI * (3 - Math.sqrt(5));
        lastVoiceRise = t;
      }
      edgeFlowPhase += (edgeFlowTarget - edgeFlowPhase)
        * (1 - Math.exp(-elapsed / 0.45));
      previousVoiceInput = listeningInput;
      voiceCadence *= Math.exp(-elapsed / 0.8);
      // Follow each voice rise and relax between syllables without a fixed beat.
      speechPulseLevel += (listeningInput - speechPulseLevel)
        * (1 - Math.exp(-elapsed / (listeningInput > speechPulseLevel ? 0.06 : 0.18)));
      listeningLevel += (listeningInput - listeningLevel)
        * (1 - Math.exp(-elapsed / (listeningInput > listeningLevel ? 0.075 : 0.35)));
      listeningMix += ((listening ? 1 : 0) - listeningMix)
        * (1 - Math.exp(-elapsed / 0.22));
      if (listening && listeningMix > 0.999) listeningMix = 1;
      if (!listening && listeningMix < 0.001) listeningMix = 0;
      if (listeningMix === 0) listeningPhase = phaseAccumulator;
      else listeningPhase += elapsed * (0.70 + Math.sqrt(listeningLevel) * 1.55 + voiceCadence * 0.65);
      // Boost only Savi's perimeter response; keep the microphone gain intact.
      const edgePulseGain = currentName === 'speaking' ? 0.20 : 0.12;
      listeningAmplitude += (0.065 + Math.pow(Math.max(0, speechPulseLevel), 0.65) * edgePulseGain - listeningAmplitude)
        * (1 - Math.exp(-elapsed / 0.08));

      // Gesture "NO / STAY ON TOPIC" Lifecycle & Emotion Update
      const isGestureRequested = currentName === 'gesture_no' || gesturePropRef.current === 'no';

      // Immediate interruption if candidate starts speaking (listening) or thinking
      if (currentName === 'listening' || currentName === 'thinking') {
        if (isGestureRunning) {
          isGestureRunning = false;
          gestureTime = 0;
          onGestureEndRef.current?.();
        }
      } else if (isGestureRequested && !isGestureRunning) {
        isGestureRunning = true;
        gestureTime = 0;
      }

      let gatherWeight = 0;
      let wagPhase = 0;

      if (isGestureRunning) {
        gestureTime += 0.016;
        const progress = Math.min(1.0, gestureTime / GESTURE_DURATION);

        if (progress < 0.22) {
          // Phase 1: Particles gather & reorganize into hand (0.0 to 0.22)
          const p = progress / 0.22;
          gatherWeight = p * p * (3 - 2 * p); // smoothstep ease-in-out
          wagPhase = 0;
        } else if (progress < 0.32) {
          // Phase 2: Formed hand pose hold (0.22 to 0.32)
          gatherWeight = 1.0;
          wagPhase = 0;
        } else if (progress < 0.78) {
          // Phase 3: Raised index finger wags LEFT -> RIGHT -> LEFT -> RIGHT (2 full cycles) (0.32 to 0.78)
          gatherWeight = 1.0;
          wagPhase = (progress - 0.32) / (0.78 - 0.32);
        } else if (progress < 0.86) {
          // Phase 4: Settle hold (0.78 to 0.86)
          gatherWeight = 1.0;
          wagPhase = 0;
        } else if (progress < 1.0) {
          // Phase 5: Hand dissolves back into the orb (0.86 to 1.0)
          const p = (progress - 0.86) / (1.0 - 0.86);
          gatherWeight = 1.0 - (p * p * (3 - 2 * p));
          wagPhase = 0;
        } else {
          // Gesture complete: smoothly return to normal orb
          gatherWeight = 0;
          wagPhase = 0;
          isGestureRunning = false;
          gestureTime = 0;
          currentEmotion = 0;
          onGestureEndRef.current?.();
        }

        if (isGestureRunning) {
          currentEmotion = calculateGestureEmotionalProgress(gestureTime * 1000);
        }
      } else if (currentEmotion > 0.001) {
        // Interrupted or settling: smoothly decay back to 0 over ~750ms
        currentEmotion = Math.max(0, currentEmotion - 0.016 / 0.75);
      } else {
        currentEmotion = 0;
      }

      // Color transition
      const targetHex = visual ? SAVI_PALETTES[visual] : hex(target.colorVar);
      let tc = hexToRgb(targetHex);
      if (ambientLoop) {
        // Hold each palette, then smoothly blend into the next without restarting the shape.
        const cycle = isMotionReduced() ? 0 : (t % 12) / 4;
        const index = Math.floor(cycle);
        const blend = Math.max(0, ((cycle % 1) - 0.75) * 4);
        const ease = blend * blend * (3 - 2 * blend);
        const from = ambientColors[index];
        const to = ambientColors[(index + 1) % ambientColors.length];
        tc = { r: from.r + (to.r - from.r) * ease, g: from.g + (to.g - from.g) * ease, b: from.b + (to.b - from.b) * ease };
      }
      const colorEase = isMotionReduced() ? 1 : visual ? 0.065 : 0.05;
      const paletteEase = ambientLoop ? 1 : colorEase;

      if (currentEmotion > 0.001) {
        const emoCol = interpolateEmotionalColor(currentEmotion);
        // During gesture or decay, blend target towards emotional color
        const blendR = tc.r * (1 - currentEmotion) + emoCol.r * currentEmotion;
        const blendG = tc.g * (1 - currentEmotion) + emoCol.g * currentEmotion;
        const blendB = tc.b * (1 - currentEmotion) + emoCol.b * currentEmotion;
        const emoEase = isMotionReduced() ? 1 : 0.12;
        colorMix.r += (blendR - colorMix.r) * emoEase;
        colorMix.g += (blendG - colorMix.g) * emoEase;
        colorMix.b += (blendB - colorMix.b) * emoEase;
      } else {
        colorMix.r += (tc.r - colorMix.r) * paletteEase;
        colorMix.g += (tc.g - colorMix.g) * paletteEase;
        colorMix.b += (tc.b - colorMix.b) * paletteEase;
      }

      const col = `${Math.round(colorMix.r)},${Math.round(colorMix.g)},${Math.round(colorMix.b)}`;
      const sec = hueShift(colorMix, ambientLoop ? 0 : visual ? 10 : 38);
      const secCol = `${sec.r},${sec.g},${sec.b}`;

      if (!ctx) return;
      ctx.clearRect(-canvasPadding.left, -canvasPadding.top, W + canvasPadding.left + canvasPadding.right, H + canvasPadding.top + canvasPadding.bottom);

      // Controlled base radius and maximum safe distance to canvas edge
      const baseR = Math.min(W, H) * 0.28;
      const maxSafeRadius = Math.min(cx, cy); // Distance from center to closest canvas boundary
      let dynBaseR = baseR;
      let dynAmp = cur.amp;
      let dynLobes = cur.lobes;
      let dynPhase = phaseAccumulator;
      let dynRing = cur.ring;

      if (currentName === 'listening') {
        // The fluid perimeter and the shared voice pulse follow the same input.
        dynBaseR = baseR;
        dynAmp = (0.075 + speechActivity * 0.145) * (1 - listeningMix)
          + listeningAmplitude * listeningMix;
        dynPhase = phaseAccumulator;
        dynRing = 0;
        // No candidate ripple emissions: the layered liquid edges show activity.
      } else if (currentName === 'speaking') {
        // 4. AI IS SPEAKING:
        // Expressive speech cadence simulating natural vocal prosody
        const syllabicCadence = Math.sin(t * cfg.speechPulseSpeed);
        const phraseCadence = Math.sin(t * (cfg.speechPulseSpeed * 0.45) + 0.6);
        const breathCadence = Math.sin(t * 1.2 + 1.0);
        const speechEnvelope = Math.max(0, syllabicCadence * 0.45 + phraseCadence * 0.35 + breathCadence * 0.2);

        // Consistent motion: live audio from readSpeechLevel() reinforces prosody
        const activeEnergy = Math.max(speechEnvelope * 0.6, smoothedMicLevel);
        const speechExpansion = speechEnvelope * cfg.speechPulseMax;
        const voiceExpansion = smoothedMicLevel * cfg.micExpansionMax;
        const voiceMicroPulse = 0;
        const voiceBreathe = 0;
        const totalScale = Math.min(1.10, Math.max(0.98, 1 + voiceBreathe + Math.max(speechExpansion, voiceExpansion) + voiceMicroPulse));
        void totalScale;

        // The shared voice pulse below adds smooth expansion to the fluid surface.
        dynBaseR = baseR;
        dynAmp = (0.075 + speechActivity * 0.145) * (1 - listeningMix)
          + listeningAmplitude * listeningMix;
        dynPhase = phaseAccumulator;
        dynRing = Math.max(dynRing, Math.min(1.0, 0.75 + Math.max(speechEnvelope * 0.25, smoothedMicLevel * 0.25)));

        // Savi ripples during speech
        if (activeEnergy > 0.10) {
          rippleSpeechEnergy += elapsed * (0.8 + speechActivity * 2.8);
          if (rippleSpeechEnergy >= 0.85 && rippleCadenceCooldown <= 0 && activeRipples.length < 3) {
            rippleSpeechEnergy = 0;
            rippleCadenceCooldown = 1.15;
            activeRipples.push({
              progress: 0,
              speed: 0.32,
              maxDistance: dynBaseR * (0.42 + Math.min(0.28, speechActivity * 0.30)),
              peakAlpha: 0.28 + Math.min(0.20, speechActivity * 0.22),
              type: 'savi'
            });
          }
        }
      } else if (currentName === 'thinking') {
        // 3. THINKING:
        // Slower, intelligent dual-harmonic rhythm
        const cognitivePulse = Math.sin(t * cfg.thinkingSpeed) * 0.035 + Math.sin(t * 0.65) * 0.018;
        dynBaseR = baseR * (1 + cognitivePulse);
        dynAmp = cur.amp + Math.sin(t * 1.8) * 0.012;
        dynPhase = phaseAccumulator;
        dynRing = Math.max(0, dynRing * 0.85);
      } else {
        // 1. IDLE / GESTURE_NO:
        // Mostly calm, gentle organic breathing with subtle irritated tension pulse during gesture wag
        const idleBreathing = Math.sin(t * cur.speed * 0.9) * cfg.idleBreathingAmp;
        const irritatedPulse = (Math.sin(t * 7.2) * 0.018 + Math.sin(t * 14.4) * 0.008) * currentEmotion;
        dynBaseR = baseR * (1 + idleBreathing + irritatedPulse);
        dynAmp = cur.amp + currentEmotion * 0.035;
        dynPhase = phaseAccumulator;
        dynRing = Math.max(0, dynRing * 0.85);
      }

      // Carry only the listening surface into its exit transition, then return
      // completely to the destination state's existing appearance.
      if (!isSpeech && listeningMix > 0) {
        dynAmp = dynAmp * (1 - listeningMix) + listeningAmplitude * listeningMix;
      }

      // Update active ripples: progress advances smoothly with elapsed time
      rippleCadenceCooldown = Math.max(0, rippleCadenceCooldown - elapsed);

      for (let i = activeRipples.length - 1; i >= 0; i--) {
        const r = activeRipples[i];
        r.progress += elapsed * r.speed;
        if (r.progress >= 1.0) {
          activeRipples.splice(i, 1);
        }
      }

      // Thin circular lines / ripples: gently pulsate outward like ripples on calm water
      // Existing ripples naturally fade away during pauses instead of abruptly stopping
      if (activeRipples.length > 0 || dynRing > 0.02) {
        for (let i = 0; i < activeRipples.length; i++) {
          if (currentName === 'listening') continue;
          const r = activeRipples[i];
          const radius = dynBaseR * 1.03 + r.progress * r.maxDistance;
          // Opacity rises softly near orb boundary, peaks at ~18%, then gradually dissolves to 0
          const alpha = r.peakAlpha * Math.sin(Math.pow(r.progress, 0.45) * Math.PI) * (1 - r.progress * 0.90);
          if (alpha > 0.003) {
            ctx.strokeStyle = r.type === 'savi'
              ? `rgba(255,179,71,${alpha})`   // Soft warm saffron for Savi
              : `rgba(79,191,131,${alpha})`;  // Soft luminous emerald for Candidate
            ctx.lineWidth = 0.85;             // Thin, delicate, elegant line
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Soft halo background: static in listening, no pulsation
      const haloBoost = currentName === 'speaking' ? 0.06 : 0;
      let haloAlpha = 0.26 + haloBoost + currentEmotion * 0.08;
      if (visual) {
        haloAlpha += Math.sin(t * 0.7) * 0.025;
      }
      // Cap haloR at maxSafeRadius * 0.88 so it NEVER touches or exceeds the canvas boundary
      const haloR = Math.min(maxSafeRadius * 0.88, dynBaseR * 2.1);

      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      halo.addColorStop(0,    `rgba(${col},${haloAlpha})`);
      halo.addColorStop(0.30, `rgba(${col},${haloAlpha * 0.55})`);
      halo.addColorStop(0.65, `rgba(${col},${haloAlpha * 0.18})`);
      halo.addColorStop(0.88, `rgba(${col},${haloAlpha * 0.04})`);
      halo.addColorStop(1,    `rgba(${col},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Light motes (particles) - orbiting in normal state, forming Savi's hand during gesture
      const handCoords: { x: number; y: number }[] = [];

      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        const ang = m.phase + t * m.speed * m.dir;
        const moteBonus = currentName === 'listening' ? smoothedMicLevel * 0.12 : 0;
        // Keep motes comfortably within canvas bounds
        const r = Math.min(maxSafeRadius * 0.78, dynBaseR * m.radiusF * (1 + dynAmp * 0.4 + moteBonus));
        const mx = cx + Math.cos(ang) * r;
        const my = cy + Math.sin(ang * 1.15) * r * 0.9;

        let px = mx;
        let py = my;

        if (gatherWeight > 0.001) {
          const target = HAND_TARGET_TEMPLATES[i % HAND_TARGET_TEMPLATES.length];
          // Only temporary gesture particles use this radius-relative anchor.
          const handAnchorX = cx - dynBaseR * 0.82;
          const handAnchorY = cy + dynBaseR * 0.25;
          const handScale = 1.5625; // 25% larger than the previous 1.25x hand
          // At viewport edges, fit only the gesture; keep the wrist anchor fixed.
          const renderScale = Math.min(handScale, calculateGestureRenderScale(dynBaseR, cx, cy, canvasPadding));
          const wag = calculateWagOffset(target, wagPhase, dynBaseR * renderScale);
          const hx = handAnchorX + target.x * dynBaseR * renderScale + wag.dx;
          const hy = handAnchorY + target.y * dynBaseR * renderScale + wag.dy;
          px = mx + (hx - mx) * gatherWeight;
          py = my + (hy - my) * gatherWeight;
          handCoords.push({ x: px, y: py });
        }

        const burstAge = burstStartedRef.current === null ? 2 : (performance.now() - burstStartedRef.current) / 1000;
        const burst = burstAge < 1.4 && !isMotionReduced() && gatherWeight < 0.001;
        if (burst) {
          const progress = burstAge / 1.4;
          const launch = 1 - Math.pow(1 - Math.min(1, progress / .65), 3);
          const burstAngle = (i / motes.length) * Math.PI * 2;
          const distance = dynBaseR * (.7 + .75 * launch);
          px = cx + Math.cos(burstAngle) * distance;
          py = cy + Math.sin(burstAngle) * distance + dynBaseR * .22 * progress * progress;
          px = Math.max(8, Math.min(W - 8, px));
          py = Math.max(8, Math.min(H - 8, py));
        }
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.6 + (currentName === 'listening' ? smoothedMicLevel * 1.2 : 0)) + m.phase));
        const alpha = burst ? Math.max(0, 1 - burstAge / 1.4) : (0.55 * twinkle) * (1 - gatherWeight * 0.3) + 0.88 * gatherWeight;
        const pSize = m.size * (burst ? 1.6 : 1 + gatherWeight * 0.5);

        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${secCol},${alpha})`;
        ctx.shadowColor = `rgba(${secCol},${0.8 + gatherWeight * 0.2})`;
        ctx.shadowBlur = 5 + gatherWeight * 4 + currentEmotion * 3;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Constellation ligaments connecting hand structure when formed
      if (gatherWeight > 0.35 && handCoords.length >= 56) {
        ctx.save();
        ctx.strokeStyle = `rgba(${secCol},${0.25 * gatherWeight})`;
        ctx.lineWidth = 1.0;

        // Index finger column
        ctx.beginPath();
        ctx.moveTo(handCoords[38].x, handCoords[38].y);
        ctx.lineTo(handCoords[40].x, handCoords[40].y);
        ctx.lineTo(handCoords[43].x, handCoords[43].y);
        ctx.lineTo(handCoords[46].x, handCoords[46].y);
        ctx.lineTo(handCoords[49].x, handCoords[49].y);
        ctx.lineTo(handCoords[52].x, handCoords[52].y);
        ctx.lineTo(handCoords[53].x, handCoords[53].y);
        ctx.lineTo(handCoords[54].x, handCoords[54].y);
        ctx.lineTo(handCoords[51].x, handCoords[51].y);
        ctx.lineTo(handCoords[48].x, handCoords[48].y);
        ctx.lineTo(handCoords[45].x, handCoords[45].y);
        ctx.lineTo(handCoords[42].x, handCoords[42].y);
        ctx.lineTo(handCoords[39].x, handCoords[39].y);
        ctx.stroke();

        // Curled knuckles
        ctx.beginPath();
        ctx.moveTo(handCoords[24].x, handCoords[24].y);
        ctx.lineTo(handCoords[25].x, handCoords[25].y);
        ctx.lineTo(handCoords[26].x, handCoords[26].y);
        ctx.lineTo(handCoords[30].x, handCoords[30].y);
        ctx.lineTo(handCoords[35].x, handCoords[35].y);
        ctx.stroke();

        // Thumb fold
        ctx.beginPath();
        ctx.moveTo(handCoords[18].x, handCoords[18].y);
        ctx.lineTo(handCoords[19].x, handCoords[19].y);
        ctx.lineTo(handCoords[20].x, handCoords[20].y);
        ctx.lineTo(handCoords[21].x, handCoords[21].y);
        ctx.lineTo(handCoords[22].x, handCoords[22].y);
        ctx.lineTo(handCoords[23].x, handCoords[23].y);
        ctx.stroke();

        ctx.restore();
      }


      // Center is completely stationary for listening and speaking (no left/right sway or orbit)
      const floatX = isSpeech ? 0 : visual ? Math.sin(t * 0.35) * dynBaseR * 0.08 : 0;
      const floatY = isSpeech ? 0 : visual ? Math.cos(t * 0.28) * dynBaseR * 0.06 : 0;
      const centerX = cx + floatX + followX;
      const centerY = cy + floatY + followY;

      // Transparent fluid layers behind the orb (translucent echoes/silhouettes inspired by reference)
      function layer(scaleMult: number, alphaMult: number, phaseOffset: number, lobeOffset: number, tint?: string) {
        const isSpeech = currentName === 'listening' || currentName === 'speaking';
        const effLobes = isSpeech ? dynLobes : dynLobes + lobeOffset;
        const phase = dynPhase * (0.86 + lobeOffset * 0.08) - phaseOffset;
        // Differential layer rotation: veils circulate at varying rates
        const layerRot = ambientLoop
          ? rot * (1 + lobeOffset * 0.18) + Math.sin(t * 0.45 + phaseOffset) * 0.22
          : visual
          ? rot + Math.sin(t * 0.22 + phaseOffset) * 0.16
          : isSpeech
          ? rot * (1.0 + lobeOffset * 0.12) + phaseOffset * 0.08
          : rot;

        // Dynamic separation: background layers separate slightly during active speech,
        // and settle closer to the primary form when speech stops
        const sepFactor = isSpeech ? 0.60 + listeningLevel * 0.15 : 0.48;
        const sMult = 1.0 + (scaleMult - 1.0) * sepFactor;
        const layerAmp = isSpeech ? dynAmp * (0.75 + lobeOffset * 0.08) : dynAmp;
        const pts = blobPoints(dynBaseR * sMult, layerAmp, effLobes, phase, listeningMix > 0 ? 70 : 64, layerRot, lobeOffset === 2);
        smoothPath(pts);
        if (!ctx) return;

        // Original translucent color treatment, shared by every state.
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, dynBaseR * 1.15 * sMult);
        const baseColor = tint || col;
        g.addColorStop(0,    `rgba(${baseColor},${0.85 * alphaMult})`);
        g.addColorStop(0.55, `rgba(${secCol},${0.45 * alphaMult})`);
        g.addColorStop(1,    `rgba(${baseColor},${0.08 * alphaMult})`);
        ctx.fillStyle = g;
        ctx.fill();

        // Delicate filament boundary contour (soap-bubble / water meniscus sheen)
        const strokeAlpha = 0.35 * alphaMult;
        ctx.strokeStyle = `rgba(${baseColor},${strokeAlpha})`;
        ctx.lineWidth = 0.85;
        ctx.stroke();
      }
      // Outer translucent botanical/sage and warm amber layers (inspired by reference image)
      const outerTint = visual
        ? col
        : currentEmotion > 0.01
          ? `${Math.round(4 + (180 - 4) * currentEmotion)},${Math.round(98 + (60 - 98) * currentEmotion)},${Math.round(65 + (40 - 65) * currentEmotion)}`
          : '4,98,65';
      layer(1.48, 0.22, 0.85, 2, outerTint);
      layer(1.36, 0.26, 0.60, 1);
      layer(1.22, 0.34, 0.35, 0);
      // Warm amber / honey translucent accent layer (inspired by reference image)
      layer(1.12, visual ? 0.20 : 0.38, -0.45, 1, visual ? col : '255,195,112');

      // Core blob - contained mass of luminous water suspended in space
      const pts = blobPoints(dynBaseR, dynAmp, dynLobes, dynPhase, listeningMix > 0 ? 84 : 72, rot);
      smoothPath(pts);

      // Restore the deployed orb's creamy, diffused illumination without
      // reintroducing the removed inner sphere.
      const fill = ctx.createRadialGradient(centerX, centerY, 0, cx, cy, dynBaseR * 1.15);
      fill.addColorStop(0,    `rgba(${col},0.92)`);
      fill.addColorStop(0.35, `rgba(245,238,219,0.45)`);
      fill.addColorStop(0.70, `rgba(${secCol},0.55)`);
      fill.addColorStop(1,    `rgba(${col},0.16)`);
      ctx.fillStyle = fill;
      ctx.shadowColor = `rgba(${col},${0.45 + currentEmotion * 0.15})`;
      ctx.shadowBlur = 18 + currentEmotion * 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Defined surface tension rim: soft but clearly formed organic boundary
      smoothPath(pts);
      const rimAlpha = 0.65;
      ctx.strokeStyle = `rgba(${col},${rimAlpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (!isMotionReduced()) animId = requestAnimationFrame(draw);
    }

    const handleMotionChange = () => {
      cancelAnimationFrame(animId);
      draw();
    };
    redrawRef.current = () => { if (isMotionReduced()) draw(); };
    if (respectReducedMotion) motionQuery.addEventListener('change', handleMotionChange);
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      wrap.removeEventListener('pointermove', movePointer);
      wrap.removeEventListener('pointerleave', leavePointer);
      wrap.removeEventListener('pointerdown', pressPointer);
      wrap.removeEventListener('pointercancel', cancelPointer);
      wrap.removeEventListener('lostpointercapture', cancelPointer);
      window.removeEventListener('pointerup', releasePointer);
      redrawRef.current = null;
      if (respectReducedMotion) motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, [respectReducedMotion, ambientLoop]);

  return (
    <div
      className={`canvas-wrap ${compact ? 'canvas-wrap--compact' : ''} ${className || ''}`}
      ref={wrapRef}
      onClick={onTap}
      id="creature"
    >
      <canvas ref={canvasRef} className="voice-canvas" id="c" />
    </div>
  );
};

