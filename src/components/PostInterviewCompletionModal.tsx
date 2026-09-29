/**
 * PostInterviewCompletionModal
 *
 * Polished modal displayed once an interview reaches COMPLETED state.
 * Allows candidates to review all questions and transcripts from the session
 * and download a cleanly formatted PDF review locally.
 *
 * Requirements:
 * - Shown only after interview reaches COMPLETED.
 * - Actions: [ Download Interview Review ] and [ Close ].
 * - Generates PDF locally in the browser from session memory.
 * - Robust error handling with retry and zero database persistence.
 */

import React, { useState } from 'react';
import {
  Award,
  Download,
  X,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import { InterviewExchangeRecord } from '../types/conversation';
import { generateInterviewReviewPdf, InterviewReviewPdfData } from '../services/pdfService';

export interface PostInterviewCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionData: {
    id: string;
    jobRole: string;
    exchanges: InterviewExchangeRecord[];
    startTime?: number;
    endTime?: number;
  };
}

export const PostInterviewCompletionModal: React.FC<PostInterviewCompletionModalProps> = ({
  isOpen,
  onClose,
  sessionData
}) => {
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [hasDownloaded, setHasDownloaded] = useState<boolean>(false);

  if (!isOpen) return null;

  // Calculate duration string
  let durationStr = 'N/A';
  if (sessionData.startTime && sessionData.endTime && sessionData.endTime > sessionData.startTime) {
    const elapsedSec = Math.max(1, Math.round((sessionData.endTime - sessionData.startTime) / 1000));
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    durationStr = `${mins}m ${secs}s`;
  } else if (sessionData.exchanges.length > 0) {
    const totalSecs = sessionData.exchanges.reduce((acc, e) => acc + (e.durationSeconds || 0), 0);
    if (totalSecs > 0) {
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      durationStr = `${mins}m ${secs}s`;
    }
  }

  const handleDownload = async () => {
    try {
      setIsGenerating(true);
      setDownloadError(null);

      const pdfPayload: InterviewReviewPdfData = {
        jobRole: sessionData.jobRole,
        exchanges: sessionData.exchanges,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime || Date.now(),
        interviewId: sessionData.id,
        status: 'Completed',
        completedAt: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      await generateInterviewReviewPdf(pdfPayload);
      setHasDownloaded(true);
    } catch (err: any) {
      console.error('[PostInterviewModal] Failed to generate PDF:', err);
      setDownloadError(err?.message || 'Failed to generate PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-[#0f2317] border border-[#046241]/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-[#f5eedb] font-inter">
        {/* Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#046241] via-[#10B981] to-[#FFB347]" />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 pb-3 border-b border-[#046241]/40 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#046241]/30 border border-[#046241]/60 flex items-center justify-center text-[#FFB347] shrink-0 shadow-inner">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-space font-semibold tracking-wider uppercase bg-[#046241]/50 text-[#10B981] border border-[#046241]/70">
                  Interview Concluded
                </span>
                <span className="text-xs text-[#f5eedb]/60 font-medium">
                  {sessionData.jobRole}
                </span>
              </div>
              <h2
                id="completion-modal-title"
                className="text-lg sm:text-xl font-space font-bold text-white tracking-tight"
              >
                YOU&apos;VE FINISHED YOUR INTERVIEW
              </h2>
              <p className="text-xs sm:text-sm text-[#f5eedb]/75 mt-0.5">
                Your interview session is complete. Review your answers and feedback below.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#f5eedb]/60 hover:text-white hover:bg-[#046241]/30 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Session Summary Pills */}
        <div className="px-5 sm:px-6 py-3 bg-[#133020]/70 border-b border-[#046241]/30 grid grid-cols-3 gap-2 sm:gap-4 shrink-0 text-center">
          <div className="flex flex-col items-center justify-center py-1">
            <span className="text-[10px] font-space uppercase tracking-wider text-[#f5eedb]/60">
              Questions
            </span>
            <span className="text-sm sm:text-base font-space font-bold text-white flex items-center gap-1.5 mt-0.5">
              <FileText className="w-3.5 h-3.5 text-[#10B981]" />
              {sessionData.exchanges.length} Answered
            </span>
          </div>
          <div className="flex flex-col items-center justify-center py-1 border-x border-[#046241]/30">
            <span className="text-[10px] font-space uppercase tracking-wider text-[#f5eedb]/60">
              Duration
            </span>
            <span className="text-sm sm:text-base font-space font-bold text-white flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3.5 h-3.5 text-[#FFB347]" />
              {durationStr}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center py-1">
            <span className="text-[10px] font-space uppercase tracking-wider text-[#f5eedb]/60">
              Session Status
            </span>
            <span className="text-sm sm:text-base font-space font-bold text-[#10B981] flex items-center gap-1.5 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
              Completed
            </span>
          </div>
        </div>

        {/* Scrollable Questions & Feedback Preview */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 max-h-[46vh]">
          {sessionData.exchanges.length === 0 ? (
            <div className="py-8 text-center text-[#f5eedb]/60 text-xs">
              No interview questions were recorded during this session.
            </div>
          ) : (
            sessionData.exchanges.map((exchange, idx) => (
              <div
                key={exchange.id || idx}
                className="bg-[#133020]/50 border border-[#046241]/40 rounded-xl p-3.5 sm:p-4 space-y-2.5 transition-all"
              >
                {/* Question Header */}
                <div className="flex items-center justify-between text-xs text-[#10B981] font-space font-semibold">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#10B981]" />
                    Question {idx + 1}
                  </span>
                  {exchange.durationSeconds && exchange.durationSeconds > 0 ? (
                    <span className="text-[10px] font-normal text-[#f5eedb]/50">
                      Spoken duration: {exchange.durationSeconds}s
                    </span>
                  ) : null}
                </div>

                {/* PAL Question */}
                <div className="text-xs sm:text-sm font-medium text-white/95 leading-relaxed bg-[#046241]/20 border-l-2 border-[#10B981] pl-2.5 py-1 rounded-r-md">
                  &ldquo;{exchange.question}&rdquo;
                </div>

                {/* Candidate Spoken Transcript */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-space tracking-wider text-[#f5eedb]/60">
                    Your Answer
                  </span>
                  <div className="text-xs sm:text-sm text-[#f5eedb]/90 leading-relaxed bg-black/25 border-l-2 border-[#38BDF8] pl-2.5 py-1.5 rounded-r-md">
                    &ldquo;{exchange.userAnswer}&rdquo;
                  </div>
                </div>

                {/* AI Coaching Notes Preview */}
                {exchange.aiNotes && exchange.aiNotes.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-[#046241]/30">
                    <span className="text-[10px] uppercase font-space tracking-wider text-[#FFB347] flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#FFB347]" />
                      AI Notes
                    </span>
                    <ul className="space-y-1 text-xs text-[#f5eedb]/80 pl-1">
                      {exchange.aiNotes.map((note, nIdx) => (
                        <li key={nIdx} className="flex items-start gap-1.5">
                          <span className="text-[#FFB347] text-xs leading-tight">•</span>
                          <span>{note.replace(/^[•\-\*]\s*/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Download Error Banner */}
        {downloadError && (
          <div className="mx-5 sm:mx-6 mb-2 p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold text-red-200">PDF Generation Failed: </span>
              {downloadError}
            </div>
            <button
              onClick={handleDownload}
              className="text-xs underline text-red-200 hover:text-white shrink-0 ml-1 font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Modal Actions Footer */}
        <div className="p-4 sm:p-5 border-t border-[#046241]/40 bg-[#133020]/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-[#f5eedb]/60 flex items-center gap-1.5 text-center sm:text-left">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] inline-block" />
            <span>PDF is generated client-side from memory. Zero data is uploaded.</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs sm:text-sm font-space font-medium text-[#f5eedb]/80 hover:text-white border border-[#046241]/60 hover:bg-[#046241]/30 active:scale-95 transition-all"
            >
              Close
            </button>

            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs sm:text-sm font-space font-semibold text-white bg-[#046241] hover:bg-[#046241]/85 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none border border-[#10B981]/40"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#FFB347]" />
                  <span>Generating PDF...</span>
                </>
              ) : hasDownloaded ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  <span>Download Again</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#FFB347]" />
                  <span>Download Interview Review</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
