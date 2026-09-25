/**
 * Text-to-Speech (TTS) Service using Web Speech API with natural voice selection.
 */

let activeUtterance: SpeechSynthesisUtterance | null = null;
let speakingTimeout: any = null;

/**
 * Get available English voice or natural voice.
 */
function getBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // Prioritize high-quality / natural English voices
  const preferredVoices = [
    'Google US English',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Guy Online (Natural) - English (United States)',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft David - English (United States)',
    'Microsoft Zira - English (United States)',
    'Samantha',
    'Karen',
    'Daniel'
  ];

  for (const name of preferredVoices) {
    const matched = voices.find((v) => v.name.includes(name) || v.name === name);
    if (matched) return matched;
  }

  // Fallback to any en-US or en voice
  return voices.find((v) => v.lang.startsWith('en-US')) || voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (speakingTimeout) {
    clearTimeout(speakingTimeout);
    speakingTimeout = null;
  }
  if (activeUtterance) {
    activeUtterance = null;
  }
}

export function speakText(
  text: string,
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis API not supported in this browser.');
    callbacks?.onStart?.();
    const duration = Math.min(Math.max(text.length * 55, 2000), 7000);
    setTimeout(() => callbacks?.onEnd?.(), duration);
    return;
  }

  stopSpeaking();

  if (!text || !text.trim()) {
    callbacks?.onEnd?.();
    return;
  }

  const cleanText = text.trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  activeUtterance = utterance;

  const bestVoice = getBestVoice();
  if (bestVoice) {
    utterance.voice = bestVoice;
    utterance.lang = bestVoice.lang;
  } else {
    utterance.lang = 'en-US';
  }

  utterance.pitch = 1.0;
  utterance.rate = 1.02;

  let hasEnded = false;

  const cleanupAndEnd = () => {
    if (hasEnded) return;
    hasEnded = true;
    if (speakingTimeout) {
      clearTimeout(speakingTimeout);
      speakingTimeout = null;
    }
    activeUtterance = null;
    callbacks?.onEnd?.();
  };

  utterance.onstart = () => {
    callbacks?.onStart?.();
  };

  utterance.onend = () => {
    cleanupAndEnd();
  };

  utterance.onerror = (e) => {
    console.warn('SpeechSynthesis error:', e);
    cleanupAndEnd();
  };

  // Fallback timeout in case browser speech synthesis event doesn't fire
  const estimatedDurationMs = Math.min(Math.max(cleanText.length * 80, 3000), 20000);
  speakingTimeout = setTimeout(() => {
    cleanupAndEnd();
  }, estimatedDurationMs);

  // Trigger speech synthesis
  window.speechSynthesis.speak(utterance);
}
