import React, { useState } from 'react';
import { Upload, FileText, Briefcase, Trash2, Sparkles, Plus, CheckCircle2, ArrowRight } from 'lucide-react';
import { AttachedDocument, DocumentCategory } from '../types/conversation';
import { extractDocumentText } from '../services/sttService';

interface DocumentAttachmentScreenProps {
  initialJobRole?: string;
  initialDocuments?: AttachedDocument[];
  onStartInterview: (jobRole: string, docs: AttachedDocument[]) => void;
}

const CATEGORY_META: Record<DocumentCategory, { label: string; icon: string; badgeColor: string }> = {
  resume: { label: 'CV / Resume', icon: '📄', badgeColor: 'bg-[#046241] text-[#ffffff]' },
  job_description: { label: 'Job Description', icon: '📋', badgeColor: 'bg-[#FFB347] text-[#133020]' },
  portfolio: { label: 'Portfolio / Projects', icon: '📁', badgeColor: 'bg-[#133020] text-[#f5eedb] border border-[#046241]/40' },
  other: { label: 'Other Document', icon: '📎', badgeColor: 'bg-[#f5eedb] text-[#133020] border border-[#046241]/30' },
};

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
- Architected and delivered an enterprise voice interaction engine using WebRTC and faster-whisper STT with sub-400ms turnaround time.
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

const POPULAR_ROLES = [
  'Software Developer',
  'Frontend Engineer',
  'Full Stack Engineer',
  'Product Manager',
  'AI Research Engineer',
  'UX/UI Designer'
];

export const DocumentAttachmentScreen: React.FC<DocumentAttachmentScreenProps> = ({
  initialJobRole = 'Software Developer',
  initialDocuments = [],
  onStartInterview,
}) => {
  const [jobRole, setJobRole] = useState<string>(initialJobRole);
  const [documents, setDocuments] = useState<AttachedDocument[]>(initialDocuments);

  const handleAddSampleDoc = (cat: DocumentCategory) => {
    const sample = SAMPLE_TEMPLATES[cat];
    const newDoc: AttachedDocument = {
      ...sample,
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setDocuments((prev) => [...prev, newDoc]);
  };

  const handleRemoveDoc = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleCustomFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, cat: DocumentCategory) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const docId = `doc-${Date.now()}`;
      const newDoc: AttachedDocument = {
        id: docId,
        name: file.name,
        category: cat,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: ''
      };
      setDocuments((prev) => [...prev, newDoc]);

      try {
        const extraction = await extractDocumentText(file);
        if (extraction.extracted_text) {
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === docId
                ? {
                    ...d,
                    content: extraction.extracted_text,
                    extractedText: extraction.extracted_text
                  }
                : d
            )
          );
        }
      } catch (err) {
        console.error('Failed to extract document text:', err);
      }
    }
  };

  const handleStart = () => {
    const cleanRole = jobRole.trim() || 'Software Developer';
    onStartInterview(cleanRole, documents);
  };

  return (
    <div className="w-full h-full bg-[#050810] text-[#f5eedb] overflow-y-auto flex flex-col items-center justify-start p-4 sm:p-8 font-inter">
      <div className="max-w-3xl w-full space-y-6 my-auto py-6">

        {/* Header Setup Card */}
        <div className="text-center space-y-2 bg-[#133020] border border-[#046241]/40 p-6 rounded-2xl shadow-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#046241]/40 border border-[#046241] text-[#FFB347] text-xs font-space font-medium uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Voice Interview Setup</span>
          </div>
          <h1 className="font-space text-2xl sm:text-3xl font-bold text-[#ffffff] tracking-tight">
            Prepare Your Interview Context
          </h1>
          <p className="text-sm text-[#f5eedb]/80 max-w-xl mx-auto leading-relaxed">
            Attach your CV, job description, or portfolio. Pal will adapt its interview questions and assessment specifically for your target role.
          </p>
        </div>

        {/* Job Title / Target Role Input */}
        <div className="bg-[#133020]/90 border border-[#046241]/30 p-5 rounded-xl space-y-3 shadow-md">
          <label className="block font-space text-xs font-semibold text-[#FFB347] uppercase tracking-wider flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#FFB347]" />
            Target Job Title / Position
          </label>
          <input
            type="text"
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value)}
            placeholder="e.g. Software Developer, Product Manager, UX Designer..."
            className="w-full bg-[#050810] border border-[#046241]/50 focus:border-[#046241] focus:ring-1 focus:ring-[#046241] rounded-lg px-4 py-2.5 text-sm text-[#ffffff] outline-none transition-all placeholder-[#f5eedb]/40 font-inter"
          />

          {/* Quick suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-[#f5eedb]/50">Quick select:</span>
            {POPULAR_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setJobRole(role)}
                className={`text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                  jobRole === role
                    ? 'bg-[#046241] text-[#ffffff] font-medium'
                    : 'bg-[#050810] text-[#f5eedb]/70 hover:text-[#ffffff] hover:bg-[#046241]/30'
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-[#f5eedb]/60">
            Interview will be saved as: <strong className="text-[#f5eedb] font-space font-medium">Interview - {jobRole.trim() || 'Software Developer'}</strong>
          </p>
        </div>

        {/* Document Categories Dropzones */}
        <div className="space-y-3">
          <h3 className="font-space text-xs font-semibold text-[#FFB347] uppercase tracking-wider flex items-center gap-2 px-1">
            <FileText className="w-4 h-4" />
            Attach Documents (CV, Job Description, Portfolio)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['resume', 'job_description', 'portfolio', 'other'] as DocumentCategory[]).map((cat) => {
              const meta = CATEGORY_META[cat];
              const attachedForCat = documents.filter((d) => d.category === cat);
              return (
                <div
                  key={cat}
                  className="bg-[#133020]/80 border border-[#046241]/30 hover:border-[#046241] p-4 rounded-xl transition-all flex flex-col justify-between space-y-3 group shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{meta.icon}</span>
                      <div>
                        <h4 className="font-space font-semibold text-xs text-[#ffffff]">
                          {meta.label}
                        </h4>
                        <span className="text-[11px] text-[#f5eedb]/60">
                          {attachedForCat.length > 0
                            ? `${attachedForCat.length} file attached`
                            : 'No file attached yet'}
                        </span>
                      </div>
                    </div>
                    {attachedForCat.length > 0 && (
                      <CheckCircle2 className="w-4 h-4 text-[#5eead4]" />
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {/* File upload input trigger */}
                    <label className="flex-1 cursor-pointer py-1.5 px-3 rounded-lg bg-[#046241]/40 hover:bg-[#046241] border border-[#046241] text-[11px] font-space font-medium text-[#ffffff] flex items-center justify-center gap-1.5 transition-colors">
                      <Upload className="w-3 h-3 text-[#FFB347]" />
                      <span>Upload File</span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.txt,.md"
                        onChange={(e) => handleCustomFileUpload(e, cat)}
                      />
                    </label>

                    {/* Quick Add Sample button */}
                    <button
                      type="button"
                      onClick={() => handleAddSampleDoc(cat)}
                      className="py-1.5 px-2.5 rounded-lg bg-[#050810] hover:bg-[#046241]/30 border border-[#046241]/30 text-[11px] text-[#f5eedb]/80 hover:text-[#ffffff] flex items-center gap-1 transition-colors"
                      title="Add realistic sample file"
                    >
                      <Plus className="w-3 h-3 text-[#FFB347]" />
                      <span>Sample</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Attached Removable File Cards */}
        {documents.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <h4 className="font-space text-xs font-semibold text-[#f5eedb]/90 tracking-wide uppercase px-1">
              Attached Documents ({documents.length})
            </h4>

            <div className="space-y-2">
              {documents.map((doc) => {
                const catMeta = CATEGORY_META[doc.category];
                return (
                  <div
                    key={doc.id}
                    className="bg-[#133020] border border-[#046241]/40 p-3 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in duration-200"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="w-9 h-9 rounded-lg bg-[#050810] border border-[#046241]/30 flex items-center justify-center text-lg shrink-0">
                        {catMeta.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-space text-xs font-semibold text-[#ffffff] truncate">
                            {doc.name}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-space font-medium ${catMeta.badgeColor}`}>
                            {catMeta.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#f5eedb]/60 flex items-center gap-2 mt-0.5">
                          <span>{doc.size}</span>
                          <span>•</span>
                          <span>Uploaded {doc.uploadedAt}</span>
                        </div>
                      </div>
                    </div>

                    {/* Delete File Card Button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc(doc.id)}
                      className="p-1.5 rounded-lg text-[#f5eedb]/50 hover:text-[#ff6b6b] hover:bg-[#050810] transition-colors shrink-0"
                      title="Remove document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Button Footer */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#046241]/30">
          <div className="text-xs text-[#f5eedb]/70 text-center sm:text-left font-inter">
            {documents.length > 0 ? (
              <span className="text-[#5eead4] font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Ready! {documents.length} document(s) attached.
              </span>
            ) : (
              <span>You can start with or without attached documents.</span>
            )}
          </div>

          <button
            onClick={handleStart}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#046241] hover:bg-[#046241]/85 text-[#ffffff] font-space font-semibold text-sm tracking-wider uppercase shadow-xl hover:shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 border border-[#f5eedb]/30"
          >
            <span>Start Interview</span>
            <ArrowRight className="w-4 h-4 text-[#FFB347]" />
          </button>
        </div>

      </div>
    </div>
  );
};
