import { displayCoachingNotes, coachingNoteLabels } from '../services/coachingNoteStyle';
/**
 * PostInterviewCompletionModal
 *
 * Polished modal displayed once an interview reaches COMPLETED state.
 * Allows candidates to review all questions and transcripts from the session
 * and download a cleanly formatted PDF review locally.
 *
 * Requirements:
 * - Shown only after interview reaches COMPLETED.
 * - Download action with a header close control.
 * - Generates PDF locally in the browser from session memory.
 * - Robust error handling with retry and zero database persistence.
 */

import React, { useState } from 'react';
import {
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
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
    status?: 'Completed' | 'In Progress';
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

  const isComplete = sessionData.status === 'Completed';
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
        status: isComplete ? 'Completed' : 'In Progress',
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-[#0D2017] border border-[#344A3D] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-[#F5EEDB] font-manrope">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 pb-3 border-b border-[rgba(218,241,222,0.12)] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-[#8EB69B] font-manrope">
                  {sessionData.jobRole}
                </span>
              </div>
              <h2
                id="completion-modal-title"
                className="text-lg sm:text-xl font-fraunces font-medium text-[#F5EEDB] tracking-tight"
              >
                {isComplete ? 'Interview complete' : 'Interview review'}
              </h2>
              <p className="text-xs sm:text-sm text-[#8EB69B] mt-0.5 font-manrope">
                {isComplete ? 'Your interview session is complete. Review your answers and feedback below.' : 'Review your conversation so far. Close this review to continue your remaining questions.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#8EB69B] hover:text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.08)] transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Session Summary */}
        <div className="px-5 sm:px-6 py-3 bg-[#12291D] border-b border-[rgba(218,241,222,0.08)] grid grid-cols-3 gap-2 sm:gap-4 shrink-0 text-center">
          <div className="flex flex-col items-center justify-center py-1">
            <span className="text-[10px] font-manrope uppercase tracking-wider text-[#8EB69B]">
              Questions
            </span>
            <span className="text-lg sm:text-xl font-manrope font-semibold text-[#F5EEDB] flex items-center gap-1.5 mt-0.5">
              {sessionData.exchanges.length} Answered
            </span>
          </div>
          <div className="flex flex-col items-center justify-center py-1 border-x border-[rgba(218,241,222,0.12)]">
            <span className="text-[10px] font-manrope uppercase tracking-wider text-[#8EB69B]">
              Duration
            </span>
            <span className="text-lg sm:text-xl font-manrope font-semibold text-[#F5EEDB] flex items-center gap-1.5 mt-0.5">
              {durationStr}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center py-1">
            <span className="text-[10px] font-manrope uppercase tracking-wider text-[#8EB69B]">
              Session Status
            </span>
            <span className="text-lg sm:text-xl font-manrope font-semibold text-[#FFC370] flex items-center gap-1.5 mt-0.5">
              {isComplete ? 'Completed' : 'In Progress'}
            </span>
          </div>
        </div>

        {/* Scrollable Questions & Feedback Preview */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 max-h-[46vh]">
          {sessionData.exchanges.length === 0 ? (
            <div className="py-8 text-center text-[#8EB69B] text-xs font-manrope">
              No interview questions were recorded during this session.
            </div>
          ) : (
            sessionData.exchanges.map((exchange, idx) => (
              <div
                key={exchange.id || idx}
                className="bg-[#10241A] border border-[#2A4033] rounded-xl p-4 space-y-2.5 transition-all"
              >
                {/* Question Header */}
                <div className="flex items-center justify-between text-xs text-[#FFC370] font-manrope font-semibold">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#FFB347]" />
                    Question {idx + 1}
                  </span>
                  {exchange.durationSeconds && exchange.durationSeconds > 0 ? (
                    <span className="text-[10px] font-normal text-[#8EB69B]/70">
                      Spoken duration: {exchange.durationSeconds}s
                    </span>
                  ) : null}
                </div>

                {/* PAL Question */}
                <div className="text-xs sm:text-sm font-fraunces text-[#F5EEDB] leading-relaxed bg-[rgba(19,48,32,0.6)] border-l-2 border-[#FFB347] pl-3 py-1.5 rounded-r-xl">
                  &ldquo;{exchange.question}&rdquo;
                </div>

                {/* Candidate Spoken Transcript */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-manrope tracking-wider text-[#8EB69B]">
                    Your Answer
                  </span>
                  <div className="text-xs sm:text-sm text-[#F5EEDB]/90 leading-relaxed bg-[rgba(0,0,0,0.3)] border-l-2 border-[#2FE0A8] pl-3 py-2 rounded-r-xl font-manrope">
                    &ldquo;{exchange.userAnswer}&rdquo;
                  </div>
                </div>

                {/* AI Coaching Notes Preview */}
                {exchange.aiNotes && exchange.aiNotes.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-[rgba(218,241,222,0.1)]">
                    <span className="text-xs font-semibold uppercase font-manrope tracking-wider text-[#FFB347]">
                      AI Notes
                    </span>
                    <div className="space-y-2 font-manrope">
                      {displayCoachingNotes(exchange.aiNotes).map(({ text, kind }, nIdx) => (
                        <div key={nIdx} className={`coaching-note coaching-note--${kind}`}>
                          <span className="coaching-note-label">{coachingNoteLabels[kind]}</span>
                          <p>{text.replace(/^[•\-\*]\s*/, '')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Download Error Banner */}
        {downloadError && (
          <div className="mx-5 sm:mx-6 mb-2 p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-start gap-2.5 font-manrope">
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
        <div className="p-4 sm:p-5 border-t border-[rgba(245,238,219,0.12)] bg-[#0D2017] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-[#8EB69B] flex items-center gap-1.5 text-center sm:text-left font-manrope">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2FE0A8] inline-block" />
            <span>PDF is generated client-side from memory. Zero data is uploaded.</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-full text-xs sm:text-sm font-manrope font-bold text-[#133020] bg-gradient-to-r from-[#FFC370] to-[#FFB347] hover:shadow-[0_4px_18px_rgba(255,179,71,0.35)] active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#133020]" />
                  <span>Generating PDF...</span>
                </>
              ) : hasDownloaded ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#133020]" />
                  <span>Download Again</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#133020]" />
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
