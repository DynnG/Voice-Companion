import React, { useState, useRef, useEffect } from 'react';
import { VoiceState, AttachedDocument, Message, AnswerAttempt, ReplayState, InterviewExchangeRecord } from '../types/conversation';
import { MessageSquare, Plus, AlertCircle, X, Lightbulb } from 'lucide-react';
import { VoiceCreature } from './VoiceCreature';
import { StateLabel } from './StateLabel';

import { CandidateCamera } from './CandidateCamera';
import { replayPlaybackTiming } from '../services/replayPlayback';
import { VoiceControls } from './VoiceControls';
import { updateSpeechEndpoint, SpeechEndpointState } from '../services/speechEndpoint';
import { AnswerReplayCard } from './AnswerReplayCard';
import { transcribeAudio, fetchFollowupInterviewQuestion, fetchAnswerAiNotes, fetchAnswerComparison, isQuotaExceededText, isInterviewErrorText, isOffTopicRedirect, isClarificationQuery } from '../services/sttService';
import { speakText, stopSpeaking, unlockAudio } from '../services/ttsService';

interface VoiceExperienceProps {
  interviewId?: string;
  onUserTranscribed?: (userText: string, replayId?: string) => void;
  replayRequest?: { id: string; request: number } | null;
  onPalResponse?: (palText: string) => void;
  onThinkingChange?: (thinking: boolean) => void;
  onInterviewCompleted?: (reason?: string) => void;
  interviewStatus?: 'setup' | 'active' | 'ending' | 'completed';
  turnsUsed?: number;
  maxTurns?: number;
  isLivePanelOpen: boolean;
  onToggleLivePanel: () => void;
  unreadCount?: number;
  jobRole?: string;
  candidateName?: string;
  attachedDocuments?: AttachedDocument[];
  conversationHistory?: Message[];
  initialQuestionToSpeak?: string;
  onExchangeRecorded?: (record: InterviewExchangeRecord) => void;
  onExchangeAiNotesUpdated?: (exchangeId: string, notes: string[]) => void;
  onOpenCompletionReview?: () => void;
  canDownloadReview?: boolean;
  onDownloadReview?: () => void;
  isDownloadingReview?: boolean;
  downloadReviewError?: string | null;
  onRegisterSubmitAnswer?: (handler: (text: string) => Promise<void>) => void;
  startInterviewError?: string | null;
  onRetryStartInterview?: () => void;
  onNewInterview?: () => void;
}

// Silence Detection Configuration
const MAX_RECORDING_DURATION_MS = 60000;    // 60s hard ceiling safeguard

// Hard interview ending limit to conserve Gemini free-tier quota (maximum 8 candidate turns)
export const MAX_INTERVIEW_TURNS = 8;
export const INTERVIEW_ENDING_MESSAGE = "That brings us to the end of our interview. Thank you for taking the time to practice with me. You did a great job working through the questions. You can now review your answers and feedback.";

export const VoiceExperience: React.FC<VoiceExperienceProps> = ({
  interviewId,
  onUserTranscribed,
  replayRequest,
  onPalResponse,
  onThinkingChange,
  onInterviewCompleted,
  interviewStatus = 'active',
  turnsUsed: turnsUsedProp,
  maxTurns = MAX_INTERVIEW_TURNS,
  isLivePanelOpen,
  onToggleLivePanel,
  unreadCount = 0,
  jobRole,
  candidateName,
  attachedDocuments = [],
  conversationHistory = [],
  initialQuestionToSpeak,
  onExchangeRecorded,
  onExchangeAiNotesUpdated,
  onOpenCompletionReview,
  canDownloadReview = false,
  onDownloadReview,
  isDownloadingReview = false,
  downloadReviewError = null,
  onRegisterSubmitAnswer,
  startInterviewError = null,
  onNewInterview
}) => {
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);
  const [isTipVisible, setIsTipVisible] = useState(true);
  useEffect(() => {
    setIsErrorDismissed(false);
  }, [startInterviewError, interviewId]);

  // Candidate camera state and toggle reference
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const cameraToggleFnRef = useRef<(() => void) | null>(null);

  // Session completed flag derived from props and local lifecycle
  const [isLocallyCompleted, setIsLocallyCompleted] = useState<boolean>(
    interviewStatus === 'completed'
  );

  useEffect(() => {
    if (interviewStatus === 'completed') {
      setIsLocallyCompleted(true);
    }
  }, [interviewStatus]);

  const isCompleted = interviewStatus === 'completed' || isLocallyCompleted;

  const [state, setState] = useState<VoiceState>('idle');
  const [customLabel, setCustomLabel] = useState<string | undefined>(
    isCompleted ? 'Interview Complete' : undefined
  );
  const [, setCaptionText] = useState('');
  const [, setCaptionVisible] = useState(false);
  const [statusHint, setStatusHint] = useState<string | undefined>(
    isCompleted ? 'Interview Complete · Review the full transcript in the side panel' : undefined
  );
  const [creatureGesture, setCreatureGesture] = useState<'no' | null>(null);

  // Session-Only Answer Replay State
  const [replayState, setReplayState] = useState<ReplayState>({
    questionText: (initialQuestionToSpeak && !isQuotaExceededText(initialQuestionToSpeak) && !isInterviewErrorText(initialQuestionToSpeak)) ? initialQuestionToSpeak : '',
    attempt1: null,
    attempt2: null,
    comparison: null,
    isRetryMode: false,
    isVisible: false,
    isMinimized: false
  });
  const replayAudioRef = useRef<HTMLAudioElement | null>(null);
  const replayHistoryRef = useRef(new Map<string, ReplayState>());
  const displayedReplayIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (displayedReplayIdRef.current && replayState.attempt1) {
      replayHistoryRef.current.set(displayedReplayIdRef.current, replayState);
    }
  }, [replayState]);
  useEffect(() => {
    if (!replayRequest) return;
    const saved = replayHistoryRef.current.get(replayRequest.id);
    if (!saved) return;
    stopReplayPlayback();
    displayedReplayIdRef.current = replayRequest.id;
    setReplayState({ ...saved, isVisible: true, isMinimized: false, isRetryMode: false });
  }, [replayRequest]);

  const [playingAttempt, setPlayingAttempt] = useState<(1 | 2) | null>(null);
  const [playbackCurrentTime, setPlaybackCurrentTime] = useState<number>(0);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const objectUrlsRef = useRef<string[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const currentQuestionBeingAnsweredRef = useRef<string>(
    (initialQuestionToSpeak && !isQuotaExceededText(initialQuestionToSpeak) && !isInterviewErrorText(initialQuestionToSpeak)) ? initialQuestionToSpeak : ''
  );

  useEffect(() => {
    if (initialQuestionToSpeak && !isQuotaExceededText(initialQuestionToSpeak) && !isInterviewErrorText(initialQuestionToSpeak)) {
      currentQuestionBeingAnsweredRef.current = initialQuestionToSpeak;
    }
  }, [initialQuestionToSpeak]);



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
  const maxRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micAudioLevelRef = useRef<number>(0);
  const candidateTurnCountRef = useRef<number>(0);
  const currentExchangeIdRef = useRef<string | null>(null);
  const hasSpokenInitialRef = useRef<string | null>(null);

  useEffect(() => {
    candidateTurnCountRef.current = 0;
    currentExchangeIdRef.current = null;
    hasSpokenInitialRef.current = null;
  }, [interviewId]);

  // Active turn tracking & session availability
  const effectiveMaxTurns = maxTurns || MAX_INTERVIEW_TURNS;
  const currentTurnsUsed = Math.max(
    turnsUsedProp || 0,
    candidateTurnCountRef.current,
    conversationHistory.filter(
      (m) => m.sender === 'You' && !m.text.startsWith('(Attempt 2)')
    ).length
  );

  const hasRemainingTurns = !isCompleted && currentTurnsUsed < effectiveMaxTurns;
  const isMicEnabled = hasRemainingTurns && !isCompleted;

  // Play initial interviewer question with TTS on mount if provided (guarded against duplicate speech / re-renders)
  useEffect(() => {
    if (initialQuestionToSpeak && hasSpokenInitialRef.current !== initialQuestionToSpeak) {
      hasSpokenInitialRef.current = initialQuestionToSpeak;

      // Defensive guard: never show or speak quota-error text as an initial question
      if (isQuotaExceededText(initialQuestionToSpeak)) {
        console.warn('[VoiceExperience] Quota error detected in initialQuestionToSpeak. Suppressing caption and TTS speech.');
        setState('idle');
        setCustomLabel(undefined);
        hideCaption();
        return;
      }

      // Defensive guard: never show or speak connection/service error text as an initial question
      if (isInterviewErrorText(initialQuestionToSpeak)) {
        console.warn('[VoiceExperience] Connection/service error detected in initialQuestionToSpeak. Suppressing caption and TTS speech.');
        setState('idle');
        setCustomLabel(undefined);
        hideCaption();
        return;
      }

      showCaption(initialQuestionToSpeak);
      setCustomLabel('Savi (Interviewer)');

      speakText(initialQuestionToSpeak, {
        onStart: () => {
          setState('speaking');
        },
        onEnd: () => {
          setState('idle');
          setCustomLabel(undefined);
        },
        onError: (err) => {
          console.warn('[VoiceExperience] TTS initial question error:', err);
          setState('idle');
          setCustomLabel(undefined);
        }
      });
    }
  }, [initialQuestionToSpeak]);

  // Clean up all audio resources on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      cleanupAudioResources();
      stopReplayPlayback();
      objectUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      objectUrlsRef.current = [];
    };
  }, []);

  const stopReplayPlayback = () => {
    if (replayAudioRef.current) {
      try {
        replayAudioRef.current.pause();
      } catch {}
      replayAudioRef.current = null;
    }
    setPlayingAttempt(null);
    setPlaybackCurrentTime(0);
    setPlaybackProgress(0);
  };

  const playAttempt = (attemptNum: 1 | 2, seekTo?: number, autoplay = true) => {
    const attempt = attemptNum === 1 ? replayState.attempt1 : replayState.attempt2;
    if (!attempt?.audioUrl || attempt.inputMode === 'chat') return;
    if (autoplay) stopSpeaking();
    let audio = replayAudioRef.current;
    if (!audio || audio.getAttribute('src') !== attempt.audioUrl) {
      stopReplayPlayback();
      audio = new Audio(attempt.audioUrl);
      replayAudioRef.current = audio;
    }
    const player = audio;
    const duration = () => Number.isFinite(player.duration) && player.duration > 0 ? player.duration : attempt.durationSeconds;
    const sync = () => {
      const timing = replayPlaybackTiming(player, attempt.durationSeconds, player.currentTime);
      setPlaybackCurrentTime(timing.time);
      setPlaybackProgress(timing.progress);
    };
    player.onloadedmetadata = sync;
    player.ondurationchange = sync;
    player.ontimeupdate = sync;
    player.onseeked = sync;
    player.onended = () => { setPlayingAttempt(null); sync(); };
    player.onerror = () => { setPlayingAttempt(null); };
    if (seekTo !== undefined || player.ended) {
      const target = Math.max(0, Math.min(duration(), seekTo ?? 0));
      const seek = () => { player.currentTime = target; sync(); };
      if (player.readyState >= 1) seek(); else player.onloadedmetadata = seek;
      setPlaybackCurrentTime(target);
      setPlaybackProgress(duration() > 0 ? target / duration() : 0);
    }
    if (autoplay) {
      setPlayingAttempt(attemptNum);
      void player.play().catch(() => setPlayingAttempt(null));
    }
  };
  const seekReplay = (offset: number) => {
    const current = replayAudioRef.current?.currentTime ?? playbackCurrentTime;
    playAttempt(1, current + offset, false);
  };
  const pauseReplay = () => { replayAudioRef.current?.pause(); setPlayingAttempt(null); };
  const handleTryAgain = () => {
    if (!isMicEnabled || isCompleted) return;
    stopSpeaking();
    stopReplayPlayback();
    setReplayState((prev) => ({
      ...prev,
      isRetryMode: true,
      isMinimized: false
    }));
    setCustomLabel('Attempt 2 · Recording revised answer…');
    setStatusHint('Attempt 2 · Speak your revised answer · Auto-detects when you finish');
    if (state === 'idle' || state === 'speaking') {
      startRecording();
    }
  };

  const handleCancelRetry = () => {
    setReplayState((prev) => ({
      ...prev,
      isRetryMode: false
    }));
    setCustomLabel(undefined);
    setStatusHint(undefined);
  };

  const handleResumeInterview = () => {
    if (!isMicEnabled || isCompleted) return;
    stopReplayPlayback();
    setReplayState((prev) => ({
      ...prev,
      isRetryMode: false,
      isVisible: false
    }));
    setCustomLabel(undefined);
    setStatusHint(undefined);
    if (currentQuestionBeingAnsweredRef.current) {
      showCaption(currentQuestionBeingAnsweredRef.current);
    }
  };

  const cleanupAudioResources = () => {
    micAudioLevelRef.current = 0;
    stopSpeaking();
    stopReplayPlayback();

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
  const startSilenceDetection = async (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') await audioContext.resume();
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceNodeRef.current = source;

      const dataArray = new Uint8Array(analyser.fftSize);
      hasSpokenRef.current = false;
      const endpoint: SpeechEndpointState = { speechStartedAt: null, silenceStartedAt: null };

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

        // Normalize microphone audio amplitude to 0.0 - 1.0 for dynamic voice-reactive orb
        // Quiet ambient noise is below 0.012. Soft-saturate with tanh so sudden loud mic bursts cannot blow up.
        const rawEnergy = Math.max(0, rms - 0.012);
        const saturatedLevel = Math.min(1.0, Math.tanh(rawEnergy * 8.0));
        micAudioLevelRef.current = saturatedLevel;

        const now = performance.now();
        const shouldStop = updateSpeechEndpoint(endpoint, rms, now);
        if (!hasSpokenRef.current && endpoint.speechStartedAt !== null) {
          hasSpokenRef.current = true;
          setCustomLabel('listening to your answer…');
          stopSpeaking();
        }
        if (shouldStop) {
          stopRecordingAutomatically();
          return;
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
    if (!isMicEnabled || isCompleted || isProcessingRef.current) return;
    stopSpeaking();
    setCreatureGesture(null);
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
        if (import.meta.env.DEV) {
          console.info('[Audio diagnostic] Recording finalized', {
            recorderMimeType: mediaRecorder.mimeType,
            blobType: audioBlob.type,
            blobBytes: audioBlob.size,
            chunks: audioChunksRef.current.length,
            chunkBytes: audioChunksRef.current.map(chunk => chunk.size),
            recordingMs: Date.now() - recordingStartTimeRef.current,
          });
        }

        if (audioBlob.size < 100) {
          setState('idle');
          setCustomLabel(undefined);
          onThinkingChange?.(false);
          isProcessingRef.current = false;
          return;
        }

        await processAudioTranscriptionAndInterview(audioBlob);
      };

      recordingStartTimeRef.current = Date.now();
      stopReplayPlayback();
      mediaRecorder.start();
      setState('listening');
      setCustomLabel(replayState.isRetryMode ? 'listening… speak revised answer' : 'listening… speak your answer');

      // Start silence / speech endpoint detection
      await startSilenceDetection(stream);

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
    micAudioLevelRef.current = 0;
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
  /**
   * Core interview turn pipeline
   * Shared by both spoken audio and typed permanent transcript answers.
   */
  const processCandidateAnswer = async (
    userText: string,
    audioBlob: Blob,
    durationSeconds: number,
    hesitationEvidence?: any, inputMode: 'audio' | 'chat' = 'audio'
  ) => {
    if (replayState.isRetryMode) {
      console.log('[Live Interview] User Attempt 2 transcription:', userText);
      const audioUrl2 = inputMode === 'audio' ? URL.createObjectURL(audioBlob) : '';
      objectUrlsRef.current.push(audioUrl2);

      const attempt2Data: AnswerAttempt = {
        attemptNumber: 2, inputMode,
        audioBlob,
        audioUrl: audioUrl2,
        transcript: userText,
        durationSeconds,
        aiNotes: [],
        aiNotesStatus: 'loading'
      };

      setReplayState((prev) => ({
        ...prev,
        attempt2: attempt2Data,
        comparison: {
          improvements: [],
          stillImprove: [],
          attempt2Notes: [],
          status: 'loading'
        },
        isRetryMode: false,
        isVisible: true,
        isMinimized: false
      }));

      showCaption(`"Attempt 2: ${userText}"`);
      if (onUserTranscribed) {
        onUserTranscribed(`(Attempt 2) ${userText}`, currentExchangeIdRef.current || undefined);
      }

      const questionToCompare = (replayState.questionText && !isQuotaExceededText(replayState.questionText) && !isInterviewErrorText(replayState.questionText))
        ? replayState.questionText
        : (currentQuestionBeingAnsweredRef.current && !isQuotaExceededText(currentQuestionBeingAnsweredRef.current) && !isInterviewErrorText(currentQuestionBeingAnsweredRef.current))
        ? currentQuestionBeingAnsweredRef.current
        : 'Interview Question';

      // Update exchange record with revised Attempt 2 transcript
      if (currentExchangeIdRef.current) {
        onExchangeRecorded?.({
          id: currentExchangeIdRef.current,
          order: candidateTurnCountRef.current || 1,
          question: questionToCompare,
          userAnswer: userText,
          attempt1Answer: replayState.attempt1?.transcript || '',
          attempt2Answer: userText,
          durationSeconds,
          aiNotes: replayState.attempt1?.aiNotes || [],
          aiNotesStatus: 'loading',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }

      fetchAnswerComparison({
        question: questionToCompare,
        attempt1Answer: replayState.attempt1?.transcript || '',
        attempt1DurationSeconds: replayState.attempt1?.durationSeconds,
        attempt2Answer: userText,
        attempt2DurationSeconds: durationSeconds,
        jobRole,
        attachedDocuments: attachedDocuments.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          content: d.content || d.extractedText,
          extracted_text: d.content || d.extractedText
        }))
      }).then((compRes) => {
        if (currentExchangeIdRef.current && compRes.attempt2_notes && compRes.attempt2_notes.length > 0) {
          onExchangeAiNotesUpdated?.(currentExchangeIdRef.current, compRes.attempt2_notes);
        }
        setReplayState((prev) => {
          if (!prev.attempt2) return prev;
          return {
            ...prev,
            attempt2: {
              ...prev.attempt2,
              aiNotes: compRes.attempt2_notes || [],
              aiNotesStatus: compRes.status === 'success' ? 'success' : 'error',
              errorMessage: compRes.error_message
            },
            comparison: {
              improvements: compRes.improvements || [],
              stillImprove: compRes.still_improve || [],
              attempt2Notes: compRes.attempt2_notes || [],
              status: compRes.status === 'success' ? 'success' : 'error',
              errorMessage: compRes.error_message
            }
          };
        });
      });

      setState('idle');
      setCustomLabel(undefined);
      isProcessingRef.current = false;
      return;
    }

    // --- Standard Interview Turn (Attempt 1) ---
    console.log('[Live Interview] 1. User answer:', userText);

    // Retain session audio for reopening earlier answers; revoke on unmount.
    const audioUrl1 = inputMode === 'audio' ? URL.createObjectURL(audioBlob) : '';
    if (audioUrl1) objectUrlsRef.current.push(audioUrl1);

    const questionAnswered = (currentQuestionBeingAnsweredRef.current && !isQuotaExceededText(currentQuestionBeingAnsweredRef.current) && !isInterviewErrorText(currentQuestionBeingAnsweredRef.current))
      ? currentQuestionBeingAnsweredRef.current
      : (initialQuestionToSpeak && !isQuotaExceededText(initialQuestionToSpeak) && !isInterviewErrorText(initialQuestionToSpeak))
      ? initialQuestionToSpeak
      : 'Interview Question';

    const attempt1Data: AnswerAttempt = {
      attemptNumber: 1, inputMode,
      audioBlob,
      audioUrl: audioUrl1,
      transcript: userText,
      durationSeconds,
      aiNotes: [],
      aiNotesStatus: 'loading'
    };

    setReplayState({
      questionText: questionAnswered,
      attempt1: attempt1Data,
      attempt2: null,
      comparison: null,
      isRetryMode: false,
      isVisible: true,
      isMinimized: false
    });

    // Calculate candidate turn count (excluding Attempt 2 retries)
    const previousCandidateTurns = conversationHistory.filter(
      (m) => m.sender === 'You' && !m.text.startsWith('(Attempt 2)')
    ).length;
    const currentTurn = Math.max(previousCandidateTurns + 1, candidateTurnCountRef.current + 1);
    candidateTurnCountRef.current = currentTurn;

    const exchangeId = `exchange-${interviewId || 'session'}-${currentTurn}`;
    currentExchangeIdRef.current = exchangeId;
    displayedReplayIdRef.current = exchangeId;
    replayHistoryRef.current.set(exchangeId, { questionText: questionAnswered, attempt1: attempt1Data, attempt2: null, comparison: null, isRetryMode: false, isVisible: true, isMinimized: false });

    // Record complete current-session interview exchange in memory
    const newExchange: InterviewExchangeRecord = {
      id: exchangeId,
      order: currentTurn,
      question: questionAnswered,
      userAnswer: userText,
      attempt1Answer: userText,
      durationSeconds,
      aiNotes: [],
      aiNotesStatus: 'loading',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    onExchangeRecorded?.(newExchange);

    // Fire AI notes generation asynchronously (does NOT delay interview turn)
    fetchAnswerAiNotes({
      interviewId,
      question: questionAnswered,
      userAnswer: userText,
      jobRole,
      attachedDocuments: attachedDocuments.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        content: d.content || d.extractedText,
        extracted_text: d.content || d.extractedText
      })),
      durationSeconds,
      hesitationEvidence,
      inputMethod: inputMode
    }).then((notesRes) => {
      const saved = replayHistoryRef.current.get(exchangeId);
      if (saved?.attempt1) replayHistoryRef.current.set(exchangeId, { ...saved, attempt1: { ...saved.attempt1, aiNotes: notesRes.notes || [], aiNotesStatus: notesRes.status === 'success' ? 'success' : 'error', errorMessage: notesRes.error_message } });
      if (notesRes.status === 'success' && notesRes.notes && notesRes.notes.length > 0) {
        onExchangeAiNotesUpdated?.(exchangeId, notesRes.notes);
      }
      setReplayState((prev) => {
        if (!prev.attempt1 || prev.attempt1.audioBlob !== audioBlob) return prev;
        return {
          ...prev,
          attempt1: {
            ...prev.attempt1,
            aiNotes: notesRes.notes || [],
            aiNotesStatus: notesRes.status === 'success' ? 'success' : 'error',
            errorMessage: notesRes.error_message
          }
        };
      });
    });

    // Step 2: Immediately commit & render user's message as "You"
    if (onUserTranscribed) {
      onUserTranscribed(userText, exchangeId);
    }

    // Show user transcription on caption bubble
    showCaption(`"${userText}"`);

    console.log(`[Live Interview] Candidate turn ${currentTurn} of ${MAX_INTERVIEW_TURNS}`);

    // CHECK HARD TURN LIMIT: On the 8th turn, naturally conclude without calling Gemini follow-up
    if (currentTurn >= MAX_INTERVIEW_TURNS) {
      console.log(
        `[Live Interview] Final allowed turn (${currentTurn}/${MAX_INTERVIEW_TURNS}) reached. ` +
        'Naturally ending interview with concluding statement (bypassing Gemini follow-up API call).'
      );
      setIsLocallyCompleted(true);

      // Turn off thinking indicator
      onThinkingChange?.(false);

      // Append PAL ending message to conversation transcript
      if (onPalResponse) {
        onPalResponse(INTERVIEW_ENDING_MESSAGE);
        currentQuestionBeingAnsweredRef.current = INTERVIEW_ENDING_MESSAGE;
      }

      // Display ending message caption
      showCaption(INTERVIEW_ENDING_MESSAGE);
      setCustomLabel('Interview Complete');
      setStatusHint('Interview Complete · Well done!');

      // Mark interview COMPLETED
      onInterviewCompleted?.('turn_limit_reached');

      // Speak ending message with TTS
      speakText(INTERVIEW_ENDING_MESSAGE, {
        onStart: () => {
          setState('speaking');
        },
        onEnd: () => {
          setState('idle');
          setCustomLabel('Interview Complete');
          setStatusHint('Interview Complete · Review the full transcript in the side panel');
          isProcessingRef.current = false;
        },
        onError: (err) => {
          console.warn('[VoiceExperience] TTS ending message error:', err);
          setState('idle');
          setCustomLabel('Interview Complete');
          setStatusHint('Interview Complete · Review the full transcript in the side panel');
          isProcessingRef.current = false;
        }
      });
      return;
    }

    // Cost protection: strictly check turn availability before calling Gemini
    if (!hasRemainingTurns || isCompleted) {
      console.log('[Live Interview] Session completed or turn limit reached. Aborting Gemini follow-up.');
      setState('idle');
      isProcessingRef.current = false;
      return;
    }

    // Step 3: Wait for user message render to settle in conversation UI before showing thinking
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Step 4: Show chat thinking bubble while Gemini generates follow-up question
    onThinkingChange?.(true);
    setState('thinking');
    setCustomLabel('Interviewer is thinking…');

    // Step 5: Format updated conversation history including the user's latest response
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

    const followupResult = await fetchFollowupInterviewQuestion(
      userText,
      jobRole,
      updatedHistory,
      attachedDocuments.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        content: d.content || d.extractedText,
        extracted_text: d.content || d.extractedText
      })),
      interviewId
    );

    const aiResponse = followupResult.response;
    const shouldEnd = followupResult.should_end;
    const endReason = followupResult.reason;

    console.log('[Live Interview] 2. Gemini follow-up response:', aiResponse, 'should_end:', shouldEnd, 'reason:', endReason);
    // Turn off chat thinking bubble before rendering Pal follow-up
    onThinkingChange?.(false);

    const isErrorState = followupResult.status === 'error' || Boolean(followupResult.error_type);
    const isQuota = isErrorState && (
      followupResult.error_type === 'quota_exceeded' ||
      followupResult.error_type === 'quota_exhausted' ||
      followupResult.reason === 'gemini_quota_exceeded' ||
      (Boolean(aiResponse) && (aiResponse.includes('usage limit') || aiResponse.includes('quota')))
    );

    if (isQuota) {
      console.warn('[Live Interview] Gemini quota reached. Silently keeping session intact and awaiting next user turn.');
      setState('idle');
      setCustomLabel(undefined);
      hideCaption();
      isProcessingRef.current = false;
      return;
    }

    // For non-quota errors, preserve genuine error handling
    if (isErrorState) {
      const isConnection = followupResult.error_type === 'connection_error' || (Boolean(aiResponse) && aiResponse.includes('connection error'));
      const errorMsg = isConnection
        ? 'Connection error · Tap the mic to try speaking again'
        : 'AI service error · Tap the mic to try speaking again';

      setCustomLabel(isConnection ? 'connection error' : 'service error');
      setStatusHint(errorMsg);
      showCaption(aiResponse || errorMsg);

      // Reset creature to idle ready for retry, keeping interview active
      setTimeout(() => {
        hideCaption();
        setCustomLabel(undefined);
        setState('idle');
        isProcessingRef.current = false;
      }, 4000);
      return;
    }

    // Step 6: Commit AI follow-up response to conversation history
    if (onPalResponse && aiResponse) {
      onPalResponse(aiResponse);
      currentQuestionBeingAnsweredRef.current = aiResponse;
    }

    // Step 7: Display interviewer follow-up, closing statement, or wrap-up
    if (aiResponse) {
      showCaption(aiResponse);

      if (shouldEnd) {
        setIsLocallyCompleted(true);
        setCustomLabel('Interview Complete');
        setStatusHint('Interview Complete · Well done!');
        onInterviewCompleted?.(endReason);

        speakText(aiResponse, {
          onStart: () => {
            setState('speaking');
          },
          onEnd: () => {
            setState('idle');
            setCustomLabel('Interview Complete');
            setStatusHint('Interview Complete · Review the full transcript in the side panel');
            isProcessingRef.current = false;
          },
          onError: (err) => {
            console.warn('[VoiceExperience] Kokoro TTS closing statement error:', err);
            setState('idle');
            setCustomLabel('Interview Complete');
            setStatusHint('Interview Complete · Review the full transcript in the side panel');
            isProcessingRef.current = false;
          }
        });
        return;
      }

      const isOffTopic = !isClarificationQuery(userText) && (
        endReason === 'off_topic_redirect' ||
        isOffTopicRedirect(aiResponse, endReason)
      );

      if (isOffTopic) {
        setCreatureGesture('no');
      }

      const currentTurnLabel = endReason === 'wrapup_question'
        ? 'Wrap-up question'
        : isOffTopic
          ? 'stay on topic…'
          : 'Interviewer follow-up';
      setCustomLabel(currentTurnLabel);

      speakText(aiResponse, {
        onStart: () => {
          setState('speaking');
          if (isOffTopic) {
            setCreatureGesture('no');
          }
        },
        onEnd: () => {
          setState('idle');
          setCreatureGesture(null);
          setCustomLabel(endReason === 'wrapup_question' ? 'Wrap-up question' : undefined);
          if (endReason === 'wrapup_question') {
            setStatusHint('Wrap-up · Feel free to share anything not yet covered');
          }
          isProcessingRef.current = false;
        },
        onError: (err) => {
          console.warn('[VoiceExperience] Kokoro TTS speech playback error:', err);
          setState('idle');
          setCreatureGesture(null);
          setCustomLabel(endReason === 'wrapup_question' ? 'Wrap-up question' : undefined);
          isProcessingRef.current = false;
        }
      });
    } else {
      setState('idle');
      setCustomLabel(undefined);
      isProcessingRef.current = false;
    }
  };

  /**
   * Process microphone speech audio through Faster-Whisper STT
   */
  const processAudioTranscriptionAndInterview = async (audioBlob: Blob) => {
    if (!isMicEnabled || isCompleted) {
      console.warn('[Live Interview] Session has ended or turn limit reached. Ignoring audio transcription.');
      setState('idle');
      setCustomLabel('Interview Complete');
      isProcessingRef.current = false;
      return;
    }

    isProcessingRef.current = true;
    setState('thinking');
    setCustomLabel('transcribing answer…');

    try {
      // Step 1: Faster-whisper Speech-to-Text transcription ONLY
      const result = await transcribeAudio(audioBlob, {
        jobRole,
        generateAiResponse: false
      });

      const userText = (result.transcription || result.text || '').trim();
      const durationSeconds = result.duration && result.duration > 0
        ? Math.round(result.duration)
        : Math.max(1, Math.round((Date.now() - recordingStartTimeRef.current) / 1000));

      if (userText.length > 0) {
        await processCandidateAnswer(userText, audioBlob, durationSeconds, result.hesitation_evidence);
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
   * Process permanent typed answer directly from the transcript sidebar
   */
  const processTypedAnswer = async (typedText: string) => {
    if (!isMicEnabled || isCompleted || (isProcessingRef.current && state !== 'speaking')) {
      return;
    }
    const cleanText = typedText.trim();
    if (!cleanText) return;

    unlockAudio();
    isProcessingRef.current = true;
    // A submitted typed answer replaces an unfinished microphone take.
    // Detach onstop first so stopping it cannot submit a second answer.
    stopSpeaking();
    stopReplayPlayback();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.ondataavailable = null;
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    cleanupAudioResources();
    audioChunksRef.current = [];
    micAudioLevelRef.current = 0;

    isProcessingRef.current = true;
    setState('thinking');
    setCustomLabel('processing answer…');

    // Keep answer identity without creating a fake recording for typed turns.
    const syntheticBlob = new Blob([]);
    const wordCount = cleanText.split(/\s+/).length;
    const estimatedDuration = Math.max(2, Math.round(wordCount / 2.5));

    await processCandidateAnswer(cleanText, syntheticBlob, estimatedDuration, undefined, 'chat');
  };

  // The sidebar keeps one callback, which always reads the latest session state.
  const typedAnswerHandlerRef = useRef(processTypedAnswer);
  typedAnswerHandlerRef.current = processTypedAnswer;
  useEffect(() => {
    onRegisterSubmitAnswer?.((text) => typedAnswerHandlerRef.current(text));
  }, [onRegisterSubmitAnswer]);

  const handleToggleFlow = () => {
    unlockAudio();
    if (!isMicEnabled || isCompleted) return;

    // Barge-in: if Pal is currently speaking, tapping mic immediately stops speech and starts recording
    if (state === 'speaking') {
      stopSpeaking();
      setCreatureGesture(null);
      isProcessingRef.current = false;
      startRecording();
      return;
    }

    if (isProcessingRef.current) return;
    if (state === 'idle') {
      startRecording();
    } else if (state === 'listening') {
      stopRecordingManually();
    }
  };

  const showTip = isTipVisible && conversationHistory.length === 0 && !replayState.attempt1 &&
    !(initialQuestionToSpeak && !isQuotaExceededText(initialQuestionToSpeak) && !isInterviewErrorText(initialQuestionToSpeak));

  useEffect(() => {
    if (isCompleted) {
      setCustomLabel('Interview Complete');
      setStatusHint('Interview Complete · Review the full transcript in the side panel');
      setState('idle');
      
      stopSpeaking();
      stopReplayPlayback();
      cleanupAudioResources();
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.ondataavailable = null;
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      isProcessingRef.current = false;
    }
  }, [isCompleted]);

  const isCompactVisual = Boolean(
    replayState.isVisible &&
    replayState.attempt1 &&
    !replayState.isMinimized
  );

  return (
    <div data-camera-active={isCameraActive} data-replay-expanded={isCompactVisual} className="stage relative w-full h-full flex flex-col justify-between overflow-hidden select-none px-3 sm:px-6 py-2 sm:py-3">
      {/* 1. Header Bar: Brand Logo, Job Role, In Progress pill, Transcript toggle sitting directly on background */}
      <header className="flex items-center justify-between w-full pb-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Savi Logo */}
{/* Savi Brand Logo & Title */}
<div className="flex items-center gap-2.5 shrink-0">
  <img
    src="/favicon-192x192.png"
    alt="Savi logo"
    className="w-7 h-7 shrink-0 object-contain"
  />

  <span className="font-fraunces font-normal text-xl tracking-tight text-[#F5EEDB] leading-none">
    Savi
  </span>
</div>

          <span className="w-px h-6 bg-[rgba(218,241,222,0.14)] shrink-0" />

          {/* AI Mock Interview & Job Role */}
          <div className="flex flex-col justify-center min-w-0">
            <span className="font-semibold text-xs sm:text-[13px] text-[#F5EEDB] leading-tight truncate">
              AI Mock Interview
            </span>
            <span className="text-[11px] text-[#8EB69B] leading-tight truncate">
              {jobRole || 'Software Developer'}
            </span>
          </div>

          {/* New Interview Button in Header */}
          {onNewInterview && (
            <>
              <span className="w-px h-6 bg-[rgba(218,241,222,0.14)] shrink-0 hidden sm:block" />
              <button
                type="button"
                onClick={onNewInterview}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(9,32,23,0.55)] hover:bg-[rgba(9,32,23,0.80)] text-[#F5EEDB] border border-[rgba(218,241,222,0.14)] active:scale-95 transition-all"
                title="Start a new interview session"
              >
                <Plus className="w-3.5 h-3.5 text-[#FFB347]" />
                <span>New Interview</span>
              </button>
            </>
          )}
        </div>

        {/* Header Right: In Progress Badge & Transcript Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isCompleted && onOpenCompletionReview && (
            <button
              type="button"
              onClick={onOpenCompletionReview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(255,179,71,0.14)] hover:bg-[rgba(255,179,71,0.24)] text-[#FFC370] border border-[rgba(255,179,71,0.4)] active:scale-95 transition-all"
              title="View Interview Review"
            >
              <span>Review</span>
            </button>
          )}

          <span className="interview-progress inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[rgba(255,179,71,0.4)] text-[#FFC370] text-xs font-semibold bg-[rgba(255,179,71,0.06)] shadow-sm">
            <i className="w-1.5 h-1.5 rounded-full bg-[#FFB347] animate-pulse" />
            {isCompleted ? 'Completed' : 'In Progress'}
          </span>

          <button
            type="button"
            onClick={onToggleLivePanel}
            className={`interview-transcript-toggle inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 border ${
              isLivePanelOpen
                ? 'bg-[rgba(255,179,71,0.16)] text-[#FFC370] border-[rgba(255,179,71,0.35)] shadow-sm'
                : 'bg-[rgba(9,32,23,0.55)] hover:bg-[rgba(9,32,23,0.8)] text-[#F5EEDB] border-[rgba(218,241,222,0.14)]'
            }`}
            title="Toggle Transcript Panel"
            aria-expanded={isLivePanelOpen}
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#FFB347]" />
            <span>Transcript</span>
          </button>
        </div>

      </header>

      {startInterviewError && !isErrorDismissed && (
        <div role="alert" className="w-full max-w-xl mx-auto my-2 px-3 py-2 rounded-2xl bg-[rgba(220,38,38,0.15)] border border-[rgba(248,113,113,0.35)] backdrop-blur-md flex items-center justify-between gap-3 text-red-200 text-xs shadow-lg shrink-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
            <span className="break-words">{startInterviewError}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsErrorDismissed(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-500/20 text-red-200 transition-colors shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
            aria-label="Dismiss connection error"
            title="Dismiss message"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 3. Main Stage: Candidate Camera (Left, when active) | Savi Orb (Centered or Right) */}
      <div
        className={`interview-visual-stage ${showTip ? 'interview-visual-stage--with-tip' : ''} w-full mx-auto flex-1 min-h-0 overflow-visible py-1 sm:py-2 transition-all duration-300 flex flex-col justify-center ${
          isLivePanelOpen ? 'max-w-5xl' : 'max-w-5xl xl:max-w-6xl'
        }`}
      >
        {showTip && (
          <aside className="interview-tip-card" aria-label="Interview tip">
            <div className="interview-tip-heading"><Lightbulb size={18} aria-hidden="true" /><strong>Tip</strong></div>
            <button type="button" className="interview-tip-dismiss" aria-label="Dismiss interview tip" onClick={() => setIsTipVisible(false)}><X size={14} aria-hidden="true" /></button>
            <p>Be specific about your experiences, use concrete examples, and highlight the impact you made.</p>
          </aside>
        )}
        <div
          className={`interview-visual-pair w-full flex items-center justify-center transition-all duration-300 ${
            isCameraActive
              ? 'grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-8 items-center justify-items-center'
              : 'flex flex-col items-center justify-center gap-2 sm:gap-3'
          }`}
        >
          {/* Left Column on Desktop / Second in Stack: Candidate Camera (Always mounted to retain stream hooks; hidden when camera is off) */}
          <div
            className={
              isCameraActive
                ? 'interview-camera-column flex flex-col items-center justify-center w-full max-w-[520px] lg:max-w-[560px] h-full order-2 md:order-1 shrink-0'
                : 'hidden'
            }
          >
            <CandidateCamera
              candidateName={candidateName || 'Candidate'}
              candidateRole={jobRole || 'Software Developer'}
              recordingActive={state === 'listening'}
              compact={isCompactVisual}
              onCameraActiveChange={setIsCameraActive}
              registerToggle={(fn) => { cameraToggleFnRef.current = fn; }}
            />
          </div>

          {/* Savi Orb Column: Top priority in vertical stack (order-1), Right on desktop (md:order-2), Centered when camera is OFF */}
          <div
            className={`interview-orb-column flex flex-col items-center justify-center h-full gap-2 transition-all duration-300 shrink-0 ${
              isCameraActive
                ? 'w-full max-w-[420px] lg:max-w-[460px] order-1 md:order-2'
                : 'w-full max-w-2xl'
            }`}
          >
            <div className="w-full flex items-center justify-center overflow-visible">
              <VoiceCreature
                state={state}
                visualState={state === 'speaking' || state === 'listening' ? 'speaking' : state === 'thinking' && customLabel === 'transcribing answer…' ? 'transcribing' : 'idle'}
                respectReducedMotion
                gesture={creatureGesture}
                onGestureEnd={() => setCreatureGesture(null)}
                onTap={!isMicEnabled || isCompleted ? undefined : handleToggleFlow}
                audioLevelRef={micAudioLevelRef}
                compact={isCompactVisual}
                className={`interview-orb ${!isCameraActive && !isCompactVisual ? 'canvas-wrap--hero' : ''}`}
              />
            </div>

            <div className="interview-orb-labels">
              <span className="interview-savi-name">Savi</span>
              <StateLabel state={state} customLabel={isCompleted ? 'Interview complete' : customLabel} />
            </div>

          </div>
        </div>
      </div>

      {/* 4. Dedicated Lower-Middle Zone: Answer Comparison / Replay Panel & Bottom Controls (One Cohesive Lower Section) */}
      {/* Container class invariant: w-full flex-1 min-h-0 flex flex-col items-center justify-center */}
      <div className="interview-lower-zone relative w-full shrink-0 flex flex-col items-center gap-1.5 sm:gap-2 z-10 mt-auto pb-1 transition-all duration-300 ease-out">
        {/* Dedicated Lower-Middle Zone: Answer Comparison / Replay Panel */}
        {replayState.isVisible && replayState.attempt1 && (
          <div
            className={`w-full flex-1 min-h-0 flex flex-col items-center justify-center mx-auto px-1 sm:px-2 z-10 shrink-0 transition-all duration-300 ${
              isLivePanelOpen ? 'max-w-5xl' : 'max-w-5xl xl:max-w-6xl'
            }`}
          >
            <AnswerReplayCard
              replayState={replayState}
              onPlayAttempt={playAttempt}
              onStopPlayback={pauseReplay} onSeekPlayback={seekReplay}
              playingAttempt={playingAttempt}
              playbackCurrentTime={playbackCurrentTime}
              playbackProgress={playbackProgress}
              playbackAudio={replayAudioRef.current}
              onTryAgain={handleTryAgain}
              onCancelRetry={handleCancelRetry}
              onResumeInterview={handleResumeInterview}
              onToggleMinimize={() => setReplayState((prev) => ({ ...prev, isMinimized: !prev.isMinimized }))}
              onClose={() => setReplayState((prev) => ({ ...prev, isVisible: false }))}
              isCompleted={!isMicEnabled || isCompleted}
              reviewOnly={displayedReplayIdRef.current !== currentExchangeIdRef.current}
            />
          </div>
        )}

        {/* 5. Anchored Bottom Controls: Speak, Camera, Tip, Supporting Instruction Text */}
        <div className="w-full shrink-0 transition-all duration-300 ease-out">
          <VoiceControls
            state={state}
            onStartFlow={handleToggleFlow}
            isPanelOpen={isLivePanelOpen}
            onTogglePanel={onToggleLivePanel}
            unreadCount={unreadCount}
            statusHint={statusHint || (!isMicEnabled || isCompleted ? 'Interview Complete · Review the full transcript in the side panel' : 'Tap microphone once to speak · Auto-detects when you finish')}
            isCompleted={!isMicEnabled || isCompleted}
            onOpenReview={onOpenCompletionReview}
            canDownloadReview={canDownloadReview}
            onDownloadReview={onDownloadReview}
            isDownloadingReview={isDownloadingReview}
            downloadReviewError={downloadReviewError}
            onToggleCamera={() => cameraToggleFnRef.current?.()}
            isCameraActive={isCameraActive}
            compact={isCompactVisual}
          />
        </div>
      </div>
    </div>
  );
};
