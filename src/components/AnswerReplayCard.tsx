import React, { useMemo, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Check, Sparkles, ChevronDown, ChevronUp, AlertCircle, ArrowRight, X, Volume2 } from 'lucide-react';
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

/**
 * Botanical Savi Waveform Visualizer
 * Renders muted botanical green bars with warm amber dynamic highlights across playback.
 */
const WaveformVisualizer: React.FC<{
  progress: number;
  isPlaying: boolean;
  className?: string;
}> = ({ progress, isPlaying, className }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate deterministic bar heights modeled on natural voice cadences
  const peaks = useMemo(() => {
    const N = 56;
    return Array.from({ length: N }, (_, i) => {
      const t = i / N;
      const envelope = Math.sin(t * Math.PI) ** 0.85;
      const harmonic = Math.abs(Math.sin(i * 0.74) * Math.cos(i * 0.28));
      const variation = 0.45 * Math.sin(i * 1.6 + 0.3);
      const val = 0.16 + 0.78 * Math.max(0.08, envelope * (0.42 + 0.4 * harmonic + 0.18 * variation));
      return Math.min(1, Math.max(0.14, val));
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || 300;
      const h = canvas.clientHeight || 56;

      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const n = peaks.length;
      const barSpacing = w / n;
      const barWidth = Math.max(2, barSpacing * 0.55);
      const pos = Math.min(n, Math.max(0, progress * n));

      peaks.forEach((peak, i) => {
        // Subtle dynamic lift when needle is right at this bar
        const distanceToCursor = Math.abs(i - pos);
        const dynamicLift = isPlaying ? Math.exp(-(distanceToCursor ** 2) / 6) * 0.3 : 0;
        const barHeight = Math.max(4, peak * (h * 0.82) * (1 + dynamicLift));
        const x = i * barSpacing + (barSpacing - barWidth) / 2;
        const y = (h - barHeight) / 2;

        if (i < pos) {
          // Played portion: warm amber highlight
          ctx.fillStyle = '#FFB347';
        } else {
          // Unplayed portion: muted botanical green
          ctx.fillStyle = 'rgba(111, 211, 160, 0.45)';
        }

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, Math.min(barWidth / 2, 3));
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      });

      // Playhead vertical needle
      if (progress > 0) {
        const needleX = Math.min(w - 1.5, Math.max(0, pos * barSpacing));
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(needleX, 0, 1.5, h);
      }

      if (isPlaying) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [progress, isPlaying, peaks]);

  return (
    <div className={className || 'w-full h-14 relative'}>
      <canvas ref={canvasRef} className="w-full h-full block cursor-default" />
    </div>
  );
};

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
      <div className="w-full max-w-lg bg-gradient-to-b from-[rgba(218,241,222,0.06)] via-[rgba(8,28,20,0.65)] to-[rgba(6,22,16,0.72)] backdrop-blur-xl border border-[rgba(218,241,222,0.12)] border-t-[rgba(245,238,219,0.24)] rounded-full px-4 py-2 flex items-center justify-between shadow-[inset_0_1px_1px_rgba(245,238,219,0.18),0_12px_36px_rgba(0,0,0,0.35)] text-[#F5EEDB] transition-all duration-200 font-manrope">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => (isPlaying ? onStopPlayback() : onPlayAttempt(activeAttempt.attemptNumber))}
            className="w-7 h-7 rounded-full bg-gradient-to-r from-[#FFC370] to-[#FFB347] text-[#133020] flex items-center justify-center transition-transform active:scale-95 shrink-0 shadow-xs"
            title={isPlaying ? 'Pause' : 'Play recording'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <div className="min-w-0">
            <span className="font-fraunces font-medium text-xs text-[#F5EEDB] truncate block">
              {attempt2 ? 'Attempt 2 & Comparison' : 'Audio Playback & AI Notes'}
            </span>
            <span className="text-[10px] text-[#8EB69B] font-manrope">
              {formatDuration(activeAttempt.durationSeconds)} • Replay available
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onToggleMinimize}
            className="p-1.5 text-[#8EB69B] hover:text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.08)] rounded-full transition-colors"
            title="Expand Card"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-[#8EB69B]/70 hover:text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.08)] rounded-full transition-colors"
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
      <div className="w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-gradient-to-b from-[rgba(218,241,222,0.06)] via-[rgba(8,28,20,0.65)] to-[rgba(6,22,16,0.70)] backdrop-blur-xl border border-[rgba(218,241,222,0.12)] border-t-[rgba(245,238,219,0.24)] rounded-3xl shadow-[inset_0_1px_1px_rgba(245,238,219,0.18),0_20px_50px_rgba(0,0,0,0.45)] p-4 sm:p-5 text-[#F5EEDB] font-manrope flex flex-col max-h-[min(54vh, 420px)] overflow-y-auto space-y-3 sm:space-y-4">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-[rgba(218,241,222,0.12)] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[rgba(255,179,71,0.14)] border border-[rgba(255,179,71,0.4)] flex items-center justify-center text-[#FFB347]">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h3 className="font-fraunces font-medium text-sm tracking-normal text-[#F5EEDB]">
              Answer Comparison
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleMinimize}
              className="p-1.5 text-[#8EB69B] hover:text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.08)] rounded-full transition-colors"
              title="Minimize"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[#8EB69B]/70 hover:text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.08)] rounded-full transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Comparison Grid: Attempt 1 vs Attempt 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Attempt 1 Column */}
          <div className="bg-[rgba(4,23,15,0.45)] backdrop-blur-md rounded-2xl p-3.5 border border-[rgba(218,241,222,0.10)] border-t-[rgba(245,238,219,0.18)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.12)] flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-manrope font-semibold text-[11px] text-[#8EB69B] uppercase tracking-wider">
                  Attempt 1
                </span>
                <span className="text-[10px] bg-[rgba(218,241,222,0.08)] text-[#8EB69B] px-2 py-0.5 rounded-full border border-[rgba(218,241,222,0.12)]">
                  {formatDuration(attempt1.durationSeconds)}
                </span>
              </div>

              {/* Play Audio Button */}
              <button
                onClick={() => (isAttempt1Playing ? onStopPlayback() : onPlayAttempt(1))}
                className="w-full mb-2 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full bg-[#046241] hover:bg-[#058257] text-[#F5EEDB] font-manrope font-semibold text-[11px] border border-[rgba(218,241,222,0.14)] transition-all active:scale-95"
              >
                {isAttempt1Playing ? <Pause className="w-3 h-3 text-[#FFB347]" /> : <Play className="w-3 h-3 text-[#FFB347]" />}
                <span>{isAttempt1Playing ? 'Pause Attempt 1' : 'Play Attempt 1'}</span>
              </button>

              {isAttempt1Playing && (
                <div className="mb-2 space-y-1">
                  <div className="w-full bg-[rgba(218,241,222,0.1)] h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-[#FFB347] h-full transition-all duration-100"
                      style={{ width: `${Math.round(playbackProgress * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-[#8EB69B] font-mono">
                    <span>{formatTime(playbackCurrentTime)}</span>
                    <span>{formatTime(attempt1.durationSeconds)}</span>
                  </div>
                </div>
              )}

              {/* Transcript */}
              <div className="space-y-1">
                <span className="text-[10px] font-manrope font-semibold text-[#8EB69B] uppercase tracking-wider">Transcript:</span>
                <p className="text-[11px] leading-relaxed text-[#F5EEDB]/90 italic max-h-20 overflow-y-auto font-manrope">
                  "{attempt1.transcript}"
                </p>
              </div>
            </div>

            {/* AI Notes for Attempt 1 */}
            {attempt1.aiNotes && attempt1.aiNotes.length > 0 && (
              <div className="pt-2 border-t border-[rgba(218,241,222,0.1)]">
                <span className="text-[10px] font-manrope font-semibold text-[#FFB347] uppercase tracking-wider block mb-1">
                  AI Notes
                </span>
                <ul className="space-y-1 text-[11px] text-[#F5EEDB]/85 font-manrope">
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
          <div className="bg-[rgba(4,23,15,0.45)] backdrop-blur-md rounded-2xl p-3.5 border border-[rgba(255,179,71,0.22)] border-t-[rgba(255,195,112,0.38)] shadow-[inset_0_1px_1px_rgba(255,195,112,0.16)] flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-manrope font-semibold text-[11px] text-[#FFC370] uppercase tracking-wider">
                  Attempt 2
                </span>
                <span className="text-[10px] bg-[rgba(255,179,71,0.12)] text-[#FFC370] px-2 py-0.5 rounded-full border border-[rgba(255,179,71,0.3)]">
                  {formatDuration(attempt2.durationSeconds)}
                </span>
              </div>

              {/* Play Audio Button */}
              <button
                onClick={() => (isAttempt2Playing ? onStopPlayback() : onPlayAttempt(2))}
                className="w-full mb-2 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full bg-gradient-to-r from-[#FFC370] to-[#FFB347] text-[#133020] font-manrope font-bold text-[11px] transition-all active:scale-95"
              >
                {isAttempt2Playing ? <Pause className="w-3 h-3 text-[#133020]" /> : <Play className="w-3 h-3 text-[#133020]" />}
                <span>{isAttempt2Playing ? 'Pause Attempt 2' : 'Play Attempt 2'}</span>
              </button>

              {isAttempt2Playing && (
                <div className="mb-2 space-y-1">
                  <div className="w-full bg-[rgba(218,241,222,0.1)] h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-[#FFB347] h-full transition-all duration-100"
                      style={{ width: `${Math.round(playbackProgress * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-[#8EB69B] font-mono">
                    <span>{formatTime(playbackCurrentTime)}</span>
                    <span>{formatTime(attempt2.durationSeconds)}</span>
                  </div>
                </div>
              )}

              {/* Transcript */}
              <div className="space-y-1">
                <span className="text-[10px] font-manrope font-semibold text-[#8EB69B] uppercase tracking-wider">Transcript:</span>
                <p className="text-[11px] leading-relaxed text-[#F5EEDB]/90 italic max-h-20 overflow-y-auto font-manrope">
                  "{attempt2.transcript}"
                </p>
              </div>
            </div>

            {/* AI Notes for Attempt 2 */}
            {attempt2.aiNotes && attempt2.aiNotes.length > 0 && (
              <div className="pt-2 border-t border-[rgba(218,241,222,0.1)]">
                <span className="text-[10px] font-manrope font-semibold text-[#FFC370] uppercase tracking-wider block mb-1">
                  AI Notes
                </span>
                <ul className="space-y-1 text-[11px] text-[#F5EEDB]/85 font-manrope">
                  {attempt2.aiNotes.map((note, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-snug">
                      <span className="text-[#FFC370] shrink-0">•</span>
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
          <div className="bg-[rgba(4,23,15,0.65)] rounded-2xl p-3.5 border border-[rgba(218,241,222,0.12)] space-y-2.5 font-manrope">
            {/* Improvements */}
            {comparison.improvements && comparison.improvements.length > 0 && (
              <div>
                <span className="font-manrope font-semibold text-[11px] text-[#2FE0A8] uppercase tracking-wider block mb-1">
                  Improvement
                </span>
                <div className="space-y-1">
                  {comparison.improvements.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-[#F5EEDB]">
                      <Check className="w-3.5 h-3.5 text-[#2FE0A8] shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Still Improve */}
            {comparison.stillImprove && comparison.stillImprove.length > 0 && (
              <div className="pt-2 border-t border-[rgba(218,241,222,0.1)]">
                <span className="font-manrope font-semibold text-[10px] text-[#FFB347] uppercase tracking-wider block mb-1">
                  Still improve:
                </span>
                <div className="space-y-1">
                  {comparison.stillImprove.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-[#F5EEDB]/80">
                      <span className="text-[#FFB347] shrink-0">•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparison.status === 'error' && (
              <div className="flex items-center gap-1.5 text-xs text-[#FFC370]">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>AI notes are unavailable right now.</span>
              </div>
            )}
          </div>
        )}

        {/* Bottom Actions */}
        {!isCompleted ? (
          <div className="flex items-center justify-between pt-2 border-t border-[rgba(218,241,222,0.12)] gap-2 shrink-0">
            <button
              onClick={onTryAgain}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[rgba(218,241,222,0.16)] bg-[rgba(218,241,222,0.06)] text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.12)] text-xs font-manrope font-semibold transition-colors active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#FFB347]" />
              <span>Try Again</span>
            </button>

            <button
              onClick={onResumeInterview}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#FFC370] to-[#FFB347] text-[#133020] font-manrope font-bold text-xs transition-all shadow-[0_4px_14px_rgba(255,179,71,0.3)] active:scale-95 ml-auto"
            >
              <span>Resume Interview</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="pt-2 border-t border-[rgba(218,241,222,0.12)] flex justify-between items-center shrink-0 text-xs text-[#2FE0A8] font-manrope">
            <span className="font-semibold">Interview Complete</span>
            <span className="text-[#8EB69B]">All answers recorded</span>
          </div>
        )}
      </div>
    );
  }

  // View Mode: In-Progress Retry (user clicked "Try Answer Again")
  if (isRetryMode) {
    return (
      <div className="w-full max-w-lg bg-gradient-to-b from-[rgba(255,179,71,0.06)] via-[rgba(8,28,20,0.70)] to-[rgba(6,22,16,0.75)] backdrop-blur-xl border border-[rgba(255,179,71,0.25)] border-t-[rgba(255,195,112,0.42)] rounded-3xl shadow-[inset_0_1px_1px_rgba(255,195,112,0.22),0_24px_60px_rgba(0,0,0,0.45)] p-4 sm:p-5 text-[#F5EEDB] font-manrope space-y-3 max-h-[min(44vh, 280px)] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[rgba(218,241,222,0.12)] pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFB347] animate-pulse" />
            <h3 className="font-fraunces font-medium text-xs tracking-normal text-[#FFC370]">
              Answer Attempt 2 (In Progress)
            </h3>
          </div>
          <button
            onClick={onCancelRetry}
            className="text-[11px] text-[#8EB69B] hover:text-[#F5EEDB] underline font-manrope"
          >
            Cancel
          </button>
        </div>

        <div className="bg-[rgba(4,23,15,0.45)] backdrop-blur-md rounded-2xl p-3 border border-[rgba(218,241,222,0.10)] border-t-[rgba(245,238,219,0.18)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.10)] space-y-1.5 text-xs">
          <span className="font-manrope font-semibold text-[10px] text-[#FFB347] uppercase tracking-wider block">
            Retrying Question:
          </span>
          <p className="text-xs text-[#F5EEDB] leading-relaxed">
            {replayState.questionText || 'Respond to the interviewer with your improved answer.'}
          </p>
        </div>

        <div className="text-center py-1">
          <p className="text-xs text-[#8EB69B] font-manrope">
            Tap the microphone button below to record your revised answer.
          </p>
        </div>
      </div>
    );
  }

  // View Mode: Single Attempt 1 View (Horizontal Split Dock: Audio Playback | AI Notes)
  const isPlaying = playingAttempt === 1;

  return (
    <div className="w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-gradient-to-b from-[rgba(218,241,222,0.06)] via-[rgba(8,28,20,0.65)] to-[rgba(6,22,16,0.70)] backdrop-blur-xl border border-[rgba(218,241,222,0.12)] border-t-[rgba(245,238,219,0.24)] rounded-3xl shadow-[inset_0_1px_1px_rgba(245,238,219,0.18),0_24px_60px_rgba(0,0,0,0.45)] p-4 sm:p-5 text-[#F5EEDB] font-manrope flex flex-col max-h-[min(54vh, 420px)] overflow-y-auto space-y-3 sm:space-y-4">
      {/* 2-Column Grid: Audio Playback (Left) | AI Notes (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1px_1fr] gap-4 md:gap-5 items-stretch flex-1 min-h-0">
        {/* LEFT COLUMN: Audio Playback */}
        <div className="flex flex-col justify-between space-y-3 min-w-0">
          {/* Audio Playback Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(218,241,222,0.08)]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[rgba(218,241,222,0.08)] border border-[rgba(218,241,222,0.14)] border-t-[rgba(245,238,219,0.25)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.15)] flex items-center justify-center text-[#8EB69B]">
                <Volume2 className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-fraunces font-medium text-sm tracking-normal text-[#F5EEDB]">
                Audio Playback
              </h3>
            </div>
            <span className="text-[11px] font-manrope text-[#8EB69B] bg-[rgba(218,241,222,0.06)] px-2.5 py-0.5 rounded-full border border-[rgba(218,241,222,0.12)]">
              {formatDuration(attempt1.durationSeconds)}
            </span>
          </div>

          {/* Waveform with breathing room */}
          <div className="bg-[rgba(4,23,15,0.45)] backdrop-blur-md rounded-2xl p-3 border border-[rgba(218,241,222,0.10)] border-t-[rgba(245,238,219,0.18)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.10)] space-y-2 flex flex-col justify-center">
            <WaveformVisualizer
              progress={playbackProgress}
              isPlaying={isPlaying}
              className="w-full h-14 relative"
            />
            <div className="flex justify-between items-center text-[10px] text-[#8EB69B] font-mono px-0.5">
              <span>{formatTime(playbackCurrentTime)}</span>
              <span>{formatTime(attempt1.durationSeconds)}</span>
            </div>
          </div>

          {/* Controls: Play/Pause Button & Try Answer Again */}
          <div className="flex items-center justify-between gap-2 pt-0.5 shrink-0">
            <button
              onClick={() => (isPlaying ? onStopPlayback() : onPlayAttempt(1))}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#046241] hover:bg-[#058257] text-[#F5EEDB] font-manrope text-xs font-semibold border border-[rgba(218,241,222,0.15)] transition-all active:scale-95 shadow-xs shrink-0"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 text-[#FFB347]" /> : <Play className="w-3.5 h-3.5 text-[#FFB347]" />}
              <span>{isPlaying ? 'Pause recording' : 'Play recording'}</span>
            </button>

            {!isCompleted ? (
              <button
                onClick={onTryAgain}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[rgba(218,241,222,0.16)] bg-[rgba(218,241,222,0.06)] hover:bg-[rgba(218,241,222,0.12)] text-[#F5EEDB] font-manrope font-semibold text-xs transition-all active:scale-95 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#FFB347]" />
                <span>Try Answer Again</span>
              </button>
            ) : (
              <span className="text-xs text-[#2FE0A8] font-manrope font-semibold shrink-0">
                Interview Complete
              </span>
            )}
          </div>

          {/* Transcript snippet */}
          <div className="space-y-1 pt-1 border-t border-[rgba(218,241,222,0.08)]">
            <span className="text-[10px] font-manrope font-semibold uppercase tracking-wider text-[#8EB69B] block">
              Transcript:
            </span>
            <p className="text-[11px] leading-relaxed text-[#F5EEDB]/90 italic max-h-16 overflow-y-auto font-manrope bg-[rgba(4,23,15,0.35)] backdrop-blur-sm rounded-xl p-2 border border-[rgba(218,241,222,0.08)] border-t-[rgba(245,238,219,0.14)] shadow-[inset_0_1px_1px_rgba(0,0,0,0.2)]">
              "{attempt1.transcript}"
            </p>
          </div>
        </div>

        {/* SUBTLE VERTICAL DIVIDER */}
        <div className="hidden md:block w-px bg-[rgba(218,241,222,0.12)] self-stretch" />

        {/* RIGHT COLUMN: AI Notes */}
        <div className="flex flex-col justify-between space-y-3 min-w-0">
          {/* AI Notes Header & Window Controls */}
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(218,241,222,0.08)]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[rgba(255,179,71,0.12)] border border-[rgba(255,179,71,0.30)] border-t-[rgba(255,195,112,0.45)] flex items-center justify-center text-[#FFB347] shadow-[inset_0_1px_1px_rgba(255,195,112,0.20)]">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-fraunces font-medium text-sm tracking-normal text-[#F5EEDB]">
                AI Notes
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-manrope font-semibold text-[#FFC370] bg-[rgba(255,179,71,0.08)] border border-[rgba(255,179,71,0.30)] border-t-[rgba(255,195,112,0.40)] px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 shadow-[inset_0_1px_1px_rgba(255,195,112,0.12)]">
                <i className="w-1.5 h-1.5 rounded-full bg-[#FFB347] inline-block" />
                After each answer
              </span>
              <button
                onClick={onToggleMinimize}
                className="p-1 text-[#8EB69B] hover:text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.08)] rounded-full transition-colors ml-1"
                title="Minimize"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1 text-[#8EB69B]/70 hover:text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.08)] rounded-full transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* AI Notes Content Body */}
          <div className="flex-1 flex flex-col justify-center min-h-[140px]">
            {attempt1.aiNotesStatus === 'loading' && (
              <div className="bg-[rgba(4,23,15,0.40)] backdrop-blur-md rounded-2xl p-3.5 border border-[rgba(218,241,222,0.10)] border-t-[rgba(245,238,219,0.16)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.10)] space-y-2">
                <div className="flex items-center gap-2 text-xs text-[#FFC370] font-manrope animate-pulse mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Savi is reviewing your answer...</span>
                </div>
                <div className="h-2.5 bg-[rgba(218,241,222,0.1)] rounded-md w-3/4 animate-pulse" />
                <div className="h-2.5 bg-[rgba(218,241,222,0.1)] rounded-md w-5/6 animate-pulse" />
                <div className="h-2.5 bg-[rgba(218,241,222,0.1)] rounded-md w-2/3 animate-pulse" />
              </div>
            )}

            {attempt1.aiNotesStatus === 'error' && (
              <div className="bg-[rgba(255,179,71,0.08)] backdrop-blur-md border border-[rgba(255,179,71,0.25)] border-t-[rgba(255,195,112,0.38)] rounded-2xl p-3.5 text-xs text-[#FFC370] flex items-center gap-2 font-manrope shadow-[inset_0_1px_1px_rgba(255,195,112,0.14)]">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#FFB347]" />
                <span>AI notes are unavailable right now.</span>
              </div>
            )}

            {attempt1.aiNotesStatus === 'success' && attempt1.aiNotes && attempt1.aiNotes.length > 0 && (
              <div className="bg-[rgba(4,23,15,0.45)] backdrop-blur-md border border-[rgba(255,179,71,0.20)] border-t-[rgba(255,195,112,0.35)] rounded-2xl p-3.5 space-y-2 font-manrope max-h-[220px] overflow-y-auto shadow-[inset_0_1px_1px_rgba(255,195,112,0.14)]">
                <span className="text-[10px] font-semibold text-[#FFB347] uppercase tracking-wider block">
                  Observed Feedback:
                </span>
                <ul className="space-y-1.5 text-xs text-[#F5EEDB]/90">
                  {attempt1.aiNotes.map((note, idx) => (
                    <li key={idx} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-[#FFB347] font-bold shrink-0 mt-0.5">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(!attempt1.aiNotesStatus || (attempt1.aiNotesStatus === 'success' && (!attempt1.aiNotes || attempt1.aiNotes.length === 0))) && (
              <div className="text-center py-4 text-xs text-[#8EB69B] italic font-manrope">
                Notes appear once Savi reviews your answer.
              </div>
            )}
          </div>

          {/* Subtle footer info */}
          <div className="text-[10.5px] text-[#8EB69B]/70 font-manrope flex items-center gap-1.5 pt-1 border-t border-[rgba(218,241,222,0.08)] shrink-0">
            <span>Observed delivery feedback. Savi does not judge emotions or personality.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
