import React, { useEffect, useRef } from 'react';
import { VoiceState } from '../types/conversation';

interface VoiceCreatureProps {
  state: VoiceState;
  onTap: () => void;
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

export const VoiceCreature: React.FC<VoiceCreatureProps> = ({ state, onTap }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const currentStateRef = useRef<VoiceState>(state);

  useEffect(() => {
    currentStateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
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

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(wrap);
    resize();

    let cur = {
      amp: STATE_CONFIG.idle.amp,
      speed: STATE_CONFIG.idle.speed,
      lobes: STATE_CONFIG.idle.lobes,
      ring: 0
    };
    let colorMix = { r: 75, g: 86, b: 117 };

    const motes = Array.from({ length: 18 }, (_, i) => ({
      radiusF: 1.15 + Math.random() * 0.75,
      speed: 0.2 + Math.random() * 0.4,
      dir: i % 2 === 0 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
      size: 1 + Math.random() * 1.5
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

      cur.amp += (target.amp - cur.amp) * 0.05;
      cur.speed += (target.speed - cur.speed) * 0.05;
      cur.lobes += (target.lobes - cur.lobes) * 0.08;
      cur.ring += (target.ring - cur.ring) * 0.06;
      rot += 0.0028 * cur.speed;

      const targetHex = hex(target.colorVar);
      const tc = hexToRgb(targetHex);
      colorMix.r += (tc.r - colorMix.r) * 0.05;
      colorMix.g += (tc.g - colorMix.g) * 0.05;
      colorMix.b += (tc.b - colorMix.b) * 0.05;

      const col = `${Math.round(colorMix.r)},${Math.round(colorMix.g)},${Math.round(colorMix.b)}`;
      const sec = hueShift(colorMix, 38);
      const secCol = `${sec.r},${sec.g},${sec.b}`;

      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      const baseR = Math.min(W, H) * 0.2;
      const breathe = 1 + Math.sin(t * cur.speed * 0.9) * 0.03;
      const lobes = Math.round(cur.lobes);

      // Outward pulse ring (speaking state)
      if (cur.ring > 0.03) {
        const loops = 2;
        for (let p = 0; p < loops; p++) {
          const ph = ((t * 0.55 + p / loops) % 1);
          const r = baseR * 1.05 + ph * baseR * 1.3;
          ctx.strokeStyle = `rgba(${col},${(1 - ph) * 0.22 * cur.ring})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Soft halo background
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 2.7);
      halo.addColorStop(0, `rgba(${col},0.28)`);
      halo.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 2.7, 0, Math.PI * 2);
      ctx.fill();

      // Light motes
      for (const m of motes) {
        const ang = m.phase + t * m.speed * m.dir;
        const r = baseR * m.radiusF * (1 + cur.amp * 0.6);
        const mx = cx + Math.cos(ang) * r;
        const my = cy + Math.sin(ang * 1.15) * r * 0.9;
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.6 + m.phase));
        ctx.beginPath();
        ctx.arc(mx, my, m.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${secCol},${0.55 * twinkle})`;
        ctx.shadowColor = `rgba(${secCol},0.9)`;
        ctx.shadowBlur = 6;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Layered echoes
      function layer(scaleMult: number, alphaMult: number, phaseOffset: number, lobeOffset: number) {
        const phase = t * cur.speed * 1.2 - phaseOffset;
        const pts = blobPoints(baseR * breathe * scaleMult, cur.amp, lobes + lobeOffset, phase, 64);
        smoothPath(pts);
        if (!ctx) return;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.15 * scaleMult);
        g.addColorStop(0,   `rgba(${col},${0.85 * alphaMult})`);
        g.addColorStop(0.6, `rgba(${secCol},${0.45 * alphaMult})`);
        g.addColorStop(1,   `rgba(${col},${0.10 * alphaMult})`);
        ctx.fillStyle = g;
        ctx.fill();
      }
      layer(1.42, 0.28, 0.55, 1);
      layer(1.20, 0.45, 0.28, 0);

      // Core blob
      const pts = blobPoints(baseR * breathe, cur.amp, lobes, t * cur.speed * 1.2, 64);
      smoothPath(pts);
      const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.15);
      fill.addColorStop(0,   `rgba(${col},0.92)`);
      fill.addColorStop(0.6, `rgba(${secCol},0.55)`);
      fill.addColorStop(1,   `rgba(${col},0.16)`);
      ctx.fillStyle = fill;
      ctx.shadowColor = `rgba(${col},0.55)`;
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Crisp thin rim
      ctx.strokeStyle = `rgba(${col},0.65)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="canvas-wrap" ref={wrapRef} onClick={onTap} id="creature">
      <canvas ref={canvasRef} className="voice-canvas" id="c" />
    </div>
  );
};
