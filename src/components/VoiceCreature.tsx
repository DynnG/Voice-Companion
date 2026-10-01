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
  speechPulseSpeed?: number;    // Frequency of procedural AI speech cadence (default 4.8)
  speechPulseMax?: number;      // Maximum expansion during AI speech (default 0.06)
  thinkingSpeed?: number;       // Speed of cognitive pulsation (default 1.4)
  idleBreathingAmp?: number;    // Subtle breathing amplitude in idle state (default 0.015)
}

const DEFAULT_CONFIG: Required<VoiceReactiveConfig> = {
  micSensitivity: 1.0,
  micExpansionMax: 0.08,        // Subtly bounded: 1.00 -> 1.08 (up to ~1.10 max)
  micLobeDistortionMax: 0.05,   // Gentle contour ripple
  speechPulseSpeed: 4.8,
  speechPulseMax: 0.06,         // Subtly bounded for AI voice
  thinkingSpeed: 1.4,
  idleBreathingAmp: 0.015,      // Very gentle organic breathing (+-1.5%)
};

export interface VoiceCreatureProps {
  state: VoiceState;
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
  idle:       { colorVar: '--glow-idle', amp: 0.06, speed: 0.25, lobes: 3, ring: 0 },
  listening:  { colorVar: '--glow-a',    amp: 0.10, speed: 0.45, lobes: 5, ring: 0 },
  thinking:   { colorVar: '--glow-b',    amp: 0.09, speed: 1.3,  lobes: 7, ring: 0 },
  speaking:   { colorVar: '--glow-c',    amp: 0.20, speed: 0.9,  lobes: 4, ring: 1 },
  gesture_no: { colorVar: '--glow-b',    amp: 0.08, speed: 0.6,  lobes: 4, ring: 0 },
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
  ambientLoop = false
}) => {
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
    let lastFrameTime = performance.now();
    const ambientColors = ['#9DBDA4', '#A293C2', '#FFD66B'].map(hexToRgb);

    function hex(v: string): string {
      return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#4b5675';
    }

    function blobPoints(baseR: number, amp: number, lobes: number, phase: number, n: number, rotation = rot) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = baseR * (1
          + amp * Math.sin(lobes * a + phase)
          + amp * 0.35 * Math.sin((lobes + 2) * a - phase * 1.4));
        pts.push({ x: cx + Math.cos(a + rotation) * r, y: cy + Math.sin(a + rotation) * r });
      }
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
      t += ambientLoop ? (isMotionReduced() ? 0 : elapsed) : 0.016;
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
      if (currentName === 'listening') {
        const fromRef = externalAudioRef.current?.current;
        const fromProp = audioLevelPropRef.current;
        const val = typeof fromRef === 'number' ? fromRef : fromProp;
        if (typeof val === 'number' && !isNaN(val)) {
          // Clamped input range [0.0, 1.0]
          rawMicInput = Math.max(0, Math.min(1.0, val * cfg.micSensitivity));
        }
      }

      // Asymmetrical attack / decay envelope follower (0.28 attack, 0.10 decay)
      if (rawMicInput > smoothedMicLevel) {
        smoothedMicLevel += (rawMicInput - smoothedMicLevel) * 0.28;
      } else {
        smoothedMicLevel += (rawMicInput - smoothedMicLevel) * 0.10;
      }
      if (smoothedMicLevel < 0.001) smoothedMicLevel = 0;
      smoothedMicLevel = Math.min(1.0, smoothedMicLevel);

      // Lerp baseline state attributes
      cur.amp += (target.amp - cur.amp) * 0.05;
      cur.speed += (target.speed - cur.speed) * 0.05;
      cur.lobes += (target.lobes - cur.lobes) * 0.08;
      cur.ring += (target.ring - cur.ring) * 0.06;
      rot += ambientLoop ? (isMotionReduced() ? 0 : elapsed * 0.32) : 0.0028 * cur.speed;

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
      let dynLobes = Math.round(cur.lobes);
      let dynPhase = t * cur.speed * 1.2;
      let dynRing = cur.ring;

      if (currentName === 'listening') {
        // 2. USER IS SPEAKING:
        // Subtle, restrained scale range: 1.00 -> ~1.08 / 1.10 max
        const voiceExpansion = smoothedMicLevel * cfg.micExpansionMax;
        const voiceMicroPulse = Math.sin(t * 6.5) * (smoothedMicLevel * 0.018);
        const voiceBreathe = Math.sin(t * cur.speed * 0.9) * 0.012;

        const totalScale = Math.min(1.10, Math.max(0.98, 1 + voiceBreathe + voiceExpansion + voiceMicroPulse));
        dynBaseR = baseR * totalScale;
        dynAmp = cur.amp + smoothedMicLevel * cfg.micLobeDistortionMax;
        dynPhase = t * (cur.speed + smoothedMicLevel * 0.8) * 1.2;

        // In listening state: subtle acoustic ripple triggers when candidate speaks
        if (smoothedMicLevel > 0.03) {
          dynRing = Math.max(dynRing, Math.min(1.0, smoothedMicLevel * 2.5));
        } else {
          dynRing = Math.max(0, dynRing * 0.90);
        }
      } else if (currentName === 'thinking') {
        // 3. THINKING:
        // Slower, intelligent dual-harmonic rhythm
        const cognitivePulse = Math.sin(t * cfg.thinkingSpeed) * 0.035 + Math.sin(t * 0.65) * 0.018;
        dynBaseR = baseR * (1 + cognitivePulse);
        dynAmp = cur.amp + Math.sin(t * 1.8) * 0.012;
        dynPhase = t * cur.speed * 1.1;
        dynRing = Math.max(0, dynRing * 0.85);
      } else if (currentName === 'speaking') {
        // 4. AI IS SPEAKING:
        // Expressive speech cadence simulating natural vocal prosody
        const syllabicCadence = Math.sin(t * cfg.speechPulseSpeed);
        const phraseCadence = Math.sin(t * (cfg.speechPulseSpeed * 0.45) + 0.6);
        const breathCadence = Math.sin(t * 1.2 + 1.0);
        const speechEnvelope = Math.max(0, syllabicCadence * 0.45 + phraseCadence * 0.35 + breathCadence * 0.2);

        const speechExpansion = speechEnvelope * cfg.speechPulseMax;
        dynBaseR = baseR * (1.02 + speechExpansion);
        dynAmp = cur.amp + speechEnvelope * 0.04;
        dynPhase = t * (cur.speed + speechEnvelope * 0.25) * 1.2;
        dynRing = Math.max(dynRing, Math.min(1.0, 0.75 + speechEnvelope * 0.25));
      } else {
        // 1. IDLE / GESTURE_NO:
        // Mostly calm, gentle organic breathing with subtle irritated tension pulse during gesture wag
        const idleBreathing = Math.sin(t * cur.speed * 0.9) * cfg.idleBreathingAmp;
        const irritatedPulse = (Math.sin(t * 7.2) * 0.018 + Math.sin(t * 14.4) * 0.008) * currentEmotion;
        dynBaseR = baseR * (1 + idleBreathing + irritatedPulse);
        dynAmp = cur.amp + currentEmotion * 0.035;
        dynPhase = t * (cur.speed + currentEmotion * 0.4) * 1.2;
        dynRing = Math.max(0, dynRing * 0.85);
      }

      // Subtle Acoustic Ripple: Only active when someone is actively speaking (User or Savi)
      const isUserSpeaking = currentName === 'listening' && (smoothedMicLevel > 0.03 || Boolean(externalAudioRef.current?.current && externalAudioRef.current.current > 0.01));
      const isSaviSpeaking = currentName === 'speaking';
      const isActivelyTalking = isUserSpeaking || isSaviSpeaking;

      if (isActivelyTalking && dynRing > 0.02) {
        const loops = 2;
        for (let p = 0; p < loops; p++) {
          const ph = ((t * 0.32 + p / loops) % 1);
          // Perfectly circular geometry expanding gently outward from orb
          const r = dynBaseR * 1.08 + ph * dynBaseR * 0.44;
          // Extremely subtle opacity: soft bell-curve, fading to 0 at edge
          const alpha = Math.sin(ph * Math.PI) * 0.18 * dynRing;
          if (alpha > 0.004) {
            ctx.strokeStyle = isSaviSpeaking
              ? `rgba(255,179,71,${alpha})`   // Soft warm saffron for Savi
              : `rgba(79,191,131,${alpha})`;  // Soft emerald for Candidate
            ctx.lineWidth = 0.85;             // Very thin circular line
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Soft halo background
      // MUST guarantee that halo radius is safely smaller than maxSafeRadius (canvas edge),
      // and that the radial gradient smoothly fades to 100% transparent before reaching maxSafeRadius.
      const haloBoost = currentName === 'listening' ? smoothedMicLevel * 0.12 : currentName === 'speaking' ? 0.06 : 0;
      let haloAlpha = 0.26 + haloBoost + currentEmotion * 0.08;
      if (visual) {
        haloAlpha += Math.sin(t * 0.7) * 0.025;
      }
      // Cap haloR at maxSafeRadius * 0.88 so it NEVER touches or exceeds the canvas boundary
      const haloR = Math.min(maxSafeRadius * 0.88, dynBaseR * (2.1 + (currentName === 'listening' ? smoothedMicLevel * 0.15 : 0)));
      
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

        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.6 + (currentName === 'listening' ? smoothedMicLevel * 1.2 : 0)) + m.phase));
        const alpha = (0.55 * twinkle) * (1 - gatherWeight * 0.3) + 0.88 * gatherWeight;
        const pSize = m.size * (1 + gatherWeight * 0.5);

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


      // Layered echoes - multiple overlapping translucent organic layers
      function layer(scaleMult: number, alphaMult: number, phaseOffset: number, lobeOffset: number, tint?: string) {
        const phase = visual ? t * cur.speed * (1.2 + lobeOffset * 0.14) - phaseOffset : dynPhase - phaseOffset;
        const rotation = ambientLoop
          ? rot * (1 + lobeOffset * 0.18) + Math.sin(t * 0.45 + phaseOffset) * 0.22
          : visual ? rot + Math.sin(t * 0.22 + phaseOffset) * 0.16 : rot;
        const pts = blobPoints(dynBaseR * scaleMult, dynAmp, dynLobes + lobeOffset, phase, 64, rotation);
        smoothPath(pts);
        if (!ctx) return;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, dynBaseR * 1.15 * scaleMult);
        const baseColor = tint || col;
        g.addColorStop(0,   `rgba(${baseColor},${0.85 * alphaMult})`);
        g.addColorStop(0.55, `rgba(${secCol},${0.45 * alphaMult})`);
        g.addColorStop(1,   `rgba(${baseColor},${0.08 * alphaMult})`);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = `rgba(${baseColor},${0.35 * alphaMult})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      // Outer translucent botanical/warm layer (adapts smoothly during emotional irritation)
      const outerTint = visual
        ? col
        : currentEmotion > 0.01
          ? `${Math.round(4 + (180 - 4) * currentEmotion)},${Math.round(98 + (60 - 98) * currentEmotion)},${Math.round(65 + (40 - 65) * currentEmotion)}`
          : '4,98,65';
      layer(1.42, 0.22, 0.75, 2, outerTint);
      layer(1.36, 0.28, 0.55, 1);
      layer(1.18, 0.45, 0.28, 0);
      // Warm amber / cream translucent accent layer
      layer(1.08, visual ? 0.20 : 0.38, -0.42, 1, visual ? col : '255,195,112');

      // Core blob
      const pts = blobPoints(dynBaseR, dynAmp, dynLobes, dynPhase, 64);
      smoothPath(pts);
      const centerX = cx + (visual ? Math.sin(t * 0.35) * dynBaseR * 0.08 : 0);
      const centerY = cy + (visual ? Math.cos(t * 0.28) * dynBaseR * 0.06 : 0);
      const fill = ctx.createRadialGradient(centerX, centerY, 0, cx, cy, dynBaseR * 1.15);
      fill.addColorStop(0,   `rgba(${col},0.92)`);
      fill.addColorStop(0.35, `rgba(245,238,219,0.45)`);
      fill.addColorStop(0.70, `rgba(${secCol},0.55)`);
      fill.addColorStop(1,   `rgba(${col},0.16)`);
      ctx.fillStyle = fill;
      ctx.shadowColor = `rgba(${col},${0.45 + currentEmotion * 0.15})`;
      ctx.shadowBlur = 18 + currentEmotion * 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Crisp thin rim
      ctx.strokeStyle = `rgba(${col},0.65)`;
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

