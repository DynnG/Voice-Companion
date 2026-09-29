import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AttachedDocument, DocumentCategory } from '../types/conversation';
import { extractDocumentText } from '../services/sttService';

interface DocumentAttachmentScreenProps {
  initialJobRole?: string;
  initialDocuments?: AttachedDocument[];
  onStartInterview: (jobRole: string, docs: AttachedDocument[]) => void | Promise<void>;
}

interface UploadedFileItem {
  id: string;
  name: string;
  size: number;
  formattedSize: string;
  file?: File;
  status: 'uploading' | 'done' | 'error';
  pct: number;
  msg?: string;
  retry?: boolean;
  category: DocumentCategory;
  content?: string;
  extractedText?: string;
  isRemoving?: boolean;
}

const POPULAR_ROLES = [
  'Marketing Manager',
  'Sales Representative',
  'Customer Support',
  'Registered Nurse',
  'Teacher',
  'Accountant',
  'Software Engineer',
  'Administrative Assistant',
  'Project Manager',
  'Data Analyst',
  'Graphic Designer',
  'HR Specialist'
];

const SAMPLE_TEMPLATES: Record<DocumentCategory, AttachedDocument> = {
  resume: {
    id: 'sample-resume',
    name: 'Candidate_Resume_2026.pdf',
    category: 'resume',
    size: '1.4 MB',
    uploadedAt: 'Just now',
    content: `Candidate Summary:
Full Stack Software Engineer with 5+ years of experience specializing in TypeScript, React, Python FastAPI, distributed systems, and real-time audio/voice pipelines.

Key Technical Skills:
- Languages: TypeScript, JavaScript, Python, Go, SQL
- Frontend: React 18, Next.js, Tailwind CSS, Web Audio API, WebSockets
- Backend: FastAPI, Node.js, PostgreSQL, Redis, Docker, Microservices
- AI & ML: LLM orchestration (Gemini), faster-whisper STT, prompt engineering

Work Experience:
Lead Software Engineer | Apex Tech Solutions (2023 - Present)
- Architected and delivered an enterprise voice interaction engine using WebSockets and faster-whisper STT with sub-400ms turnaround time.
- Scaled backend microservices on FastAPI handling 50k+ daily concurrent user interactions.
- Mentored a team of 6 engineers and established CI/CD and automated testing standards.

Senior Frontend Developer | CloudWave Systems (2021 - 2023)
- Built modern single-page applications with React and TypeScript.
- Implemented real-time streaming interfaces and state management.

Education:
B.S. in Computer Science | University of Technology (2017 - 2021)`
  },
  job_description: {
    id: 'sample-jd',
    name: 'Job_Description_Requirements.pdf',
    category: 'job_description',
    size: '520 KB',
    uploadedAt: 'Just now',
    content: `Job Description: Senior Full Stack Engineer (Voice & AI)
We are seeking an experienced Senior Full Stack Engineer to lead the design and development of our real-time voice and conversational AI platform.

Responsibilities:
- Build low-latency conversational audio interfaces with Web Audio API and WebSockets.
- Develop robust backend APIs in Python (FastAPI).
- Integrate cutting-edge speech recognition (Whisper) and generative AI models (Gemini).
- Optimize end-to-end latency and audio streaming performance.

Qualifications:
- 4+ years of professional full-stack development experience.
- Strong proficiency in React, TypeScript, and modern CSS frameworks.
- Demonstrated experience building APIs in Python or Go.`
  },
  portfolio: {
    id: 'sample-portfolio',
    name: 'Portfolio_Project_Highlights.pdf',
    category: 'portfolio',
    size: '2.8 MB',
    uploadedAt: 'Just now',
    content: `Selected Portfolio Projects:
1. Voice Companion - Real-time conversational interview coach using faster-whisper STT and Gemini 2.5 Flash.
2. Distributed Workflow Orchestrator - High-throughput task pipeline processing 100k events/sec.
3. Open-source Audio VAD Library - Lightweight Web Audio worklet for robust voice activity detection.`
  },
  other: {
    id: 'sample-other',
    name: 'Technical_Preparation_Notes.docx',
    category: 'other',
    size: '310 KB',
    uploadedAt: 'Just now',
    content: `Interview Preparation Notes:
- Focus on system design trade-offs: latency vs accuracy in speech recognition pipelines.
- Highlight behavioral examples using the STAR method (Situation, Task, Action, Result).
- Discuss incident response and scaling distributed WebSocket services.`
  }
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const VALID_FILE_EXTENSIONS = /\.(pdf|docx?|txt|md|pptx?|png|jpe?g)$/i;

function formatFileSize(bytes: number): string {
  if (bytes > 1048576) {
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

function getFileExtension(filename: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase().slice(0, 4) : 'FILE';
}

function inferCategory(filename: string): DocumentCategory {
  const lower = filename.toLowerCase();
  if (lower.includes('resume') || lower.includes('cv') || lower.includes('curriculum')) {
    return 'resume';
  }
  if (lower.includes('job') || lower.includes('jd') || lower.includes('description') || lower.includes('requirement')) {
    return 'job_description';
  }
  if (lower.includes('portfolio') || lower.includes('project') || lower.includes('highlight') || lower.includes('sample')) {
    return 'portfolio';
  }
  return 'other';
}

export const DocumentAttachmentScreen: React.FC<DocumentAttachmentScreenProps> = ({
  initialJobRole = 'Software Developer',
  initialDocuments = [],
  onStartInterview,
}) => {
  const [jobRole, setJobRole] = useState<string>(initialJobRole);
  const [files, setFiles] = useState<UploadedFileItem[]>(() => {
    return initialDocuments.map((doc, idx) => ({
      id: doc.id || `f-init-${idx}`,
      name: doc.name,
      size: 1024 * 500,
      formattedSize: doc.size || '500 KB',
      status: 'done',
      pct: 100,
      category: doc.category || 'resume',
      content: doc.content || doc.extractedText || '',
      extractedText: doc.extractedText || doc.content || ''
    }));
  });

  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);

  const heroRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heroOrbRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Hero Orb Canvas animation with unified state and ambient hero lighting
  useEffect(() => {
    const wrap = heroOrbRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let cx = 0;
    let cy = 0;

    function resize() {
      if (!wrap || !canvas || !ctx) return false;
      const r = wrap.getBoundingClientRect();
      if (!r.width) return false;
      W = r.width;
      H = r.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2;
      cy = H / 2;
      return true;
    }

    resize();
    window.addEventListener('resize', resize);

    // Single source of truth for orb colors & physical parameters
    const STATES: Record<string, { c: [number, number, number]; amp: number; speed: number; lobes: number; ring: number }> = {
      idle:      { c: [95, 150, 125],  amp: 0.06, speed: 0.25, lobes: 3, ring: 0 }, // Emerald green
      listening: { c: [255, 179, 71],  amp: 0.10, speed: 0.45, lobes: 5, ring: 0 }, // Saffron / warm amber
      thinking:  { c: [135, 155, 230], amp: 0.09, speed: 1.30, lobes: 7, ring: 0 }, // Celestial soft blue/violet
      speaking:  { c: [218, 241, 222], amp: 0.20, speed: 0.90, lobes: 4, ring: 1 }, // Luminous mint
      error:     { c: [110, 120, 115], amp: 0.03, speed: 0.12, lobes: 3, ring: 0 }
    };

    const cur = { amp: 0.06, speed: 0.25, lobes: 3, ring: 0 };
    const mix = { r: 95, g: 150, b: 125 };
    let t = 0;
    let rot = 0;

    function hueShift({ r, g, b }: { r: number; g: number; b: number }, deg: number) {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let h = 0, s = 0, l = (mx + mn) / 2;
      if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
      }
      h = ((h + deg / 360) % 1 + 1) % 1;
      const f = (p: number, q: number, tt: number) => {
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
      };
      let a: number, b2: number, c: number;
      if (s === 0) {
        a = b2 = c = l;
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        a = f(p, q, h + 1 / 3);
        b2 = f(p, q, h);
        c = f(p, q, h - 1 / 3);
      }
      return { r: Math.round(a * 255), g: Math.round(b2 * 255), b: Math.round(c * 255) };
    }

    const motes = Array.from({ length: 18 }, () => ({
      rf: 1.15 + Math.random() * 0.75,
      sp: 0.2 + Math.random() * 0.4,
      dir: Math.random() > 0.5 ? -1 : 1,
      ph: Math.random() * 6.28,
      sz: 1 + Math.random() * 1.5
    }));

    function blob(R: number, amp: number, lobes: number, phase: number, n: number) {
      const p = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.2832;
        const r = R * (1 + amp * Math.sin(lobes * a + phase) + amp * 0.35 * Math.sin((lobes + 2) * a - phase * 1.4));
        p.push({ x: cx + Math.cos(a + rot) * r, y: cy + Math.sin(a + rot) * r });
      }
      return p;
    }

    function smooth(p: { x: number; y: number }[]) {
      if (!ctx) return;
      ctx.beginPath();
      const n = p.length;
      const m = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const m0 = m(p[n - 1], p[0]);
      ctx.moveTo(m0.x, m0.y);
      for (let i = 0; i < n; i++) {
        const q = m(p[i], p[(i + 1) % n]);
        ctx.quadraticCurveTo(p[i].x, p[i].y, q.x, q.y);
      }
      ctx.closePath();
    }

    const CYCLE = ['idle', 'listening', 'thinking', 'speaking'];
    let heroState = 'idle';
    let hi = 0;
    const cycleInterval = setInterval(() => {
      hi = (hi + 1) % CYCLE.length;
      heroState = CYCLE[hi];
    }, 3200);

    let animId = 0;

    function draw() {
      animId = requestAnimationFrame(draw);
      if (!wrap || !canvas || !ctx) return;
      if (!wrap.offsetWidth) return;
      if (Math.abs(wrap.offsetWidth - W) > 1) resize();

      const st = STATES[heroState] || STATES.idle;
      t += 0.016;
      cur.amp += (st.amp - cur.amp) * 0.05;
      cur.speed += (st.speed - cur.speed) * 0.05;
      cur.lobes += (st.lobes - cur.lobes) * 0.08;
      cur.ring += (st.ring - cur.ring) * 0.06;
      rot += 0.0028 * cur.speed;

      // Smooth frame-by-frame color interpolation (exponential ease ~400-600ms)
      mix.r += (st.c[0] - mix.r) * 0.05;
      mix.g += (st.c[1] - mix.g) * 0.05;
      mix.b += (st.c[2] - mix.b) * 0.05;

      const r = Math.round(mix.r);
      const g = Math.round(mix.g);
      const b = Math.round(mix.b);
      const col = `${r},${g},${b}`;
      const sc = hueShift(mix, 38);
      const sec = `${sc.r},${sc.g},${sc.b}`;

      // CRITICAL ORB / HERO BACKGROUND FIX:
      // Expose the EXACT live orb color to the hero element and root container
      // as CSS custom properties so the hero background ambient glow follows the orb in lockstep.
      if (heroRef.current) {
        heroRef.current.style.setProperty('--orb-rgb', col);
        heroRef.current.style.setProperty('--orb-color', `rgb(${col})`);
      }
      if (containerRef.current) {
        containerRef.current.style.setProperty('--orb', col);
        containerRef.current.style.setProperty('--orb2', sec);
      }

      ctx.clearRect(0, 0, W, H);
      const R = Math.min(W, H) * 0.2;
      const br = 1 + Math.sin(t * cur.speed * 0.9) * 0.03;
      const lobes = Math.round(cur.lobes);

      if (cur.ring > 0.03) {
        for (let p = 0; p < 2; p++) {
          const ph = (t * 0.55 + p / 2) % 1;
          ctx.strokeStyle = `rgba(${col},${(1 - ph) * 0.22 * cur.ring})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, R * 1.05 + ph * R * 1.3, 0, 6.2832);
          ctx.stroke();
        }
      }

      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.7);
      halo.addColorStop(0, `rgba(${col},.28)`);
      halo.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 2.7, 0, 6.2832);
      ctx.fill();

      for (const m of motes) {
        const a = m.ph + t * m.sp * m.dir;
        const radius = R * m.rf * (1 + cur.amp * 0.6);
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.6 + m.ph));
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * radius, cy + Math.sin(a * 1.15) * radius * 0.9, m.sz, 0, 6.2832);
        ctx.fillStyle = `rgba(${sec},${0.55 * tw})`;
        ctx.shadowColor = `rgba(${sec},.9)`;
        ctx.shadowBlur = 6;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      const layer = (sm: number, am: number, po: number, lo: number) => {
        smooth(blob(R * br * sm, cur.amp, lobes + lo, t * cur.speed * 1.2 - po, 64));
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15 * sm);
        grad.addColorStop(0, `rgba(${col},${0.85 * am})`);
        grad.addColorStop(0.6, `rgba(${sec},${0.45 * am})`);
        grad.addColorStop(1, `rgba(${col},${0.1 * am})`);
        ctx.fillStyle = grad;
        ctx.fill();
      };

      layer(1.42, 0.28, 0.55, 1);
      layer(1.2, 0.45, 0.28, 0);

      smooth(blob(R * br, cur.amp, lobes, t * cur.speed * 1.2, 64));
      const f = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15);
      f.addColorStop(0, `rgba(${col},.92)`);
      f.addColorStop(0.6, `rgba(${sec},.55)`);
      f.addColorStop(1, `rgba(${col},.16)`);
      ctx.fillStyle = f;
      ctx.shadowColor = `rgba(${col},.55)`;
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = `rgba(${col},.65)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    draw();

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(cycleInterval);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Upload and text extraction
  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const fileArray = Array.from(incoming);
    if (fileArray.length === 0) return;

    for (const file of fileArray) {
      const id = `f-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const cat = inferCategory(file.name);
      const formattedSize = formatFileSize(file.size);

      if (!VALID_FILE_EXTENSIONS.test(file.name)) {
        setFiles((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            size: file.size,
            formattedSize,
            status: 'error',
            pct: 0,
            msg: 'Unsupported file type',
            retry: false,
            category: cat,
          },
        ]);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        setFiles((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            size: file.size,
            formattedSize,
            status: 'error',
            pct: 0,
            msg: 'Too large (max 10 MB)',
            retry: false,
            category: cat,
          },
        ]);
        continue;
      }

      // Add uploading item
      setFiles((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          size: file.size,
          formattedSize,
          file,
          status: 'uploading',
          pct: 25,
          retry: false,
          category: cat,
        },
      ]);

      // Perform text extraction via extractDocumentText
      try {
        const timer = setTimeout(() => {
          setFiles((prev) =>
            prev.map((f) => (f.id === id && f.status === 'uploading' ? { ...f, pct: 75 } : f))
          );
        }, 150);

        const extraction = await extractDocumentText(file);
        clearTimeout(timer);

        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  status: 'done',
                  pct: 100,
                  content: extraction.extracted_text,
                  extractedText: extraction.extracted_text,
                }
              : f
          )
        );
      } catch (err) {
        console.error('Failed to extract document text:', err);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  status: 'error',
                  msg: "Couldn't read this file",
                  retry: true,
                }
              : f
          )
        );
      }
    }
  }, []);

  const handleRetry = useCallback(async (id: string) => {
    const item = files.find((f) => f.id === id);
    if (!item || !item.file) return;

    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: 'uploading', pct: 30, msg: undefined } : f))
    );

    try {
      const extraction = await extractDocumentText(item.file);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: 'done',
                pct: 100,
                content: extraction.extracted_text,
                extractedText: extraction.extracted_text,
              }
            : f
        )
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: 'error',
                msg: "Couldn't read this file",
                retry: true,
              }
            : f
        )
      );
    }
  }, [files]);

  const handleRemove = useCallback((id: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isRemoving: true } : f))
    );
    setTimeout(() => {
      setFiles((prev) => prev.filter((f) => f.id !== id));
    }, 180);
  }, []);

  const handleLoadSamples = useCallback(() => {
    const sampleResume = SAMPLE_TEMPLATES.resume;
    const sampleJd = SAMPLE_TEMPLATES.job_description;

    const newItems: UploadedFileItem[] = [
      {
        id: `sample-resume-${Date.now()}`,
        name: sampleResume.name,
        size: 1400 * 1024,
        formattedSize: sampleResume.size,
        status: 'done',
        pct: 100,
        category: 'resume',
        content: sampleResume.content,
        extractedText: sampleResume.content,
      },
      {
        id: `sample-jd-${Date.now()}`,
        name: sampleJd.name,
        size: 520 * 1024,
        formattedSize: sampleJd.size,
        status: 'done',
        pct: 100,
        category: 'job_description',
        content: sampleJd.content,
        extractedText: sampleJd.content,
      },
    ];

    setFiles((prev) => {
      const existingNames = new Set(prev.map((p) => p.name));
      const toAdd = newItems.filter((item) => !existingNames.has(item.name));
      return [...prev, ...toAdd];
    });
  }, []);

  const handleStartInterview = async () => {
    if (isStarting) return;
    setIsStarting(true);
    const cleanRole = jobRole.trim() || 'Software Developer';
    const readyDocs: AttachedDocument[] = files
      .filter((f) => f.status === 'done')
      .map((f) => ({
        id: f.id,
        name: f.name,
        category: f.category,
        size: f.formattedSize,
        uploadedAt: 'Just now',
        content: f.content || f.extractedText || '',
        extractedText: f.extractedText || f.content || '',
      }));

    try {
      await onStartInterview(cleanRole, readyDocs);
    } catch (err) {
      console.error('[DocumentAttachmentScreen] Failed to start interview:', err);
      setIsStarting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="setup-container relative w-full h-full overflow-y-auto flex flex-col justify-start"
    >
      <div className="setup-bg" />
      <div className="setup-noise" />

      {/* Bento Grid Layout matching desktop single-viewport design */}
      <main id="setup" className="setup-grid">
        {/* 1. Hero Setup Card (Full width top) */}
        <section
          ref={heroRef}
          className="setup-card setup-hero"
          style={{ '--orb-rgb': '95, 150, 125', '--orb-color': 'rgb(95, 150, 125)' } as React.CSSProperties}
        >
          <div className="hero-orb" ref={heroOrbRef} aria-hidden="true">
            <canvas ref={canvasRef} id="hc" />
          </div>

          <span className="setup-tag">Voice interview setup</span>
          <h1>Practice the interview before it counts</h1>
          <p>
            Talk it through with Pal, your voice interviewer. Add your CV, job description or
            portfolio and the questions adapt to your target role.
          </p>

          <button
            type="button"
            className={`btn-saffron-sm ${isStarting ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}
            onClick={handleStartInterview}
            disabled={isStarting}
            id="startBtn"
          >
            {isStarting ? 'Starting interview…' : 'Start interview'}
          </button>
        </section>

        {/* 2. Target Job Title Card */}
        <section className="setup-card">
          <h2>Target job title</h2>
          <p className="setup-usub">
            Tell us the role you're targeting. This helps us tailor your request and find the most relevant opportunities.
          </p>

          <div className="setup-jin">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="7" width="18" height="13" rx="2" />
              <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
            </svg>
            <input
              id="job"
              type="text"
              maxLength={80}
              autoComplete="off"
              aria-label="Target job title"
              placeholder="e.g. Marketing Manager, Registered Nurse, Sales Associate..."
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              className="setup-job-input"
            />
          </div>

          <p className="setup-jlbl" id="popLbl">Or choose from popular roles</p>
          <div className="setup-chips" role="group" aria-labelledby="popLbl">
            {POPULAR_ROLES.map((role) => {
              const isSelected = jobRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  className="setup-chip"
                  aria-pressed={isSelected}
                  onClick={() => setJobRole(role)}
                >
                  {role}
                </button>
              );
            })}
          </div>

          <p className="setup-jhelp">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
            </svg>
            <span>
              <b>No exact match?</b> You can type any job title or role above. We'll use it to find the most relevant matches.
            </span>
          </p>
        </section>

        {/* 3. Attach Documents Card */}
        <section className="setup-card">
          <div className="setup-uh">
            <h2>Attach documents</h2>
            <span className="setup-optl">Optional</span>
          </div>
          <p className="setup-usub">Upload files you want to include with your request.</p>

          <label
            className={`setup-drop ${isDragOver ? 'over' : ''}`}
            htmlFor="fileIn"
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files) {
                addFiles(e.dataTransfer.files);
              }
            }}
          >
            <input
              type="file"
              id="fileIn"
              ref={fileInputRef}
              className="setup-sr"
              multiple
              aria-label="Upload files"
              accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.ppt,.pptx"
              onChange={(e) => {
                if (e.target.files) {
                  addFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 16V4M6.5 9.5 12 4l5.5 5.5" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <strong>
              {isDragOver ? 'Drop to add your files' : 'Drag & drop your files here'}
            </strong>
            <span className="setup-or">or</span>
            <span className="setup-bbtn">Browse files</span>
            <small className="setup-sup">
              Supported: PDF, DOC, DOCX, TXT, MD, PPT, PPTX, PNG, JPG
            </small>
          </label>

          <div className="setup-uf">
            <div className="setup-fhead">
              <span>Attached files</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadSamples}
                  className="text-[11px] text-[#FFC370] hover:underline cursor-pointer font-medium"
                  title="Load realistic sample CV & Job Description"
                >
                  + Add sample
                </button>
                <span>
                  {files.length} {files.length === 1 ? 'file' : 'files'}
                </span>
              </div>
            </div>

            {files.length === 0 ? (
              <p className="setup-empty">No files attached yet</p>
            ) : (
              <ul className="setup-flist" aria-live="polite">
                {files.map((file) => {
                  const ext = getFileExtension(file.name);
                  const statusText =
                    file.status === 'uploading'
                      ? `Uploading… ${file.pct}%`
                      : file.status === 'done'
                      ? `✓ Ready · ${ext} · ${file.formattedSize}`
                      : `! ${file.msg || 'Error'}`;

                  return (
                    <li
                      key={file.id}
                      className={`setup-fi ${file.status} ${file.isRemoving ? 'removing' : ''}`}
                    >
                      <span className="tile">{ext}</span>
                      <div className="mid">
                        <div className="nm" title={file.name}>
                          {file.name}
                        </div>
                        <div className="st">{statusText}</div>
                        {file.status === 'uploading' && (
                          <div
                            className="setup-bar"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={file.pct}
                          >
                            <i style={{ width: `${file.pct}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="acts">
                        {file.retry && (
                          <button
                            type="button"
                            className="rt"
                            onClick={() => handleRetry(file.id)}
                            aria-label={`Retry ${file.name}`}
                          >
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          className="x"
                          onClick={() => handleRemove(file.id)}
                          aria-label={`Remove ${file.name}`}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
