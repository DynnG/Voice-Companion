import React from 'react';
import { Mic, Camera, Lightbulb } from 'lucide-react';
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
  compact?: boolean;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  state,
  onStartFlow,
  onTogglePanel,
  statusHint,
  isCompleted = false,
  onOpenReview,
  canDownloadReview = false,
  onDownloadReview,
  isDownloadingReview = false,
  downloadReviewError = null,
  onToggleCamera,
  isCameraActive = false,
  compact = false,
}) => {
  void canDownloadReview;
  void onDownloadReview;
  void isDownloadingReview;
  void onTogglePanel;
  return (
    <footer className={`voice-footer relative transition-all duration-300 ${compact ? 'py-1 sm:py-2' : 'py-2 sm:py-3'}`}>
      {/* Left Tip Box matching Image 1 */}
      <div className="hidden xl:flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[rgba(218,241,222,0.06)] border border-[rgba(218,241,222,0.13)] text-xs text-[#8EB69B] max-w-[260px] absolute left-6 bottom-3 text-left">
        <Lightbulb className="w-4 h-4 text-[#FFB347] shrink-0 mt-0.5" />
        <div>
          <b className="text-white block text-xs">Tip</b>
          <span className="text-[11px] leading-tight block">Be specific about your experiences, use concrete examples, and highlight the impact you made.</span>
        </div>
      </div>

      <div className={`flex items-center justify-center transition-all duration-300 ${compact ? 'gap-5 sm:gap-6' : 'gap-7 sm:gap-8'}`}>

        {/* Speak Control: Glass button with Saffron accent */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            className={`rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-300 active:scale-95 cursor-pointer ${
              compact
                ? 'w-[48px] h-[48px] sm:w-[52px] sm:h-[52px]'
                : 'w-[56px] h-[56px] sm:w-[62px] sm:h-[62px]'
            } ${
              state === 'listening'
                ? 'bg-[rgba(255,179,71,0.22)] hover:bg-[rgba(255,179,71,0.30)] border border-[rgba(255,179,71,0.70)] border-t-[rgba(255,215,145,0.90)] text-[#FFB347] shadow-[inset_0_1px_2px_rgba(255,215,145,0.35),0_0_28px_rgba(255,179,71,0.50),0_0_0_4px_rgba(255,179,71,0.16)] scale-105'
                : 'bg-[rgba(10,32,24,0.65)] hover:bg-[rgba(16,48,36,0.85)] border border-[rgba(255,179,71,0.32)] border-t-[rgba(255,195,112,0.50)] text-[#FFC370] hover:text-[#FFE0A3] shadow-[inset_0_1px_1px_rgba(255,195,112,0.18),0_6px_20px_rgba(0,0,0,0.35),0_0_14px_rgba(255,179,71,0.12)] hover:shadow-[inset_0_1px_1px_rgba(255,195,112,0.28),0_0_20px_rgba(255,179,71,0.25)]'
            } ${isCompleted ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
            id="micBtn"
            aria-label={isCompleted ? 'Interview concluded' : state === 'listening' ? 'Listening to your answer...' : 'Speak'}
            onClick={isCompleted ? undefined : onStartFlow}
            disabled={isCompleted}
            title={isCompleted ? 'Interview concluded' : state === 'listening' ? 'Listening... click to finish' : 'Click to speak'}
          >
            <Mic className={`${compact ? 'w-5 h-5' : 'w-5.5 h-5.5 sm:w-6 sm:h-6'} transition-all duration-300`} />
          </button>
          <span className={`font-manrope font-semibold transition-all duration-300 ${
            compact ? 'text-[11px]' : 'text-xs'
          } ${
            state === 'listening' ? 'text-[#FFC370]' : 'text-[#8EB69B]'
          }`}>
            {state === 'listening' ? 'Listening...' : 'Speak'}
          </span>
        </div>

        {/* Camera Control: Glass button with Saffron accent (same visual design system) */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            className={`rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-300 active:scale-95 cursor-pointer ${
              compact
                ? 'w-[48px] h-[48px] sm:w-[52px] sm:h-[52px]'
                : 'w-[56px] h-[56px] sm:w-[62px] sm:h-[62px]'
            } ${
              isCameraActive
                ? 'bg-[rgba(255,179,71,0.22)] hover:bg-[rgba(255,179,71,0.30)] border border-[rgba(255,179,71,0.70)] border-t-[rgba(255,215,145,0.90)] text-[#FFB347] shadow-[inset_0_1px_2px_rgba(255,215,145,0.35),0_0_28px_rgba(255,179,71,0.50),0_0_0_4px_rgba(255,179,71,0.16)] scale-105'
                : 'bg-[rgba(10,32,24,0.65)] hover:bg-[rgba(16,48,36,0.85)] border border-[rgba(218,241,222,0.16)] border-t-[rgba(245,238,219,0.28)] text-[#8EB69B] hover:text-[#FFC370] hover:border-[rgba(255,179,71,0.32)] hover:border-t-[rgba(255,195,112,0.50)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.18),0_6px_20px_rgba(0,0,0,0.35)] hover:shadow-[inset_0_1px_1px_rgba(255,195,112,0.25),0_0_16px_rgba(255,179,71,0.20)]'
            }`}
            id="camBtn"
            aria-label={isCameraActive ? 'Turn camera off' : 'Turn camera on'}
            onClick={onToggleCamera}
            title={isCameraActive ? 'Turn camera off' : 'Turn camera on'}
          >
            <Camera className={`${compact ? 'w-5 h-5' : 'w-5.5 h-5.5 sm:w-6 sm:h-6'} transition-all duration-300`} />
          </button>
          <span className={`font-manrope font-semibold transition-all duration-300 ${
            compact ? 'text-[11px]' : 'text-xs'
          } ${
            isCameraActive ? 'text-[#FFC370]' : 'text-[#8EB69B]'
          }`}>
            Camera
          </span>
        </div>
      </div>

      <div className={`hint text-center max-w-sm flex flex-col items-center gap-1 font-manrope transition-all duration-300 ${compact ? 'mt-1 text-[11px]' : 'mt-1.5 sm:mt-2 text-xs'}`}>
        <span>{statusHint || 'Tap microphone to speak · faster-whisper STT backend connected'}</span>
        {downloadReviewError && (
          <span className="text-[10px] text-[#FFC370] font-manrope">{downloadReviewError}</span>
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
