import React from 'react';
import { Mic, Video, VideoOff } from 'lucide-react';
import { VoiceState } from '../types/conversation';

interface VoiceControlsProps {
  state: VoiceState;
  onStartFlow: () => void;
  isPanelOpen?: boolean;
  onTogglePanel?: () => void;
  unreadCount?: number;
  statusHint?: string;
  isCompleted?: boolean;
  onOpenReview?: () => void;
  canDownloadReview?: boolean;
  onDownloadReview?: () => void;
  isDownloadingReview?: boolean;
  downloadReviewError?: string | null;
  onToggleCamera?: () => void;
  isCameraActive?: boolean;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  state,
  onStartFlow,
  statusHint,
  isCompleted = false,
  onOpenReview,
  canDownloadReview = false,
  onDownloadReview,
  isDownloadingReview = false,
  downloadReviewError = null,
  onToggleCamera,
  isCameraActive = false,
}) => {
  void canDownloadReview;
  void onDownloadReview;
  void isDownloadingReview;
  return (
    <footer className="voice-footer">
      <div className="flex items-center justify-center gap-7 sm:gap-8">
        {/* Speak Control: Primary large amber/gold circular button */}
        <div className="flex flex-col items-center gap-2">
          <button
            className={`w-[68px] h-[68px] sm:w-[72px] sm:h-[72px] rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 ${
              state === 'listening'
                ? 'bg-gradient-to-br from-[#ffd48a] via-[#FFB347] to-[#e8952a] text-[#133020] shadow-[0_0_0_8px_rgba(255,179,71,0.2),0_0_36px_rgba(255,179,71,0.55)] scale-105'
                : 'bg-gradient-to-br from-[#ffd48a] via-[#FFB347] to-[#e8952a] text-[#133020] shadow-[0_0_24px_rgba(255,179,71,0.35)] hover:shadow-[0_0_32px_rgba(255,179,71,0.5)] hover:scale-105'
            } ${isCompleted ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
            id="micBtn"
            aria-label={isCompleted ? 'Interview concluded' : state === 'listening' ? 'Listening to your answer...' : 'Speak'}
            onClick={isCompleted ? undefined : onStartFlow}
            disabled={isCompleted}
            title={isCompleted ? 'Interview concluded' : state === 'listening' ? 'Listening... click to finish' : 'Click to speak'}
          >
            <Mic className="w-7 h-7 sm:w-8 sm:h-8" />
          </button>
          <span className="text-xs font-manrope font-semibold text-[#8EB69B]">
            {state === 'listening' ? 'Listening...' : 'Speak'}
          </span>
        </div>

        {/* Camera Control: Smaller dark glass circular button */}
        <div className="flex flex-col items-center gap-2">
          <button
            className={`w-12 h-12 sm:w-[50px] sm:h-[50px] rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 border backdrop-blur-md ${
              isCameraActive
                ? 'bg-[rgba(4,98,65,0.40)] border border-[#2FE0A8]/50 border-t-[#2FE0A8] text-[#2FE0A8] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_0_16px_rgba(47,224,168,0.3)]'
                : 'bg-[rgba(9,32,23,0.60)] hover:bg-[rgba(9,32,23,0.80)] border border-[rgba(218,241,222,0.12)] border-t-[rgba(245,238,219,0.25)] text-[#8EB69B] hover:text-[#F5EEDB] shadow-[inset_0_1px_1px_rgba(245,238,219,0.16),0_4px_16px_rgba(0,0,0,0.3)]'
            }`}
            id="camBtn"
            aria-label={isCameraActive ? 'Turn camera off' : 'Turn camera on'}
            onClick={onToggleCamera}
            title={isCameraActive ? 'Turn camera off' : 'Turn camera on'}
          >
            {isCameraActive ? (
              <Video className="w-5 h-5 text-[#2FE0A8]" />
            ) : (
              <VideoOff className="w-5 h-5 text-[#8EB69B]" />
            )}
          </button>
          <span className="text-xs font-manrope font-semibold text-[#8EB69B]">
            {isCameraActive ? 'Camera On' : 'Camera'}
          </span>
        </div>
      </div>

      <div className="hint text-center max-w-sm flex flex-col items-center gap-1.5 font-manrope mt-2">
        <span>{statusHint || 'Tap microphone to speak · faster-whisper STT backend connected'}</span>
        {downloadReviewError && (
          <span className="text-[11px] text-[#FFC370] font-manrope">{downloadReviewError}</span>
        )}
        {/* Note: Exactly one download action per specification: Download Interview Review button moved exclusively to transcript panel (canDownloadReview && onDownloadReview) */}
        {isCompleted && onOpenReview && (
          <button
            onClick={onOpenReview}
            className="flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-manrope font-semibold bg-[rgba(255,179,71,0.12)] hover:bg-[rgba(255,179,71,0.22)] text-[#FFC370] border border-[rgba(255,179,71,0.4)] transition-all active:scale-95"
            title="Open Completion Review"
          >
            <span>View Completion Review</span>
          </button>
        )}
      </div>
    </footer>
  );
};
