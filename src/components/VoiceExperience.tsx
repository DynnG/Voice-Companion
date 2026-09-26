import React, { useState, useRef, useEffect } from 'react';
import { VoiceState, AttachedDocument, Message } from '../types/conversation';
import { Header } from './Header';
import { VoiceCreature } from './VoiceCreature';
import { StateLabel } from './StateLabel';
import { ResponseCaption } from './ResponseCaption';
import { VoiceControls } from './VoiceControls';
import { transcribeAudio, fetchFollowupInterviewQuestion } from '../services/sttService';

interface VoiceExperienceProps {
  onUserTranscribed?: (userText: string) => void;
  onPalResponse?: (palText: string) => void;
  onThinkingChange?: (thinking: boolean) => void;
  isLivePanelOpen: boolean;
  onToggleLivePanel: () => void;
  unreadCount?: number;
  jobRole?: string;
  attachedDocuments?: AttachedDocument[];
  conversationHistory?: Message[];
  initialQuestionToSpeak?: string;
}

// Silence Detection Configuration
const SILENCE_THRESHOLD_RMS = 0.018;        // Audio energy threshold to consider as silence vs speech
const SILENCE_DURATION_MS = 1600;           // 1.6s of continuous silence after speaking triggers auto-finish
const MIN_SPEECH_DURATION_MS = 800;         // Minimum speech duration (800ms) before silence detector can trigger
const MAX_RECORDING_DURATION_MS = 60000;    // 60s hard ceiling safeguard

export const VoiceExperience: React.FC<VoiceExperienceProps> = ({
  onUserTranscribed,
  onPalResponse,
  onThinkingChange,
  isLivePanelOpen,
  onToggleLivePanel,
  unreadCount = 0,
  jobRole,
  attachedDocuments = [],
  conversationHistory = [],
  initialQuestionToSpeak
}) => {
  const [state, setState] = useState<VoiceState>('idle');
  const [customLabel, setCustomLabel] = useState<string | undefined>(undefined);
  const [captionText, setCaptionText] = useState('');
  const [captionVisible, setCaptionVisible] = useState(false);
  const [statusHint, setStatusHint] = useState<string | undefined>(undefined);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isProcessingRef = useRef(false);

  // Web Audio VAD / Silence Detection Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadAnimationIdRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  const speechStartTimeRef = useRef<number>(0);
  const silenceStartTimeRef = useRef<number | null>(null);
  const maxRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show initial interviewer question on mount if provided
  useEffect(() => {
    if (initialQuestionToSpeak) {
      showCaption(initialQuestionToSpeak);
      setCustomLabel('Pal (Interviewer)');
      setState('speaking');

      const timer = setTimeout(() => {
        setState('idle');
        setCustomLabel(undefined);
      }, 3500);

      return () => clearTimeout(timer);
    }
  }, [initialQuestionToSpeak]);

  // Clean up all audio resources on unmount
  useEffect(() => {
    return () => {
      cleanupAudioResources();
    };
  }, []);

  const cleanupAudioResources = () => {
    if (vadAnimationIdRef.current) {
      cancelAnimationFrame(vadAnimationIdRef.current);
      vadAnimationIdRef.current = null;
    }

    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {}
      analyserRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const showCaption = (text: string) => {
    setCaptionText(text);
    setCaptionVisible(true);
  };

  const hideCaption = () => {
    setCaptionVisible(false);
  };

  /**
   * Monitor live microphone stream audio levels with Web Audio AnalyserNode.
   * Detects when user begins speaking, permits natural short pauses, and triggers
   * auto-stop once the user has finished their response (1.6s of silence after speech).
   */
  const startSilenceDetection = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceNodeRef.current = source;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      hasSpokenRef.current = false;
      speechStartTimeRef.current = 0;
      silenceStartTimeRef.current = null;

      const checkAudioLevels = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
          return;
        }

        analyser.getByteTimeDomainData(dataArray);

        // Compute Root Mean Square (RMS) energy
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const now = Date.now();

        if (rms > SILENCE_THRESHOLD_RMS) {
          // Voice detected
          if (!hasSpokenRef.current) {
            hasSpokenRef.current = true;
            speechStartTimeRef.current = now;
            setCustomLabel('listening to your answer…');
          }
          silenceStartTimeRef.current = null;
        } else {
          // Silence or ambient background
          if (hasSpokenRef.current) {
            const speechDuration = now - speechStartTimeRef.current;

            if (speechDuration >= MIN_SPEECH_DURATION_MS) {
              if (silenceStartTimeRef.current === null) {
                silenceStartTimeRef.current = now;
              } else if (now - silenceStartTimeRef.current >= SILENCE_DURATION_MS) {
                // User has finished speaking! Automatically stop recording and process turn
                console.log(`[VAD] User completed answer (${(now - silenceStartTimeRef.current)}ms silence). Auto-finishing turn.`);
                stopRecordingAutomatically();
                return;
              }
            }
          }
        }

        vadAnimationIdRef.current = requestAnimationFrame(checkAudioLevels);
      };

      vadAnimationIdRef.current = requestAnimationFrame(checkAudioLevels);
    } catch (e) {
      console.warn('[VAD] Web Audio Analyser setup failed, fallback to manual stop:', e);
    }
  };

  /**
   * One-click start: User clicks the mic once to start recording.
   * Auto-detection handles the stop.
   */
  const startRecording = async () => {
    if (isProcessingRef.current) return;
    cleanupAudioResources();
    hideCaption();
    setStatusHint(undefined);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Select supported audio mimeType
      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        cleanupAudioResources();

        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        if (audioBlob.size < 100) {
          setState('idle');
          setCustomLabel(undefined);
          onThinkingChange?.(false);
          isProcessingRef.current = false;
          return;
        }

        await processAudioTranscriptionAndInterview(audioBlob);
      };

      mediaRecorder.start(250);
      setState('listening');
      setCustomLabel('listening… speak your answer');

      // Start silence / speech endpoint detection
      startSilenceDetection(stream);

      // Max recording ceiling safeguard (e.g. 60s)
      maxRecordingTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          console.log('[VAD] Maximum recording duration reached, auto-stopping.');
          stopRecordingAutomatically();
        }
      }, MAX_RECORDING_DURATION_MS);

    } catch (err: any) {
      console.error('Microphone error:', err);
      cleanupAudioResources();
      setState('idle');
      setCustomLabel(undefined);
      onThinkingChange?.(false);
      isProcessingRef.current = false;

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showCaption('Microphone permission denied. Please allow microphone access.');
      } else {
        showCaption(`Microphone error: ${err.message || 'Unable to access audio device'}`);
      }

      setTimeout(() => hideCaption(), 3500);
    }
  };

  /**
   * Automatically triggered when speech silence is detected.
   */
  const stopRecordingAutomatically = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      // Keep voice sphere indicator active internally, but DO NOT show chat thinking bubble yet
      setState('thinking');
      setCustomLabel('transcribing answer…');
      isProcessingRef.current = true;
    }
  };

  /**
   * Manual stop fallback in case user wants to manually finish before silence timeout.
   */
  const stopRecordingManually = () => {
    stopRecordingAutomatically();
  };

  /**
   * Complete sequential turn processing:
   * 1. Audio -> faster-whisper STT (transcription only, generateAiResponse: false).
   * 2. Immediately commit & render user transcript to conversation messages ("You" message).
   * 3. Allow React state update & render to settle so candidate's answer visibly appears in Live Conversation.
   * 4. Only after "You" message is committed, show Gemini "thinking" indicator in the chat panel.
   * 5. Query Gemini API for follow-up question (passing extracted document contents).
   * 6. Hide thinking bubble, then append/render complete Gemini response as "Pal (Interviewer)" message.
   * 7. Reset mic state so it is ready for the next response.
   */
  const processAudioTranscriptionAndInterview = async (audioBlob: Blob) => {
    // Keep voice sphere indicator internal during Whisper transcription; do NOT show chat thinking bubble yet
    setState('thinking');
    setCustomLabel('transcribing answer…');

    try {
      // Step 1: Faster-whisper Speech-to-Text transcription ONLY
      const result = await transcribeAudio(audioBlob, {
        jobRole,
        generateAiResponse: false
      });

      const userText = (result.transcription || result.text || '').trim();

      if (userText.length > 0) {
        console.log('[Live Interview] 1. User spoken transcription:', userText);

        // Step 2: Immediately commit & render user's message as "You"
        if (onUserTranscribed) {
          onUserTranscribed(userText);
        }

        // Show user transcription on caption bubble
        showCaption(`"${userText}"`);

        // Step 3: Wait for user message render to settle in conversation UI before showing thinking
        await new Promise((resolve) => setTimeout(resolve, 250));

        // Step 4: ONLY after the YOU message is committed, show Gemini "thinking" in the chat
        setCustomLabel('consulting Gemini interviewer…');
        onThinkingChange?.(true);

        // Step 5: Build updated conversation context including the new user response
        const updatedHistory = [
          ...conversationHistory.map((m) => ({
            sender: m.sender as 'You' | 'Pal',
            text: m.text
          })),
          {
            sender: 'You' as const,
            text: userText
          }
        ];

        // Step 6: Query Gemini API for next follow-up question (including document contents!)
        const aiResponse = await fetchFollowupInterviewQuestion(
          userText,
          jobRole,
          updatedHistory,
          attachedDocuments.map((d) => ({
            id: d.id,
            name: d.name,
            category: d.category,
            content: d.content || d.extractedText,
            extracted_text: d.content || d.extractedText
          }))
        );

        console.log('[Live Interview] 2. Gemini follow-up response:', aiResponse);
        // Turn off chat thinking bubble before rendering Pal follow-up
        onThinkingChange?.(false);

        // Step 6: Append Gemini response as separate "Pal (Interviewer)" state update
        if (onPalResponse && aiResponse) {
          onPalResponse(aiResponse);
        }

        // Step 7: Display interviewer follow-up
        if (aiResponse) {
          showCaption(aiResponse);
          setCustomLabel('Interviewer follow-up');
          setState('speaking');

          // Reset mic ready for the next turn
          setTimeout(() => {
            setState('idle');
            setCustomLabel(undefined);
            isProcessingRef.current = false;
          }, 3500);
        } else {
          setState('idle');
          setCustomLabel(undefined);
          isProcessingRef.current = false;
        }
      } else {
        // No speech recognized
        onThinkingChange?.(false);
        setState('speaking');
        setCustomLabel(undefined);
        showCaption('No speech detected. Please tap the mic and try speaking again.');

        setTimeout(() => {
          hideCaption();
          setState('idle');
          isProcessingRef.current = false;
        }, 2600);
      }
    } catch (apiError: any) {
      console.error('Interview STT / Gemini API error:', apiError);
      onThinkingChange?.(false);
      setState('idle');
      setCustomLabel('connection error');
      setStatusHint('Backend unreachable at http://localhost:8000. Ensure uvicorn server is running.');
      showCaption(`Error: ${apiError.message || 'Failed to process voice interview'}`);

      setTimeout(() => {
        hideCaption();
        setCustomLabel(undefined);
        isProcessingRef.current = false;
      }, 4000);
      return;
    }
  };

  /**
   * Flow handler: Mic button click ONLY starts the turn when idle or speaking.
   * If already listening, user can optionally tap to finish early.
   */
  const handleToggleFlow = () => {
    if (state === 'idle' || state === 'speaking') {
      startRecording();
    } else if (state === 'listening') {
      stopRecordingManually();
    }
  };

  return (
    <div className="stage relative w-full h-full flex flex-col items-center justify-between overflow-hidden select-none">
      {/* 1. Fixed Header */}
      <div className="w-full shrink-0">
        <Header />
      </div>

      {/* 2. Responsive Central Interactive Area */}
      <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center px-4 py-1 sm:py-2">
        <VoiceCreature state={state} onTap={handleToggleFlow} />

        <div className="shrink-0 mt-1 sm:mt-2 min-h-[20px] flex items-center justify-center">
          <StateLabel state={state} customLabel={customLabel} />
        </div>

        {/* Dynamic Subtitle Slot: Fixed stable height constraint to ensure controls never move */}
        <div className="w-full max-w-lg h-[62px] shrink-0 flex items-center justify-center mt-1 px-2 overflow-hidden">
          <ResponseCaption captionText={captionText} visible={captionVisible} />
        </div>
      </div>

      {/* 3. Anchored Bottom Controls: Mic button ALWAYS fixed in position */}
      <div className="w-full shrink-0">
        <VoiceControls
          state={state}
          onStartFlow={handleToggleFlow}
          isPanelOpen={isLivePanelOpen}
          onTogglePanel={onToggleLivePanel}
          unreadCount={unreadCount}
          statusHint={statusHint || 'Tap microphone once to speak · Auto-detects when you finish'}
        />
      </div>
    </div>
  );
};
