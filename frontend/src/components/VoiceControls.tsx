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
  canDownloadReview = false,
  onDownloadReview,
  isDownloadingReview = false,
  downloadReviewError = null,
  onToggleCamera,
  isCameraActive = false,
  compact = false,
}) => {
  void onTogglePanel;
  void canDownloadReview;
  void onDownloadReview;
  void isDownloadingReview;
  return (
    <footer className={`voice-footer relative transition-all duration-300 ${compact ? 'py-1 sm:py-2' : 'py-2 sm:py-3'}`}>
      <details className="interview-tip-card" open>
        <summary><Lightbulb size={18} aria-hidden="true" /><strong>Tip</strong></summary>
        <p>Be specific about your experiences, use concrete examples, and highlight the impact you made.</p>
      </details>

      <div className={`flex items-center justify-center transition-all duration-300 ${compact ? 'gap-5 sm:gap-6' : 'gap-7 sm:gap-8'}`}>

        {/* Speak Control: Glass button with Saffron accent */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            className={`interview-control interview-control--mic ${compact ? 'interview-control--compact' : ''}`}
            aria-pressed={state === 'listening'}
            id="micBtn"
            aria-label={isCompleted ? 'Interview concluded' : state === 'listening' ? 'Listening to your answer...' : 'Speak'}
            onClick={isCompleted ? undefined : onStartFlow}
            disabled={isCompleted}
            title={isCompleted ? 'Interview concluded' : state === 'listening' ? 'Listening... click to finish' : 'Click to speak'}
          >
            <Mic className={`${compact ? 'w-5 h-5' : 'w-5.5 h-5.5 sm:w-6 sm:h-6'} transition-all duration-300`} />
          <span className={`font-manrope font-semibold transition-all duration-300 ${
            compact ? 'text-[11px]' : 'text-xs'
          } ${
            state === 'listening' ? 'text-[#FFC370]' : 'text-[#8EB69B]'
          }`}>
            {state === 'listening' ? 'Listening...' : 'Speak'}
          </span>
          </button>

        </div>

        {/* Camera Control: Glass button with Saffron accent (same visual design system) */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            className={`interview-control interview-control--camera ${compact ? 'interview-control--compact' : ''}`}
            aria-pressed={isCameraActive}
            aria-describedby={!isCameraActive ? 'camera-analysis-hint' : undefined}
            id="camBtn"
            aria-label={isCameraActive ? 'Turn camera off' : 'Turn camera on'}
            onClick={onToggleCamera}
            title={isCameraActive ? 'Turn camera off' : 'Turn camera on'}
          >
            <Camera className={`${compact ? 'w-5 h-5' : 'w-5.5 h-5.5 sm:w-6 sm:h-6'} transition-all duration-300`} />
          <span className={`font-manrope font-semibold transition-all duration-300 ${
            compact ? 'text-[11px]' : 'text-xs'
          } ${
            isCameraActive ? 'text-[#FFC370]' : 'text-[#8EB69B]'
          }`}>
            Camera
          </span>
          </button>

        </div>
      </div>

      {!isCameraActive && (
        <p id="camera-analysis-hint" className="interview-camera-hint">
          Turn on camera to enable Visual Analysis
        </p>
      )}

      <div className={`hint text-center max-w-sm flex flex-col items-center gap-1 font-manrope transition-all duration-300 ${compact ? 'mt-1 text-[11px]' : 'mt-1.5 sm:mt-2 text-xs'}`}>
        <span>{statusHint || 'Tap microphone to speak · faster-whisper STT backend connected'}</span>
        {downloadReviewError && (
          <span className="text-[10px] text-[#FFC370] font-manrope">{downloadReviewError}</span>
        )}
      </div>
    </footer>
  );
};
