import React from 'react';
import { Play, Pause, RotateCcw, Check, Sparkles, ChevronDown, ChevronUp, AlertCircle, ArrowRight, X } from 'lucide-react';
import { ReplayState } from '../types/conversation';

interface AnswerReplayCardProps {
  replayState: ReplayState;
  onPlayAttempt: (attemptNumber: 1 | 2) => void;
  onStopPlayback: () => void;
  playingAttempt: (1 | 2) | null;
  playbackCurrentTime: number;
  playbackProgress: number; // 0 to 1
  onTryAgain: () => void;
  onCancelRetry: () => void;
  onResumeInterview: () => void;
  onToggleMinimize: () => void;
  onClose: () => void;
  isCompleted?: boolean;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs} sec`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const AnswerReplayCard: React.FC<AnswerReplayCardProps> = ({
  replayState,
  onPlayAttempt,
  onStopPlayback,
  playingAttempt,
  playbackCurrentTime,
  playbackProgress,
  onTryAgain,
  onCancelRetry,
  onResumeInterview,
  onToggleMinimize,
  onClose,
  isCompleted = false,
}) => {
  const { attempt1, attempt2, comparison, isRetryMode, isMinimized, isVisible } = replayState;

  if (!isVisible || !attempt1) {
    return null;
  }

  // Minimized Compact Bar
  if (isMinimized) {
    const activeAttempt = attempt2 || attempt1;
    const isPlaying = playingAttempt !== null;
    return (
      <div className="w-full max-w-lg bg-[#133020]/95 backdrop-blur-md border border-[#046241]/50 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-xl text-[#f5eedb] transition-all duration-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => (isPlaying ? onStopPlayback() : onPlayAttempt(activeAttempt.attemptNumber))}
            className="w-7 h-7 rounded-full bg-[#046241] hover:bg-[#046241]/80 text-[#FFB347] flex items-center justify-center transition-transform active:scale-95 shrink-0"
            title={isPlaying ? 'Pause' : 'Play recording'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <div className="min-w-0">
            <span className="font-space font-semibold text-xs text-[#ffffff] truncate block">
              {attempt2 ? 'Attempt 2 & Comparison' : 'Your Answer'}
            </span>
            <span className="text-[10px] text-[#f5eedb]/70 font-inter">
              {formatDuration(activeAttempt.durationSeconds)} • Replay available
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onToggleMinimize}
            className="p-1 text-[#f5eedb]/80 hover:text-[#ffffff] hover:bg-[#046241]/40 rounded-md transition-colors"
            title="Expand Card"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-[#f5eedb]/60 hover:text-[#ffffff] hover:bg-[#046241]/40 rounded-md transition-colors"
            title="Close Card"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // View Mode: Comparison (Attempt 1 vs Attempt 2)
  if (attempt2) {
    const isAttempt1Playing = playingAttempt === 1;
    const isAttempt2Playing = playingAttempt === 2;

    return (
      <div className="w-full max-w-2xl lg:max-w-3xl bg-[#133020]/95 backdrop-blur-md border border-[#046241]/50 rounded-2xl shadow-2xl p-3.5 sm:p-5 text-[#f5eedb] flex flex-col max-h-[min(54vh, 420px)] overflow-y-auto space-y-3 sm:space-y-4">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-[#046241]/30 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#046241] flex items-center justify-center text-[#FFB347]">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h3 className="font-space font-semibold text-xs uppercase tracking-wider text-[#ffffff]">
              Answer Comparison
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleMinimize}
              className="p-1 text-[#f5eedb]/70 hover:text-[#ffffff] rounded-md transition-colors"
              title="Minimize"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-[#f5eedb]/50 hover:text-[#ffffff] rounded-md transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Comparison Grid: Attempt 1 vs Attempt 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Attempt 1 Column */}
          <div className="bg-[#0b1c13] rounded-xl p-3 border border-[#046241]/30 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-space font-semibold text-[11px] text-[#f5eedb]/80 uppercase tracking-wide">
                  Attempt 1
                </span>
                <span className="text-[10px] bg-[#046241]/40 text-[#f5eedb]/80 px-1.5 py-0.5 rounded-sm">
                  {formatDuration(attempt1.durationSeconds)}
                </span>
              </div>

              {/* Play Audio Button */}
              <button
                onClick={() => (isAttempt1Playing ? onStopPlayback() : onPlayAttempt(1))}
                className="w-full mb-2 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#046241]/60 hover:bg-[#046241] text-[#ffffff] font-space text-[11px] transition-all active:scale-95"
              >
                {isAttempt1Playing ? <Pause className="w-3 h-3 text-[#FFB347]" /> : <Play className="w-3 h-3 text-[#FFB347]" />}
                <span>{isAttempt1Playing ? 'Pause Attempt 1' : 'Play Attempt 1'}</span>
              </button>

              {isAttempt1Playing && (
                <div className="mb-2 space-y-1">
                  <div className="w-full bg-[#046241]/30 h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-[#FFB347] h-full transition-all duration-100"
                      style={{ width: `${Math.round(playbackProgress * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-[#f5eedb]/60 font-mono">
                    <span>{formatTime(playbackCurrentTime)}</span>
                    <span>{formatTime(attempt1.durationSeconds)}</span>
                  </div>
                </div>
              )}

              {/* Transcript */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-[#f5eedb]/60 uppercase">Transcript:</span>
                <p className="text-[11px] leading-relaxed text-[#f5eedb]/90 italic max-h-20 overflow-y-auto">
                  "{attempt1.transcript}"
                </p>
              </div>
            </div>

            {/* AI Notes for Attempt 1 */}
            {attempt1.aiNotes && attempt1.aiNotes.length > 0 && (
              <div className="pt-2 border-t border-[#046241]/20">
                <span className="text-[10px] font-semibold text-[#FFB347] uppercase block mb-1">
                  AI Notes
                </span>
                <ul className="space-y-1 text-[11px] text-[#f5eedb]/85">
                  {attempt1.aiNotes.map((note, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-snug">
                      <span className="text-[#FFB347] shrink-0">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Attempt 2 Column */}
          <div className="bg-[#0b1c13] rounded-xl p-3 border border-[#5eead4]/30 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-space font-semibold text-[11px] text-[#5eead4] uppercase tracking-wide">
                  Attempt 2
                </span>
                <span className="text-[10px] bg-[#5eead4]/20 text-[#5eead4] px-1.5 py-0.5 rounded-sm">
                  {formatDuration(attempt2.durationSeconds)}
                </span>
              </div>

              {/* Play Audio Button */}
              <button
                onClick={() => (isAttempt2Playing ? onStopPlayback() : onPlayAttempt(2))}
                className="w-full mb-2 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#046241] hover:bg-[#046241]/80 text-[#ffffff] font-space text-[11px] transition-all active:scale-95"
              >
                {isAttempt2Playing ? <Pause className="w-3 h-3 text-[#5eead4]" /> : <Play className="w-3 h-3 text-[#5eead4]" />}
                <span>{isAttempt2Playing ? 'Pause Attempt 2' : 'Play Attempt 2'}</span>
              </button>

              {isAttempt2Playing && (
                <div className="mb-2 space-y-1">
                  <div className="w-full bg-[#046241]/30 h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-[#5eead4] h-full transition-all duration-100"
                      style={{ width: `${Math.round(playbackProgress * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-[#f5eedb]/60 font-mono">
                    <span>{formatTime(playbackCurrentTime)}</span>
                    <span>{formatTime(attempt2.durationSeconds)}</span>
                  </div>
                </div>
              )}

              {/* Transcript */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-[#f5eedb]/60 uppercase">Transcript:</span>
                <p className="text-[11px] leading-relaxed text-[#f5eedb]/90 italic max-h-20 overflow-y-auto">
                  "{attempt2.transcript}"
                </p>
              </div>
            </div>

            {/* AI Notes for Attempt 2 */}
            {attempt2.aiNotes && attempt2.aiNotes.length > 0 && (
              <div className="pt-2 border-t border-[#046241]/20">
                <span className="text-[10px] font-semibold text-[#5eead4] uppercase block mb-1">
                  AI Notes
                </span>
                <ul className="space-y-1 text-[11px] text-[#f5eedb]/85">
                  {attempt2.aiNotes.map((note, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-snug">
                      <span className="text-[#5eead4] shrink-0">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Improvement & Still Improve Section */}
        {comparison && (
          <div className="bg-[#0b1c13] rounded-xl p-3 border border-[#046241]/30 space-y-2.5">
            {/* Improvements */}
            {comparison.improvements && comparison.improvements.length > 0 && (
              <div>
                <span className="font-space font-semibold text-[11px] text-[#5eead4] uppercase tracking-wider block mb-1">
                  Improvement
                </span>
                <div className="space-y-1">
                  {comparison.improvements.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-[#ffffff]">
                      <Check className="w-3.5 h-3.5 text-[#5eead4] shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Still Improve */}
            {comparison.stillImprove && comparison.stillImprove.length > 0 && (
              <div className="pt-2 border-t border-[#046241]/20">
                <span className="font-space font-semibold text-[10px] text-[#FFB347] uppercase tracking-wider block mb-1">
                  Still improve:
                </span>
                <div className="space-y-1">
                  {comparison.stillImprove.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-[#f5eedb]/80">
                      <span className="text-[#FFB347] shrink-0">•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparison.status === 'error' && (
              <div className="flex items-center gap-1.5 text-xs text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>AI notes are unavailable right now.</span>
              </div>
            )}
          </div>
        )}

        {/* Bottom Actions */}
        {!isCompleted ? (
          <div className="flex items-center justify-between pt-2 border-t border-[#046241]/20 gap-2 shrink-0">
            <button
              onClick={onTryAgain}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#046241] text-[#f5eedb]/80 hover:text-[#ffffff] hover:bg-[#046241]/30 text-xs font-space transition-colors active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>

            <button
              onClick={onResumeInterview}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#046241] hover:bg-[#046241]/85 text-[#ffffff] font-space font-semibold text-xs transition-all shadow-md active:scale-95 ml-auto"
            >
              <span>Resume Interview</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="pt-2 border-t border-[#046241]/20 flex justify-between items-center shrink-0 text-xs text-[#5eead4]">
            <span className="font-space font-medium">Interview Complete</span>
            <span className="text-[#f5eedb]/60">All answers recorded</span>
          </div>
        )}
      </div>
    );
  }

  // View Mode: In-Progress Retry (user clicked "Try Answer Again")
  if (isRetryMode) {
    return (
      <div className="w-full max-w-lg bg-[#133020]/95 backdrop-blur-md border border-[#046241]/60 rounded-2xl shadow-2xl p-4 sm:p-5 text-[#f5eedb] space-y-3 max-h-[min(44vh, 280px)] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#046241]/30 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5eead4] animate-pulse" />
            <h3 className="font-space font-semibold text-xs uppercase tracking-wider text-[#5eead4]">
              Answer Attempt 2 (In Progress)
            </h3>
          </div>
          <button
            onClick={onCancelRetry}
            className="text-[11px] text-[#f5eedb]/60 hover:text-[#ffffff] underline font-inter"
          >
            Cancel
          </button>
        </div>

        <div className="bg-[#0b1c13] rounded-xl p-3 border border-[#046241]/30 space-y-1.5 text-xs">
          <span className="font-space font-semibold text-[10px] text-[#FFB347] uppercase tracking-wide block">
            Retrying Question:
          </span>
          <p className="text-xs text-[#ffffff] leading-relaxed">
            {replayState.questionText || 'Respond to the interviewer with your improved answer.'}
          </p>
        </div>

        <div className="text-center py-1">
          <p className="text-xs text-[#f5eedb]/80 font-inter">
            Tap the microphone button below to record your revised answer.
          </p>
        </div>
      </div>
    );
  }

  // View Mode: Single Attempt 1 View (Standard Replay Card)
  const isPlaying = playingAttempt === 1;

  return (
    <div className="w-full max-w-lg sm:max-w-xl bg-[#133020]/95 backdrop-blur-md border border-[#046241]/50 rounded-2xl shadow-2xl p-3.5 sm:p-5 text-[#f5eedb] flex flex-col max-h-[min(50vh, 380px)] overflow-y-auto space-y-3 sm:space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#046241]/30 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#046241] flex items-center justify-center text-[#FFB347]">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="font-space font-semibold text-xs uppercase tracking-wider text-[#ffffff]">
            Your Answer
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleMinimize}
            className="p-1 text-[#f5eedb]/70 hover:text-[#ffffff] hover:bg-[#046241]/40 rounded-md transition-colors"
            title="Minimize"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-[#f5eedb]/50 hover:text-[#ffffff] hover:bg-[#046241]/40 rounded-md transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Playback Controls & Duration */}
      <div className="bg-[#0b1c13] rounded-xl p-3 border border-[#046241]/30 space-y-2">
        <div className="flex items-center justify-between">
          <button
            onClick={() => (isPlaying ? onStopPlayback() : onPlayAttempt(1))}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#046241] hover:bg-[#046241]/85 text-[#ffffff] font-space text-xs font-semibold transition-all active:scale-95 shadow-xs"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 text-[#FFB347]" /> : <Play className="w-3.5 h-3.5 text-[#FFB347]" />}
            <span>{isPlaying ? 'Pause recording' : 'Play recording'}</span>
          </button>

          <span className="text-xs font-inter text-[#f5eedb]/80 bg-[#133020] px-2.5 py-1 rounded-md border border-[#046241]/40">
            {formatDuration(attempt1.durationSeconds)}
          </span>
        </div>

        {/* Progress Bar when Playing */}
        {isPlaying && (
          <div className="space-y-1 pt-1">
            <div className="w-full bg-[#046241]/30 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#FFB347] h-full transition-all duration-100"
                style={{ width: `${Math.round(playbackProgress * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[#f5eedb]/60 font-mono">
              <span>{formatTime(playbackCurrentTime)}</span>
              <span>{formatTime(attempt1.durationSeconds)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Transcript */}
      <div className="space-y-1">
        <span className="text-[11px] font-space font-semibold uppercase tracking-wider text-[#f5eedb]/60 block">
          Transcript:
        </span>
        <p className="text-xs sm:text-sm leading-relaxed text-[#f5eedb] bg-[#0b1c13]/60 rounded-xl p-3 border border-[#046241]/20 italic max-h-24 overflow-y-auto">
          "{attempt1.transcript}"
        </p>
      </div>

      {/* Divider */}
      <hr className="border-[#046241]/30 my-1" />

      {/* AI Notes */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-space font-semibold uppercase tracking-wider text-[#FFB347] flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[#FFB347]" />
            AI Notes
          </span>
          {attempt1.aiNotesStatus === 'loading' && (
            <span className="text-[10px] text-[#5eead4] animate-pulse">Analyzing answer…</span>
          )}
        </div>

        {attempt1.aiNotesStatus === 'loading' && (
          <div className="bg-[#0b1c13]/60 rounded-xl p-3 border border-[#046241]/20 space-y-2">
            <div className="h-3 bg-[#046241]/30 rounded-md w-3/4 animate-pulse" />
            <div className="h-3 bg-[#046241]/30 rounded-md w-5/6 animate-pulse" />
            <div className="h-3 bg-[#046241]/30 rounded-md w-2/3 animate-pulse" />
          </div>
        )}

        {attempt1.aiNotesStatus === 'error' && (
          <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl p-3 text-xs text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>AI notes are unavailable right now.</span>
          </div>
        )}

        {attempt1.aiNotesStatus === 'success' && attempt1.aiNotes.length > 0 && (
          <ul className="bg-[#0b1c13]/60 rounded-xl p-3 border border-[#046241]/20 space-y-1.5 text-xs text-[#f5eedb]/90 font-inter">
            {attempt1.aiNotes.map((note, idx) => (
              <li key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-[#FFB347] font-bold shrink-0">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Try Answer Again Action */}
      {!isCompleted ? (
        <div className="pt-1 flex justify-end shrink-0">
          <button
            onClick={onTryAgain}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#046241] hover:bg-[#046241]/85 text-[#ffffff] font-space font-semibold text-xs transition-all shadow-md active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#FFB347]" />
            <span>Try Answer Again</span>
          </button>
        </div>
      ) : (
        <div className="pt-1 flex justify-between items-center shrink-0 text-xs text-[#5eead4]">
          <span className="font-space font-medium">Interview Complete</span>
          <span className="text-[#f5eedb]/60">All answers recorded</span>
        </div>
      )}
    </div>
  );
};
