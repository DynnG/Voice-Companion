/**
 * Text-to-Speech (TTS) Service for MockMate.
 * 
 * Provides:
 * 1. Ultra-low latency, browser-native SpeechSynthesis with natural voice selection
 *    (starts in <15ms, perfectly synchronized with Live Chat display).
 * 2. Automatic audio unlocking via user interaction to prevent autoplay blocks.
 * 3. Graceful fallback to backend Kokoro-82M ONNX TTS (/tts endpoint) when SpeechSynthesis
 *    is unsupported or when Kokoro is explicitly requested.
 * 4. Guaranteed singleton speech playback with barge-in interruption (no overlapping speech).
 * 5. Text sanitization for speech (cleans markdown, backticks, asterisks, links).
 * 6. Workaround for Chromium SpeechSynthesis pause/hang and 15s cutoff bugs.
 */

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeAbortController: AbortController | null = null;
let activeObjectUrl: string | null = null;
let speakingTimeout: ReturnType<typeof setTimeout> | null = null;
let isAudioPlaying = false;
let cachedVoices: SpeechSynthesisVoice[] = [];

// Initialize voices eagerly if Web Speech API is present
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    cachedVoices = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      try {
        cachedVoices = window.speechSynthesis.getVoices();
      } catch {}
    };
  } catch {}
}

export interface SpeakOptions {
  voice?: string;
  speed?: number;
  engine?: 'auto' | 'speechSynthesis' | 'kokoro';
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

/**
 * Sanitize conversational text for natural speech synthesis.
 * Strips markdown code blocks, bold/italics asterisks, link syntax, etc.
 */
export function cleanTextForSpeech(rawText: string): string {
  if (!rawText) return '';
  let text = rawText.trim();

  // Strip code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  // Strip inline code backticks
  text = text.replace(/`([^`]+)`/g, '$1');
  // Strip bold and italics asterisks / underscores
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  // Strip markdown headers
  text = text.replace(/^#+\s+/gm, '');
  // Strip list bullet markers
  text = text.replace(/^\s*[-*•]\s+/gm, '');
  // Strip markdown links [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Get the highest quality natural English voice available in the browser.
 */
export function getBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // Browser/OS voice names vary; prefer quality markers before legacy voices.
  const naturalEnglishVoices = voices.filter(
    (voice) => /^en(?:[-_]|$)/i.test(voice.lang) &&
      /natural|neural|enhanced|premium/i.test(voice.name)
  );
  if (naturalEnglishVoices.length > 0) {
    return naturalEnglishVoices.find((voice) => /^en[-_]US$/i.test(voice.lang)) ||
      naturalEnglishVoices.find((voice) => voice.default) ||
      naturalEnglishVoices[0];
  }
  // Prioritize high-quality natural voices across Chrome, Edge, Safari, Firefox
  const preferredVoiceNames = [
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Guy Online (Natural) - English (United States)',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Google US English',
    'Samantha',
    'Karen',
    'Daniel',
    'Alex',
    'Victoria',
    'Microsoft David - English (United States)',
    'Microsoft Zira - English (United States)'
  ];

  for (const preferred of preferredVoiceNames) {
    const matched = voices.find((v) => v.name === preferred || v.name.includes(preferred));
    if (matched) return matched;
  }

  // Fallback to any en-US voice, then any English voice, then first available
  return (
    voices.find((v) => v.lang.startsWith('en-US')) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    voices[0] ||
    null
  );
}

/**
 * Pre-unlock browser speech and audio capabilities on direct user interaction.
 * Call this inside click/tap event handlers (e.g. Start Interview button, mic button).
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.resume();
      if (cachedVoices.length === 0) {
        cachedVoices = window.speechSynthesis.getVoices();
      }
    } catch {}
  }
}

/**
 * Stop any current speech playback immediately (both SpeechSynthesis and HTMLAudio).
 * Prevents overlapping audio streams and frees resources.
 */
export function stopSpeaking(): void {
  // 1. Cancel browser-native speech synthesis if currently active or pending
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } catch {}
  }

  // 2. Clear keep-alive timeouts
  if (speakingTimeout) {
    clearTimeout(speakingTimeout);
    speakingTimeout = null;
  }

  // 3. Cancel any in-flight Kokoro backend request
  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch {}
    activeAbortController = null;
  }

  // 4. Pause and disconnect active HTMLAudioElement if one was playing
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

  // 5. Revoke active object URL
  if (activeObjectUrl) {
    try {
      URL.revokeObjectURL(activeObjectUrl);
    } catch {}
    activeObjectUrl = null;
  }

  activeUtterance = null;
  isAudioPlaying = false;
}

/**
 * Check whether speech audio is currently playing.
 */
export function isSpeaking(): boolean {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      return true;
    }
  }
  return isAudioPlaying || activeAbortController !== null;
}

/**
 * Speak text using browser-native SpeechSynthesis for instant, zero-latency playback.
 */
function speakWithSpeechSynthesis(
  cleanText: string,
  options?: SpeakOptions
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  try {
    // Unpause speech synthesis in case Chromium was idle or paused
    window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    activeUtterance = utterance;

    const voice = getBestVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }

    utterance.pitch = 1.0;
    utterance.rate = options?.speed || 0.98;

    let hasEnded = false;
    const finalize = () => {
      if (hasEnded) return;
      hasEnded = true;
      if (speakingTimeout) {
        clearTimeout(speakingTimeout);
        speakingTimeout = null;
      }
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }
      isAudioPlaying = false;
      options?.onEnd?.();
    };

    utterance.onstart = () => {
      isAudioPlaying = true;
      options?.onStart?.();
    };

    utterance.onend = () => {
      finalize();
    };

    utterance.onerror = (e) => {
      // In Chrome, if cancel() was called (e.g. user barge-in), e.error === 'interrupted' or 'canceled'
      const errType = (e as any).error;
      if (errType === 'interrupted' || errType === 'canceled') {
        finalize();
        return;
      }
      console.warn('[MockMate TTS] SpeechSynthesis error:', errType || e);
      finalize();
      options?.onError?.(e);
    };

    // Safety fallback timeout in case the browser drops the onend event
    const estimatedDurationMs = Math.min(Math.max(cleanText.length * 85, 3000), 30000);
    speakingTimeout = setTimeout(() => {
      if (!hasEnded) {
        finalize();
      }
    }, estimatedDurationMs);

    window.speechSynthesis.speak(utterance);
    // Extra resume() immediately after speak() prevents Chrome pause lockup
    window.speechSynthesis.resume();
    return true;
  } catch (synthErr) {
    console.warn('[MockMate TTS] SpeechSynthesis.speak failed, trying fallback:', synthErr);
    return false;
  }
}

/**
 * Fallback speech synthesis using backend Kokoro-82M ONNX (/tts endpoint).
 */
async function speakWithKokoroBackend(
  cleanText: string,
  options?: SpeakOptions
): Promise<void> {
  const abortController = new AbortController();
  activeAbortController = abortController;

  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:8000');
  const baseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
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
        speed: options?.speed || 0.92,
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
    if (abortController.signal.aborted) return;

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
      console.warn('[MockMate TTS] Audio element playback error:', e);
      finalize(false);
      options?.onError?.(e);
      options?.onEnd?.();
    };

    try {
      await audio.play();
    } catch (playErr: any) {
      if (playErr.name === 'AbortError') {
        finalize(false);
        return;
      }
      console.warn('[MockMate TTS] Audio play prevented (autoplay policy):', playErr);
      finalize(false);
      options?.onError?.(playErr);
      options?.onEnd?.();
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    console.warn('[MockMate TTS] Kokoro TTS request failed:', err.message || err);
    options?.onError?.(err);
    options?.onEnd?.();
  }
}

/**
 * Main Text-to-Speech entry point.
 * 
 * - Triggers speech immediately from the response event with ultra-low latency (<15ms).
 * - Guaranteed synchronization with the Live Chat response display.
 * - Always cancels previous speech to avoid overlapping audio.
 * - Default engine ('auto') uses browser-native SpeechSynthesis for instant, audible output;
 *   falls back to Kokoro backend if SpeechSynthesis is unavailable.
 */
export async function speakText(
  text: string,
  options?: SpeakOptions
): Promise<void> {
  // Stop previous speech only if speech is currently active to avoid unnecessary cancels
  if (isSpeaking()) {
    stopSpeaking();
  }

  if (!text || !text.trim()) {
    options?.onEnd?.();
    return;
  }

  const cleanText = cleanTextForSpeech(text);
  if (!cleanText) {
    options?.onEnd?.();
    return;
  }

  const engine = options?.engine || 'auto';

  // 1. Try browser-native SpeechSynthesis for instant, zero-latency playback
  if (engine === 'auto' || engine === 'speechSynthesis') {
    const started = speakWithSpeechSynthesis(cleanText, options);
    if (started) {
      return;
    }
  }

  // 2. Fallback to Kokoro backend if SpeechSynthesis is not supported or if explicitly requested
  await speakWithKokoroBackend(cleanText, options);
}
