import React from 'react';
import { MessageSquare, Download } from 'lucide-react';
import { VoiceState } from '../types/conversation';

interface VoiceControlsProps {
  state: VoiceState;
  onStartFlow: () => void;
  isPanelOpen: boolean;
  onTogglePanel: () => void;
  unreadCount?: number;
  statusHint?: string;
  isCompleted?: boolean;
  onOpenReview?: () => void;
  canDownloadReview?: boolean;
  onDownloadReview?: () => void;
  isDownloadingReview?: boolean;
  downloadReviewError?: string | null;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  state,
  onStartFlow,
  isPanelOpen,
  onTogglePanel,
  unreadCount = 0,
  statusHint,
  isCompleted = false,
  onOpenReview,
  canDownloadReview = false,
  onDownloadReview,
  isDownloadingReview = false,
  downloadReviewError = null,
}) => {
  return (
    <footer className="voice-footer">
      <div className="mic-row">
        {/* Existing Microphone Button - Design Locked */}
        <button
          className={`mic-btn ${state === 'listening' ? 'live' : ''} ${isCompleted ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
          id="micBtn"
          aria-label={isCompleted ? 'Interview concluded' : state === 'listening' ? 'Listening to your answer...' : 'Start talking'}
          onClick={isCompleted ? undefined : onStartFlow}
          disabled={isCompleted}
          title={isCompleted ? 'Interview session limit reached. Start a new interview from sidebar to practice again.' : state === 'listening' ? 'Listening... auto-stops when you finish speaking' : 'Tap to start speaking'}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </button>

        {/* Feature 1: Live Conversation Button - 60px circular button */}
        <button
          className={`chat-btn ${isPanelOpen ? 'active-panel' : ''}`}
          id="liveChatBtn"
          aria-label="Toggle live conversation panel"
          onClick={onTogglePanel}
          title="Live Conversation Transcript"
        >
          <MessageSquare className="w-[22px] h-[22px] transition-transform duration-200 hover:scale-105" />
          {unreadCount > 0 && !isPanelOpen && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#FFB347] text-[#133020] font-bold text-[10px] rounded-full flex items-center justify-center border-2 border-[#0a0e18]">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      <div className="hint text-center max-w-sm flex flex-col items-center gap-1.5">
        <span>{statusHint || 'Tap microphone to speak · faster-whisper STT backend connected'}</span>
        {downloadReviewError && (
          <span className="text-[11px] text-amber-300 font-inter">{downloadReviewError}</span>
        )}
        {canDownloadReview && onDownloadReview && (
          <button
            onClick={onDownloadReview}
            disabled={isDownloadingReview}
            className="flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-space font-semibold bg-[#046241] hover:bg-[#046241]/85 text-white border border-[#10B981]/50 shadow-xs transition-all active:scale-95 mt-0.5 disabled:opacity-60"
            title="Download Interview Review (PDF)"
          >
            <Download className="w-3.5 h-3.5 text-[#FFB347]" />
            <span>{isDownloadingReview ? 'Generating PDF…' : 'Download Interview Review'}</span>
          </button>
        )}
        {isCompleted && onOpenReview && (
          <button
            onClick={onOpenReview}
            className="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-space font-medium bg-[#FFB347]/15 hover:bg-[#FFB347]/25 text-[#FFB347] border border-[#FFB347]/30 transition-all active:scale-95"
            title="Open Completion Review"
          >
            <span>View Completion Review</span>
          </button>
        )}
      </div>
    </footer>
  );
};
