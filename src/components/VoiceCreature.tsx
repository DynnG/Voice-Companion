import React, { useEffect, useRef } from 'react';
import { VoiceState } from '../types/conversation';

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
}

const STATE_CONFIG: Record<VoiceState, { colorVar: string; amp: number; speed: number; lobes: number; ring: number }> = {
  idle:       { colorVar: '--glow-idle', amp: 0.06, speed: 0.25, lobes: 3, ring: 0 },
  listening:  { colorVar: '--glow-a',    amp: 0.10, speed: 0.45, lobes: 5, ring: 0 },
  thinking:   { colorVar: '--glow-b',    amp: 0.09, speed: 1.3,  lobes: 7, ring: 0 },
  speaking:   { colorVar: '--glow-c',    amp: 0.20, speed: 0.9,  lobes: 4, ring: 1 },
  gesture_no: { colorVar: '--glow-b',    amp: 0.08, speed: 0.6,  lobes: 4, ring: 0 },
};

export interface HandTargetPoint {
  x: number;      // normalized relative to baseR [-1.0, 1.0]
  y: number;      // normalized relative to baseR (negative = above orb center)
  part: 'wrist' | 'palm' | 'thumb' | 'curled' | 'index';
  isWagging?: boolean;
}

export const HAND_TARGET_TEMPLATES: readonly HandTargetPoint[] = [
  // 1. Wrist / Attachment to top of Orb (10 points) - rooted in orb upper boundary
  { x: -0.22, y: -0.48, part: 'wrist' },
  { x: -0.15, y: -0.46, part: 'wrist' },
  { x: -0.07, y: -0.45, part: 'wrist' },
  { x:  0.00, y: -0.45, part: 'wrist' },
  { x:  0.08, y: -0.46, part: 'wrist' },
  { x:  0.15, y: -0.48, part: 'wrist' },
  { x: -0.20, y: -0.58, part: 'wrist' },
  { x: -0.08, y: -0.56, part: 'wrist' },
  { x:  0.06, y: -0.56, part: 'wrist' },
  { x:  0.16, y: -0.58, part: 'wrist' },

  // 2. Palm body (8 points)
  { x: -0.25, y: -0.68, part: 'palm' },
  { x: -0.12, y: -0.68, part: 'palm' },
  { x:  0.02, y: -0.68, part: 'palm' },
  { x:  0.14, y: -0.68, part: 'palm' },
  { x: -0.26, y: -0.80, part: 'palm' },
  { x: -0.14, y: -0.80, part: 'palm' },
  { x:  0.00, y: -0.80, part: 'palm' },
  { x:  0.12, y: -0.80, part: 'palm' },

  // 3. Thumb folded across the front of palm (6 points)
  { x:  0.22, y: -0.66, part: 'thumb' },
  { x:  0.20, y: -0.74, part: 'thumb' },
  { x:  0.12, y: -0.79, part: 'thumb' },
  { x:  0.03, y: -0.82, part: 'thumb' },
  { x: -0.05, y: -0.82, part: 'thumb' },
  { x: -0.12, y: -0.79, part: 'thumb' },

  // 4. Curled fingers: Pinky, Ring, Middle (14 points)
  // Pinky (4 points)
  { x: -0.28, y: -0.90, part: 'curled' },
  { x: -0.30, y: -0.99, part: 'curled' },
  { x: -0.24, y: -1.04, part: 'curled' },
  { x: -0.20, y: -0.95, part: 'curled' },
  // Ring finger (5 points)
  { x: -0.18, y: -0.92, part: 'curled' },
  { x: -0.20, y: -1.05, part: 'curled' },
  { x: -0.15, y: -1.12, part: 'curled' },
  { x: -0.10, y: -1.07, part: 'curled' },
  { x: -0.11, y: -0.94, part: 'curled' },
  // Middle finger (5 points)
  { x: -0.07, y: -0.93, part: 'curled' },
  { x: -0.08, y: -1.09, part: 'curled' },
  { x: -0.04, y: -1.18, part: 'curled' },
  { x:  0.02, y: -1.13, part: 'curled' },
  { x:  0.01, y: -0.95, part: 'curled' },

  // 5. Raised Index Finger (18 points) - points upwards and wags
  // Knuckle base
  { x:  0.05, y: -0.94, part: 'index', isWagging: true },
  { x:  0.13, y: -0.94, part: 'index', isWagging: true },
  // Lower phalanx column
  { x:  0.04, y: -1.05, part: 'index', isWagging: true },
  { x:  0.09, y: -1.05, part: 'index', isWagging: true },
  { x:  0.14, y: -1.05, part: 'index', isWagging: true },
  // Middle phalanx column
  { x:  0.04, y: -1.18, part: 'index', isWagging: true },
  { x:  0.09, y: -1.18, part: 'index', isWagging: true },
  { x:  0.14, y: -1.18, part: 'index', isWagging: true },
  // Upper phalanx column
  { x:  0.04, y: -1.32, part: 'index', isWagging: true },
  { x:  0.09, y: -1.32, part: 'index', isWagging: true },
  { x:  0.14, y: -1.32, part: 'index', isWagging: true },
  // Near fingertip
  { x:  0.05, y: -1.45, part: 'index', isWagging: true },
  { x:  0.09, y: -1.45, part: 'index', isWagging: true },
  { x:  0.13, y: -1.45, part: 'index', isWagging: true },
  // Rounded fingertip arc
  { x:  0.06, y: -1.54, part: 'index', isWagging: true },
  { x:  0.09, y: -1.58, part: 'index', isWagging: true },
  { x:  0.12, y: -1.54, part: 'index', isWagging: true },
  { x:  0.09, y: -1.50, part: 'index', isWagging: true },
];

export function calculateWagOffset(point: HandTargetPoint, wagPhase: number, baseR: number): { dx: number; dy: number } {
  if (!point.isWagging) {
    return { dx: 0, dy: 0 };
  }
  const knuckleY = -0.94;
  const h = Math.max(0, (knuckleY - point.y) / 0.64);
  const sway = Math.sin(wagPhase * Math.PI * 4); // 2 complete wag cycles
  const dx = sway * baseR * 0.26 * h;
  const dy = (1 - Math.cos(sway * 0.35)) * baseR * 0.12 * h;
  return { dx, dy };
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
  respectReducedMotion = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const currentStateRef = useRef<VoiceState>(state);
  const gesturePropRef = useRef<'no' | null | undefined>(gesture);
  const onGestureEndRef = useRef<(() => void) | undefined>(onGestureEnd);
  const audioLevelPropRef = useRef<number | undefined>(audioLevel);
  const externalAudioRef = useRef<React.MutableRefObject<number> | React.RefObject<number> | undefined>(audioLevelRef);
  const configRef = useRef<VoiceReactiveConfig | undefined>(config);

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

    function resize() {
      if (!wrap || !canvas || !ctx) return;
      const rect = wrap.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2;
      cy = H / 2;
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (isMotionReduced()) draw();
    });
    resizeObserver.observe(wrap);
    resize();

    let cur = {
      amp: STATE_CONFIG.idle.amp,
      speed: STATE_CONFIG.idle.speed,
      lobes: STATE_CONFIG.idle.lobes,
      ring: 0
    };
    let colorMix = { r: 75, g: 86, b: 117 };
    let smoothedMicLevel = 0;

    let gestureTime = 0;
    let isGestureRunning = false;
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

    function hex(v: string): string {
      return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#4b5675';
    }

    function blobPoints(baseR: number, amp: number, lobes: number, phase: number, n: number) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = baseR * (1
          + amp * Math.sin(lobes * a + phase)
          + amp * 0.35 * Math.sin((lobes + 2) * a - phase * 1.4));
        pts.push({ x: cx + Math.cos(a + rot) * r, y: cy + Math.sin(a + rot) * r });
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
      t += 0.016;
      const currentName = currentStateRef.current;
      const target = STATE_CONFIG[currentName];
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
      rot += 0.0028 * cur.speed;

      // Color transition
      const targetHex = hex(target.colorVar);
      const tc = hexToRgb(targetHex);
      const colorEase = isMotionReduced() ? 1 : 0.05;
      colorMix.r += (tc.r - colorMix.r) * colorEase;
      colorMix.g += (tc.g - colorMix.g) * colorEase;
      colorMix.b += (tc.b - colorMix.b) * colorEase;

      const col = `${Math.round(colorMix.r)},${Math.round(colorMix.g)},${Math.round(colorMix.b)}`;
      const sec = hueShift(colorMix, 38);
      const secCol = `${sec.r},${sec.g},${sec.b}`;

      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

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
        // 1. IDLE:
        // Mostly calm, gentle organic breathing
        const idleBreathing = Math.sin(t * cur.speed * 0.9) * cfg.idleBreathingAmp;
        dynBaseR = baseR * (1 + idleBreathing);
        dynAmp = cur.amp;
        dynPhase = t * cur.speed * 1.2;
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
      const haloAlpha = 0.26 + haloBoost;
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

      // 5. Gesture "NO / STAY ON TOPIC" Lifecycle
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
          onGestureEndRef.current?.();
        }
      }

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
          const wag = calculateWagOffset(target, wagPhase, dynBaseR);
          const hx = cx + target.x * dynBaseR + wag.dx;
          const hy = cy + target.y * dynBaseR + wag.dy;
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
        ctx.shadowBlur = 5 + gatherWeight * 4;
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
        const phase = dynPhase - phaseOffset;
        const pts = blobPoints(dynBaseR * scaleMult, dynAmp, dynLobes + lobeOffset, phase, 64);
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
      // Outer translucent botanical/forest layer
      layer(1.42, 0.22, 0.75, 2, '4,98,65');
      layer(1.36, 0.28, 0.55, 1);
      layer(1.18, 0.45, 0.28, 0);
      // Warm amber / cream translucent accent layer
      layer(1.08, 0.38, -0.42, 1, '255,195,112');

      // Core blob
      const pts = blobPoints(dynBaseR, dynAmp, dynLobes, dynPhase, 64);
      smoothPath(pts);
      const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, dynBaseR * 1.15);
      fill.addColorStop(0,   `rgba(${col},0.92)`);
      fill.addColorStop(0.35, `rgba(245,238,219,0.45)`);
      fill.addColorStop(0.70, `rgba(${secCol},0.55)`);
      fill.addColorStop(1,   `rgba(${col},0.16)`);
      ctx.fillStyle = fill;
      ctx.shadowColor = `rgba(${col},0.45)`;
      ctx.shadowBlur = 18;
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
    if (respectReducedMotion) motionQuery.addEventListener('change', handleMotionChange);
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      if (respectReducedMotion) motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, [respectReducedMotion]);

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

