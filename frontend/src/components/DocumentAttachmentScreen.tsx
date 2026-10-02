import React, { useState, useRef, useCallback } from 'react';
import { AttachedDocument, DocumentCategory } from '../types/conversation';
import { extractDocumentText, validateJobTitle } from '../services/sttService';
import { VoiceCreature } from './VoiceCreature';
import { ArrowRight, BriefcaseBusiness, FileText, Lightbulb, Mic, UploadCloud } from 'lucide-react';

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
  initialJobRole = '',
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
  const [jobRoleError, setJobRoleError] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Retain the sample-loading implementation without exposing it on the setup page.
  void handleLoadSamples;

  const handleStartInterview = async () => {
    if (isStarting) return;

    const cleanRole = jobRole.trim();

    if (!cleanRole) {
      setJobRoleError('Please enter or select a Target Job Title before starting the interview.');
      return;
    }

    setIsStarting(true);
    setJobRoleError('');

    const isPopularRole = POPULAR_ROLES.some(
      (r) => r.toLowerCase() === cleanRole.toLowerCase()
    );

    if (!isPopularRole) {
      try {
        const isValid = await validateJobTitle(cleanRole);
        if (!isValid) {
          setJobRoleError('Please enter a valid Target Job Title.');
          setIsStarting(false);
          return;
        }
      } catch (err) {
        setJobRoleError('Validation service is temporarily unavailable. Please try again.');
        setIsStarting(false);
        return;
      }
    }

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
      className="setup-container relative w-full h-full overflow-y-auto flex flex-col justify-start"
    >
      {/* Bento Grid Layout matching desktop single-viewport design */}
      <main id="setup" className="setup-grid">
        {/* Hero rests directly on the page background. */}
        <section className="setup-hero" aria-labelledby="setup-heading">
          <div className="setup-hero-copy">
            <span className="setup-tag">Voice interview setup</span>
            <h1 id="setup-heading">Practice the interview<br /><span>before it counts.</span></h1>
            <p>
              Step into a realistic AI interview with Savi. Practice answering role-specific questions and sharpen your responses before the real conversation.
            </p>
          </div>
          <div className="hero-orb" aria-hidden="true">
            <VoiceCreature state="idle" visualState="idle" ambientLoop respectReducedMotion className="setup-idle-orb" />
          </div>
        </section>

        {/* 2. Target Job Title Card */}
        <section className="setup-card setup-job-card" aria-labelledby="target-job-heading">
          <div className="setup-job-heading">
            <span className="setup-job-icon" aria-hidden="true"><BriefcaseBusiness size={24} /></span>
            <div>
              <h2 id="target-job-heading"><label htmlFor="job">Target job title</label></h2>
              <p className="setup-usub" id="target-job-description">
            Tell us the role you're targeting. This helps us tailor your request and find the most relevant opportunities.
              </p>
            </div>
          </div>

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
              aria-describedby="target-job-description"
              placeholder="Enter your Target Job Title"
              value={jobRole}
              onChange={(e) => {
                setJobRole(e.target.value);
                if (jobRoleError) setJobRoleError('');
              }}
              className="setup-job-input"
            />
          </div>
          {jobRoleError && (
            <p className="text-[#FFB347] text-xs mt-2 ml-1">
              {jobRoleError}
            </p>
          )}

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
                  onClick={() => {
                    setJobRole(role);
                    if (jobRoleError) setJobRoleError('');
                  }}
                >
                  {role}
                </button>
              );
            })}
          </div>


        </section>

        {/* 3. Attach Documents Card */}
        <section className="setup-card setup-doc-card" aria-labelledby="attach-documents-heading">
          <div className="setup-job-heading">
            <span className="setup-job-icon" aria-hidden="true"><FileText size={24} /></span>
            <div>
              <div className="setup-doc-title">
                <h2 id="attach-documents-heading">Attach documents</h2>
                <span className="setup-optl">(Optional)</span>
              </div>
              <p className="setup-usub">Upload files you want to include with your request. Add your CV, job description, portfolio, or any relevant materials.</p>
            </div>
          </div>

          <div
            className={`setup-drop ${isDragOver ? 'over' : ''}`}
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
              tabIndex={-1}
              multiple
              aria-label="Upload files"
              aria-describedby="supported-file-formats"
              accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.ppt,.pptx"
              onChange={(e) => {
                if (e.target.files) {
                  addFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <UploadCloud size={34} aria-hidden="true" />
            <strong>
              {isDragOver ? 'Drop to add your files' : 'Drag & drop your files here'}
            </strong>
            <span className="setup-or">or</span>
            <button type="button" className="setup-bbtn" onClick={() => fileInputRef.current?.click()} aria-describedby="supported-file-formats">Browse files</button>
            <small className="setup-sup" id="supported-file-formats">
              Supported: PDF, DOC, DOCX, TXT, MD, PPT, PPTX, PNG, JPG · Maximum 10 MB per file
            </small>
          </div>

          <div className="setup-uf">
            <div className="setup-fhead">
                <span aria-live="polite">
                  {files.length} {files.length === 1 ? 'file' : 'files'}
                </span>
            </div>

            {files.length === 0 ? (
              <div className="setup-empty">
                <FileText size={32} aria-hidden="true" />
                <p>No files attached yet</p>
                <p className="setup-empty-description">Upload your resume, job description, or portfolio to get more relevant questions.</p>
              </div>
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
                            aria-label={`Uploading ${file.name}`}
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
      <div className="setup-start-action">
        <p className="setup-bottom-guidance">
          <Lightbulb size={24} aria-hidden="true" />
          <span><strong>No exact match?</strong> You can type any job title or role above. We'll use it to find the most relevant matches.</span>
        </p>
          <button
            type="button"
            className="btn-saffron-sm setup-start-button"
            onClick={handleStartInterview}
            disabled={isStarting}
            id="startBtn"
          >
            <Mic size={20} aria-hidden="true" />
            <span>{isStarting ? 'Starting interview…' : 'Start interview'}</span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
      </div>
    </div>
  );
};
