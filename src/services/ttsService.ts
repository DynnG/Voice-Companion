/**
 * Text-to-Speech (TTS) Service using Kokoro-82M ONNX backend.
 * Provides singleton audio playback, natural speech lifecycle callbacks,
 * and guaranteed prevention of overlapping speech or orphaned audio streams.
 */

let activeAudio: HTMLAudioElement | null = null;
let activeAbortController: AbortController | null = null;
let activeObjectUrl: string | null = null;
let isAudioPlaying = false;

export interface SpeakOptions {
  voice?: string;
  speed?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

/**
 * Stop any current audio playback or pending TTS request immediately.
 * Ensures no overlapping audio streams or memory leaks from Blob URLs.
 */
export function stopSpeaking(): void {
  // 1. Cancel in-flight HTTP request
  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch {}
    activeAbortController = null;
  }

  // 2. Pause and disconnect current audio element
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.onplay = null;
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.currentTime = 0;
      activeAudio.src = '';
    } catch {}
    activeAudio = null;
  }

  // 3. Revoke Blob URL to free browser memory
  if (activeObjectUrl) {
    try {
      URL.revokeObjectURL(activeObjectUrl);
    } catch {}
    activeObjectUrl = null;
  }

  isAudioPlaying = false;
}

/**
 * Check if Kokoro speech audio is currently playing.
 */
export function isSpeaking(): boolean {
  return isAudioPlaying;
}

/**
 * Synthesize and play speech from text using the Kokoro-82M ONNX backend.
 * 
 * - Automatically interrupts any existing audio to prevent duplicate/overlapping speech.
 * - Handles errors gracefully: if TTS is disabled or fails, triggers onError and onEnd so the UI never hangs.
 */
export async function speakText(
  text: string,
  options?: SpeakOptions
): Promise<void> {
  // Always stop previous speech first to prevent overlapping audio
  stopSpeaking();

  if (!text || !text.trim()) {
    options?.onEnd?.();
    return;
  }

  const cleanText = text.trim();
  const abortController = new AbortController();
  activeAbortController = abortController;

  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const ttsUrl = `${baseUrl}/tts`;

  try {
    const response = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: cleanText,
        voice: options?.voice,
        speed: options?.speed || 1.0,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = errJson.detail || JSON.stringify(errJson);
      } catch {
        errDetail = await response.text();
      }
      throw new Error(`TTS server returned ${response.status}: ${errDetail || response.statusText}`);
    }

    const audioBlob = await response.blob();

    // Check if request was aborted while downloading
    if (abortController.signal.aborted) {
      return;
    }

    const objectUrl = URL.createObjectURL(audioBlob);
    activeObjectUrl = objectUrl;

    const audio = new Audio(objectUrl);
    activeAudio = audio;

    let hasCleanedUp = false;
    const finalize = (triggerEnd: boolean) => {
      if (hasCleanedUp) return;
      hasCleanedUp = true;
      isAudioPlaying = false;
      if (activeObjectUrl === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        activeObjectUrl = null;
      }
      if (activeAudio === audio) {
        activeAudio = null;
      }
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
      if (triggerEnd) {
        options?.onEnd?.();
      }
    };

    audio.onplay = () => {
      isAudioPlaying = true;
      options?.onStart?.();
    };

    audio.onended = () => {
      finalize(true);
    };

    audio.onerror = (e) => {
      console.warn('[Kokoro TTS] Audio element playback error:', e);
      finalize(false);
      options?.onError?.(e);
      options?.onEnd?.();
    };

    try {
      await audio.play();
    } catch (playErr: any) {
      if (playErr.name === 'AbortError') {
        // Normal interruption if user spoke or started recording
        finalize(false);
        return;
      }
      console.warn('[Kokoro TTS] Audio play prevented (e.g. autoplay policy):', playErr);
      finalize(false);
      options?.onError?.(playErr);
      options?.onEnd?.();
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // Intentionally aborted
      return;
    }
    console.warn('[Kokoro TTS] Failed to fetch or play speech audio:', err.message || err);
    options?.onError?.(err);
    options?.onEnd?.();
  }
}
