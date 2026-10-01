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
  idle:      { colorVar: '--glow-idle', amp: 0.06, speed: 0.25, lobes: 3, ring: 0 },
  listening: { colorVar: '--glow-a',    amp: 0.10, speed: 0.45, lobes: 5, ring: 0 },
  thinking:  { colorVar: '--glow-b',    amp: 0.09, speed: 1.3,  lobes: 7, ring: 0 },
  speaking:  { colorVar: '--glow-c',    amp: 0.20, speed: 0.9,  lobes: 4, ring: 1 },
};

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
    let colorMix = hexToRgb(visualStateRef.current ? SAVI_PALETTES[visualStateRef.current] : hex(STATE_CONFIG.idle.colorVar));
    let smoothedMicLevel = 0;

    const motes = Array.from({ length: 18 }, (_, i) => ({
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
      colorMix.r += (tc.r - colorMix.r) * paletteEase;
      colorMix.g += (tc.g - colorMix.g) * paletteEase;
      colorMix.b += (tc.b - colorMix.b) * paletteEase;

      const col = `${Math.round(colorMix.r)},${Math.round(colorMix.g)},${Math.round(colorMix.b)}`;
      const sec = hueShift(colorMix, ambientLoop ? 0 : visual ? 10 : 38);
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
      const haloAlpha = 0.26 + haloBoost + (visual ? Math.sin(t * 0.7) * 0.025 : 0);
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

      // Light motes (particles)
      for (const m of motes) {
        const ang = m.phase + t * m.speed * m.dir;
        const moteBonus = currentName === 'listening' ? smoothedMicLevel * 0.12 : 0;
        // Keep motes comfortably within canvas bounds
        const r = Math.min(maxSafeRadius * 0.78, dynBaseR * m.radiusF * (1 + dynAmp * 0.4 + moteBonus));
        const mx = cx + Math.cos(ang) * r;
        const my = cy + Math.sin(ang * 1.15) * r * 0.9;
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.6 + (currentName === 'listening' ? smoothedMicLevel * 1.2 : 0)) + m.phase));
        ctx.beginPath();
        ctx.arc(mx, my, m.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${secCol},${0.55 * twinkle})`;
        ctx.shadowColor = `rgba(${secCol},0.8)`;
        ctx.shadowBlur = 5;
        ctx.fill();
      }
      ctx.shadowBlur = 0;


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
      // Outer translucent botanical/forest layer
      layer(1.42, 0.22, 0.75, 2, visual ? col : '4,98,65');
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

