import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Sparkles,
  ChevronUp,
  ArrowRight,
  MessageSquare,
  X,
} from 'lucide-react';
import { ReplayState } from '../types/conversation';

interface AnswerReplayCardProps {
  replayState?: ReplayState;
  onPlayAttempt?: (attemptNumber: 1 | 2) => void;
  onStopPlayback?: () => void;
  playingAttempt?: (1 | 2) | null;
  playbackCurrentTime?: number;
  playbackProgress?: number; // 0 to 1
  playbackAudio?: HTMLAudioElement | null;
  onTryAgain?: () => void;
  onCancelRetry?: () => void;
  onResumeInterview?: () => void;
  onToggleMinimize?: () => void;
  onClose?: () => void;
  isCompleted?: boolean;
  reviewOnly?: boolean;
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
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Recorded audio amplitude; saffron tracks the audio element's playback clock.
 */
const WaveformVisualizer: React.FC<{
  progress: number;
  isPlaying: boolean;
  audioBlob: Blob;
  playbackAudio?: HTMLAudioElement | null;
  className?: string;
}> = ({ progress, isPlaying, audioBlob, playbackAudio, className }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [peaks, setPeaks] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    let context: AudioContext | undefined;
    setPeaks([]);
    const analyze = async () => {
      try {
        context = new AudioContext();
        const buffer = await context.decodeAudioData(await audioBlob.arrayBuffer());
        const values = Array.from({ length: 88 }, (_, index) => {
          const start = Math.floor(index * buffer.length / 88);
          const end = Math.floor((index + 1) * buffer.length / 88);
          let sum = 0;
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const samples = buffer.getChannelData(channel);
            for (let sample = start; sample < end; sample++) sum += samples[sample] ** 2;
          }
          return Math.sqrt(sum / Math.max(1, (end - start) * buffer.numberOfChannels));
        });
        const maximum = Math.max(...values, 0.001);
        if (!cancelled) setPeaks(values.map(value => value / maximum));
      } catch {
        // A browser decoding limitation must not interrupt audio playback.
        if (!cancelled) setPeaks([]);
      } finally {
        if (context && context.state !== 'closed') await context.close();
      }
    };
    void analyze();
    return () => { cancelled = true; };
  }, [audioBlob]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animation = 0;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || 280;
      const h = canvas.clientHeight || 56;

      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const currentProgress = playbackAudio && Number.isFinite(playbackAudio.duration) && playbackAudio.duration > 0
        ? playbackAudio.currentTime / playbackAudio.duration : progress;
      const ratio = Math.min(1, Math.max(0, currentProgress));
      const values = peaks.length ? peaks : Array<number>(88).fill(0);
      const n = values.length;
      const barSpacing = w / n;
      const barWidth = Math.max(1, Math.min(2, barSpacing * 0.34));
      const pos = ratio * n;

      values.forEach((peak, i) => {
        const barHeight = Math.max(2, peak * h * 0.8);
        const x = i * barSpacing + (barSpacing - barWidth) / 2;
        const y = (h - barHeight) / 2;

        ctx.fillStyle = i < pos ? '#FFCB72' : 'rgba(106, 174, 134, 0.65)';

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, Math.min(barWidth / 2, 2));
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      });

      const cursorX = Math.max(4, Math.min(w - 4, ratio * w));
      ctx.fillStyle = '#FFD581';
      ctx.fillRect(cursorX - 0.75, 4, 1.5, h - 4);
      ctx.beginPath();
      ctx.arc(cursorX, 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (isPlaying && !motion.matches) animation = requestAnimationFrame(render);

    };

    render();
    const redraw = () => { cancelAnimationFrame(animation); render(); };
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    motion.addEventListener('change', redraw);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animation);
      motion.removeEventListener('change', redraw);
    };
  }, [progress, peaks, isPlaying, playbackAudio]);

  return (
    <div className={className || 'w-full h-14 relative'}>
      <canvas ref={canvasRef} aria-hidden="true" className="w-full h-full block cursor-default" />
    </div>
  );
};

export const AnswerReplayCard: React.FC<AnswerReplayCardProps> = ({
  replayState,
  onPlayAttempt,
  onStopPlayback,
  playingAttempt = null,
  playbackCurrentTime = 0,
  playbackProgress = 0,
  playbackAudio,
  onTryAgain,
  onCancelRetry,
  onResumeInterview,
  onToggleMinimize,
  onClose,
  isCompleted = false,
  reviewOnly = false,
}) => {
  if (!replayState?.isVisible || !replayState?.attempt1) {
    return null;
  }

  const [localCollapsed, setLocalCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'notes' | 'comparison'>('notes');

  const attempt1 = replayState.attempt1;
  const attempt2 = replayState.attempt2;
  const comparison = replayState.comparison;
  const isRetryMode = replayState.isRetryMode || false;
  const isMinimized = Boolean(replayState.isMinimized || localCollapsed);

  const handleToggle = () => {
    setLocalCollapsed((prev) => !prev);
    onToggleMinimize?.();
  };

  // View Mode: In-Progress Retry
  if (isRetryMode) {
    return (
      <div className="w-full max-w-2xl lg:max-w-3xl xl:max-w-5xl mx-auto bg-[rgba(10,32,24,0.55)] backdrop-blur-xl border border-[rgba(255,179,71,0.25)] border-t-[rgba(255,195,112,0.42)] rounded-2xl sm:rounded-3xl shadow-[inset_0_1px_1px_rgba(255,195,112,0.22),0_24px_60px_rgba(0,0,0,0.45)] p-4 sm:p-5 text-[#F5EEDB] font-manrope space-y-3 max-h-[min(54vh,420px)] overflow-y-auto shrink-0">
        <div className="flex items-center justify-between border-b border-[rgba(218,241,222,0.12)] pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFB347] animate-pulse" />
            <h3 className="font-fraunces font-medium text-xs tracking-normal text-[#FFC370]">
              Answer Attempt 2 (In Progress)
            </h3>
          </div>
          <button
            onClick={onCancelRetry}
            className="text-[11px] text-[#8EB69B] hover:text-[#F5EEDB] underline font-manrope cursor-pointer"
          >
            Cancel
          </button>
        </div>

        <div className="bg-[rgba(4,23,15,0.45)] backdrop-blur-md rounded-2xl p-3 border border-[rgba(218,241,222,0.10)] border-t-[rgba(245,238,219,0.18)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.10)] space-y-1.5 text-xs">
          <span className="font-manrope font-semibold text-[10px] text-[#FFB347] uppercase tracking-wider block">
            Retrying Question:
          </span>
          <p className="text-xs text-[#F5EEDB] leading-relaxed">
            {replayState?.questionText || 'Respond to the interviewer with your improved answer.'}
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

  // Canonical Target View: Unified Container for Audio Playback & AI Notes
  const isPlaying = playingAttempt === 1;
  const displayDuration = attempt1.durationSeconds || 0;
  const displayCurrentTime = playbackCurrentTime || 0;
  const progressRatio = displayDuration > 0
    ? Math.min(1, Math.max(0, displayCurrentTime / displayDuration))
    : (playbackProgress || 0);

  const displayTranscript = attempt1.transcript || '';
  const displayNotes = attempt1.aiNotes || [];

  return (
    <section
      className="w-full max-w-2xl lg:max-w-3xl xl:max-w-5xl mx-auto bg-[rgba(10,32,24,0.55)] backdrop-blur-xl border border-[rgba(218,241,222,0.14)] border-t-[rgba(245,238,219,0.22)] rounded-2xl sm:rounded-3xl shadow-[inset_0_1px_1px_rgba(245,238,219,0.16),0_18px_50px_rgba(0,0,0,0.32)] text-[#F5EEDB] font-manrope overflow-hidden transition-all duration-300 shrink-0"
      aria-label="Audio Playback & AI Notes"
    >
      {/* 1. Unified Header Bar */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-2 sm:py-2.5 hover:bg-[rgba(218,241,222,0.03)] transition-colors text-left cursor-pointer group select-none"
        aria-expanded={!isMinimized}
        title={isMinimized ? 'Expand Audio Playback & AI Notes' : 'Minimize Audio Playback & AI Notes'}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[rgba(255,179,71,0.12)] border border-[rgba(255,179,71,0.35)] flex items-center justify-center text-[#FFB347] shrink-0 group-hover:scale-105 transition-transform">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 12v0M8 8v8M12 4v16M16 8v8M20 12v0"/>
            </svg>
          </div>
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-sm sm:text-base text-[#F5EEDB] tracking-tight">
              Audio Playback &amp; AI Notes
            </h3>
            {isMinimized && (
              <span className="text-[11px] text-[#8EB69B] font-mono hidden sm:inline-block">
                {formatTime(displayCurrentTime)} / {formatTime(displayDuration)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {attempt2 && comparison && !isMinimized && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab(activeTab === 'comparison' ? 'notes' : 'comparison');
              }}
              className="text-xs text-[#FFC370] bg-[rgba(255,179,71,0.12)] px-2.5 py-0.5 rounded-full border border-[rgba(255,179,71,0.3)] hover:bg-[rgba(255,179,71,0.2)] transition-colors cursor-pointer"
            >
              {activeTab === 'comparison' ? 'Show Live Notes' : 'Compare Attempts'}
            </span>
          )}
          {onClose && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="w-7 h-7 rounded-full bg-[rgba(218,241,222,0.06)] border border-[rgba(218,241,222,0.12)] flex items-center justify-center text-[#8EB69B] hover:text-[#F5EEDB] hover:border-[rgba(218,241,222,0.25)] transition-all cursor-pointer"
              title="Close Replay Card"
              aria-label="Close Replay Card"
            >
              <X className="w-3.5 h-3.5" />
            </div>
          )}
          <div className="w-7 h-7 rounded-full bg-[rgba(218,241,222,0.06)] border border-[rgba(218,241,222,0.12)] flex items-center justify-center text-[#8EB69B] group-hover:text-[#F5EEDB] group-hover:border-[rgba(218,241,222,0.25)] transition-all">
            <ChevronUp
              className={`w-4 h-4 transition-transform duration-300 ${
                isMinimized ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
      </button>

      {/* 2. Expanded Split Body: Left = Audio Playback, Right = AI Notes */}
      {!isMinimized && (
        <div className="border-t border-[rgba(218,241,222,0.10)]">
          {attempt2 && comparison && activeTab === 'comparison' ? (
            /* Comparison Mode */
            <div className="p-4 sm:p-5 text-[#F5EEDB] font-manrope flex flex-col max-h-[min(54vh,420px)] overflow-y-auto space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(218,241,222,0.1)]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FFB347]" />
                  <h3 className="font-semibold text-sm text-[#F5EEDB]">Comparison: Attempt 1 vs Attempt 2</h3>
                </div>
                <button
                  onClick={() => setActiveTab('notes')}
                  className="text-xs text-[#8EB69B] hover:text-[#F5EEDB] underline cursor-pointer"
                >
                  Back to Live Analysis
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[rgba(6,24,18,0.6)] border border-[rgba(218,241,222,0.1)] space-y-1">
                  <span className="font-bold text-[#8EB69B]">Attempt 1</span>
                  <p className="text-[#F5EEDB]/90 italic">"{attempt1?.transcript}"</p>
                </div>
                <div className="p-3 rounded-xl bg-[rgba(6,24,18,0.6)] border border-[rgba(255,179,71,0.2)] space-y-1">
                  <span className="font-bold text-[#FFB347]">Attempt 2 (Revised)</span>
                  <p className="text-[#F5EEDB]/90 italic">"{attempt2.transcript}"</p>
                </div>
              </div>

              {comparison.improvements && comparison.improvements.length > 0 && (
                <div className="space-y-1 text-xs">
                  <span className="font-semibold text-[#2FE0A8]">Key Improvements:</span>
                  <ul className="list-disc list-inside text-[#F5EEDB]/90 space-y-0.5">
                    {comparison.improvements.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!isCompleted && !reviewOnly ? (
                <div className="flex items-center justify-between pt-2 border-t border-[rgba(218,241,222,0.12)] gap-2 shrink-0">
                  <button
                    onClick={onTryAgain}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[rgba(218,241,222,0.16)] bg-[rgba(218,241,222,0.06)] text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.12)] text-xs font-semibold transition-colors active:scale-95 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#FFB347]" />
                    <span>Try Again</span>
                  </button>

                  <button
                    onClick={onResumeInterview}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#FFC370] to-[#FFB347] text-[#133020] font-bold text-xs transition-all shadow-[0_4px_14px_rgba(255,179,71,0.3)] active:scale-95 ml-auto cursor-pointer"
                  >
                    <span>Resume Interview</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : reviewOnly && !isCompleted ? null : (
                <div className="pt-2 border-t border-[rgba(218,241,222,0.12)] flex justify-between items-center shrink-0 text-xs text-[#2FE0A8]">
                  <span className="font-semibold">Interview Complete</span>
                  <span className="text-[#8EB69B]">All answers recorded</span>
                </div>
              )}
            </div>
          ) : (
            /* Split Audio Playback & AI Notes Mode */
            <div className="answer-replay-body grid grid-cols-1 md:grid-cols-2 p-3 sm:p-4 gap-3 sm:gap-4 max-h-[min(34vh,260px)] sm:max-h-[min(36vh,280px)] overflow-y-auto">
              {/* LEFT COLUMN: YOUR ANSWER (Audio Playback + Duration + Actual Transcript) */}
              <div className="flex flex-col justify-between p-3 sm:p-3.5 rounded-2xl bg-[rgba(6,24,18,0.45)] border border-[rgba(218,241,222,0.10)] shadow-inner space-y-2">
                {/* Header: YOUR ANSWER + Duration badge [13 sec] */}
                <div className="flex items-center justify-between pb-1 border-b border-[rgba(218,241,222,0.08)]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#FFB347]" />
                    <span className="text-[11px] font-bold text-[#FFB347] uppercase tracking-wider">
                      Your Answer
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-medium text-[#8EB69B] px-2 py-0.5 rounded-full bg-[rgba(218,241,222,0.06)] border border-[rgba(218,241,222,0.10)]">
                    {formatDuration(displayDuration)}
                  </span>
                </div>

                {/* Waveform & Scrubber */}
                <div className="w-full flex flex-col justify-center">
                  <WaveformVisualizer
                    audioBlob={attempt1.audioBlob}
                    playbackAudio={playbackAudio}
                    progress={progressRatio}
                    isPlaying={isPlaying}
                    className="w-full h-10 sm:h-12 relative"
                  />
                  <div className="text-right text-[11px] text-[#8EB69B] font-mono mt-1">
                    {formatTime(displayCurrentTime)} / {formatTime(displayDuration)}
                  </div>

                  {/* Progress Scrub Line */}
                  <div className="w-full h-[3px] bg-[rgba(218,241,222,0.12)] rounded-full relative my-2 sm:my-2.5">
                    <div
                      className="h-full bg-[#2FE0A8] rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, progressRatio * 100))}%` }}
                    />
                    <div
                      className="w-2.5 h-2.5 rounded-full bg-[#2FE0A8] shadow-[0_0_8px_#2fe0a8] absolute top-1/2 -translate-y-1/2"
                      style={{ left: `calc(${Math.min(100, Math.max(0, progressRatio * 100))}% - 5px)` }}
                    />
                  </div>

                  {/* Playback Controls */}
                  <div className="flex items-center justify-center gap-6 sm:gap-8 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (attempt1) {
                          onPlayAttempt?.(1);
                        }
                      }}
                      className="flex flex-col items-center gap-1 text-[#8EB69B] hover:text-[#F5EEDB] transition-colors active:scale-95 cursor-pointer"
                      title="Back 15s"
                      aria-label="Back 15 seconds"
                    >
                      <div className="w-8 h-8 rounded-full border border-[rgba(218,241,222,0.16)] flex items-center justify-center">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] font-medium text-[#8EB69B]">15s</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (isPlaying) {
                          onStopPlayback?.();
                        } else {
                          onPlayAttempt?.(1);
                        }
                      }}
                      className="w-12 h-12 sm:w-13 sm:h-13 rounded-full border border-[#2FE0A8]/50 bg-[#2FE0A8]/10 flex items-center justify-center text-[#F5EEDB] shadow-[0_0_16px_rgba(47,224,168,0.25)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      title={isPlaying ? 'Pause' : 'Play recording'}
                      aria-label={isPlaying ? 'Pause' : 'Play recording'}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-current text-[#F5EEDB]" />
                      ) : (
                        <Play className="w-5 h-5 fill-current text-[#F5EEDB] ml-0.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (attempt1) {
                          onPlayAttempt?.(1);
                        }
                      }}
                      className="flex flex-col items-center gap-1 text-[#8EB69B] hover:text-[#F5EEDB] transition-colors active:scale-95 cursor-pointer"
                      title="Forward 15s"
                      aria-label="Forward 15 seconds"
                    >
                      <div className="w-8 h-8 rounded-full border border-[rgba(218,241,222,0.16)] flex items-center justify-center">
                        <RotateCw className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] font-medium text-[#8EB69B]">15s</span>
                    </button>
                  </div>
                </div>

                {/* TRANSCRIPT Section */}
                <div className="p-3 rounded-xl bg-[rgba(4,20,14,0.55)] border border-[rgba(218,241,222,0.08)] space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#8EB69B] uppercase tracking-wider">
                    <MessageSquare className="w-3 h-3 text-[#FFB347]" />
                    <span>Transcript</span>
                  </div>
                  <p className="text-xs text-[#F5EEDB]/90 italic leading-relaxed line-clamp-3 hover:line-clamp-none transition-all">
                    &ldquo;{displayTranscript}&rdquo;
                  </p>
                </div>
              </div>

              {/* RIGHT COLUMN: AI NOTES (Analysis, Observations, Recommendations, Try Again) */}
              <div className="flex flex-col justify-between space-y-3 pl-0 md:pl-2">
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-[rgba(218,241,222,0.08)]">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FFB347]">
                      <Sparkles className="w-3.5 h-3.5 text-[#FFB347]" />
                      <span>AI Notes</span>
                    </div>
                    {attempt1?.aiNotesStatus === 'loading' && (
                      <span className="text-[10px] text-[#FFC370] animate-pulse">
                        Analyzing response…
                      </span>
                    )}
                    {attempt1?.aiNotesStatus === 'success' && (
                      <span className="text-[10px] text-[#2FE0A8] font-medium">
                        Grounded in your answer
                      </span>
                    )}
                  </div>

                  {/* Actionable Notes & Observations */}
                  <div className="space-y-2 mt-2.5 overflow-y-auto pr-1">
                    {attempt1?.aiNotesStatus === 'loading' ? (
                      <div className="p-4 rounded-xl bg-[rgba(6,24,18,0.45)] border border-[rgba(218,241,222,0.08)] flex flex-col items-center justify-center py-6 text-center space-y-2">
                        <div className="w-6 h-6 border-2 border-[#FFB347] border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs text-[#8EB69B]">Analyzing your actual response with Gemini…</p>
                      </div>
                    ) : attempt1?.aiNotesStatus === 'error' ? (
                      <div className="p-3 rounded-xl bg-[rgba(30,12,12,0.45)] border border-[rgba(255,100,100,0.2)] text-xs text-[#F5EEDB]/80">
                        <p className="font-semibold text-[#FF8585] mb-1">AI notes unavailable</p>
                        <p className="text-[11px] text-[#8EB69B]">{attempt1.errorMessage || 'AI notes are unavailable right now.'}</p>
                      </div>
                    ) : displayNotes.length === 0 ? (
                      <div className="p-3 rounded-xl bg-[rgba(6,24,18,0.45)] border border-[rgba(218,241,222,0.08)] text-xs text-[#8EB69B]">
                        No specific AI coaching notes for this response.
                      </div>
                    ) : (
                      /* Specific observations from actual answer analysis */
                      <div className="space-y-2">
                        {displayNotes.map((noteText, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[rgba(6,24,18,0.55)] border border-[rgba(218,241,222,0.08)] hover:border-[rgba(255,179,71,0.25)] transition-colors text-xs leading-relaxed"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FFB347] shrink-0 mt-1.5 shadow-[0_0_6px_rgba(255,179,71,0.6)]" />
                            <p className="text-[#F5EEDB]/90 flex-1">{noteText}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions: Try Answer Again */}
                <div className="pt-2 border-t border-[rgba(218,241,222,0.10)] shrink-0">
                  {!isCompleted && !reviewOnly ? (
                    <button
                      type="button"
                      onClick={onTryAgain}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[rgba(255,179,71,0.35)] bg-gradient-to-r from-[rgba(255,179,71,0.18)] to-[rgba(255,179,71,0.08)] hover:from-[rgba(255,179,71,0.28)] hover:to-[rgba(255,179,71,0.14)] text-[#FFC370] hover:text-[#F5EEDB] font-semibold text-xs transition-all active:scale-98 cursor-pointer shadow-[0_2px_10px_rgba(255,179,71,0.12)] shrink-0"
                      title="Try Answer Again for this question"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#FFB347]" />
                      <span>Try Answer Again</span>
                    </button>
                  ) : reviewOnly && !isCompleted ? null : (
                    <div className="flex justify-between items-center text-xs text-[#2FE0A8] py-1">
                      <span className="font-semibold">Interview Complete</span>
                      <span className="text-[#8EB69B]">All answers recorded</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
