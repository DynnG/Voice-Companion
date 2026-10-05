/** Prefer decoded media timing over rounded recording/STT estimates. */
export function replayPlaybackTiming(audio: Pick<HTMLMediaElement, 'duration' | 'currentTime' | 'ended'> | null, fallbackDuration: number, currentTime: number) {
  const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
  const duration = audio && finitePositive(audio.duration) ? audio.duration :
    audio?.ended && finitePositive(audio.currentTime) ? audio.currentTime : fallbackDuration;
  const time = audio?.ended ? duration : Math.max(0, Math.min(duration, currentTime));
  return { duration, time, progress: audio?.ended ? 1 : duration > 0 ? time / duration : 0 };
}
