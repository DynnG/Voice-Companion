export interface SpeechEndpointState {
  speechStartedAt: number | null;
  silenceStartedAt: number | null;
}

export function updateSpeechEndpoint(state: SpeechEndpointState, rms: number, now: number): boolean {
  if (rms > 0.018) {
    state.speechStartedAt ??= now;
    state.silenceStartedAt = null;
    return false;
  }
  if (state.speechStartedAt === null) return false;
  state.silenceStartedAt ??= now;
  return now - state.speechStartedAt >= 800 && now - state.silenceStartedAt >= 1600;
}
