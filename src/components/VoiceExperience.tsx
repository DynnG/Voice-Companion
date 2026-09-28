import React, { useState, useRef, useEffect } from 'react';
import { VoiceState, AttachedDocument, Message, AnswerAttempt, ReplayState } from '../types/conversation';
import { Header } from './Header';
import { VoiceCreature } from './VoiceCreature';
import { StateLabel } from './StateLabel';
import { ResponseCaption } from './ResponseCaption';
import { VoiceControls } from './VoiceControls';
import { AnswerReplayCard } from './AnswerReplayCard';
import { transcribeAudio, fetchFollowupInterviewQuestion, fetchAnswerAiNotes, fetchAnswerComparison } from '../services/sttService';
import { speakText, stopSpeaking, unlockAudio } from '../services/ttsService';

interface VoiceExperienceProps {
  interviewId?: string;
  onUserTranscribed?: (userText: string) => void;
  onPalResponse?: (palText: string) => void;
  onThinkingChange?: (thinking: boolean) => void;
  onInterviewCompleted?: (reason?: string) => void;
  interviewStatus?: 'setup' | 'active' | 'ending' | 'completed';
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
  interviewId,
  onUserTranscribed,
  onPalResponse,
  onThinkingChange,
  onInterviewCompleted,
  interviewStatus = 'active',
  isLivePanelOpen,
  onToggleLivePanel,
  unreadCount = 0,
  jobRole,
  attachedDocuments = [],
  conversationHistory = [],
  initialQuestionToSpeak
}) => {
  const isCompleted = interviewStatus === 'completed';
  const [state, setState] = useState<VoiceState>('idle');
  const [customLabel, setCustomLabel] = useState<string | undefined>(
    isCompleted ? 'Interview Complete' : undefined
  );
  const [captionText, setCaptionText] = useState('');
  const [captionVisible, setCaptionVisible] = useState(false);
  const [statusHint, setStatusHint] = useState<string | undefined>(
    isCompleted ? 'Interview Complete · Review the full transcript in the side panel' : undefined
  );

  // Session-Only Answer Replay State
  const [replayState, setReplayState] = useState<ReplayState>({
    questionText: initialQuestionToSpeak || '',
    attempt1: null,
    attempt2: null,
    comparison: null,
    isRetryMode: false,
    isVisible: false,
    isMinimized: false
  });
  const replayAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingAttempt, setPlayingAttempt] = useState<(1 | 2) | null>(null);
  const [playbackCurrentTime, setPlaybackCurrentTime] = useState<number>(0);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const objectUrlsRef = useRef<string[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const currentQuestionBeingAnsweredRef = useRef<string>(initialQuestionToSpeak || '');

  useEffect(() => {
    if (initialQuestionToSpeak) {
      currentQuestionBeingAnsweredRef.current = initialQuestionToSpeak;
    }
  }, [initialQuestionToSpeak]);

  useEffect(() => {
    if (isCompleted) {
      setCustomLabel('Interview Complete');
      setStatusHint('Interview Complete · Review the full transcript in the side panel');
      setState('idle');
    }
  }, [isCompleted]);

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
  const micAudioLevelRef = useRef<number>(0);

  // Play initial interviewer question with Kokoro TTS on mount if provided
  useEffect(() => {
    if (initialQuestionToSpeak) {
      showCaption(initialQuestionToSpeak);
      setCustomLabel('Pal (Interviewer)');

      speakText(initialQuestionToSpeak, {
        onStart: () => {
          setState('speaking');
        },
        onEnd: () => {
          setState('idle');
          setCustomLabel(undefined);
        },
        onError: (err) => {
          console.warn('[VoiceExperience] Kokoro TTS initial question error:', err);
          setState('idle');
          setCustomLabel(undefined);
        }
      });

      return () => {
        stopSpeaking();
      };
    }
  }, [initialQuestionToSpeak]);

  // Clean up all audio resources on unmount
  useEffect(() => {
    return () => {
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

  const playAttempt = (attemptNum: 1 | 2) => {
    stopSpeaking();
    stopReplayPlayback();

    const attempt = attemptNum === 1 ? replayState.attempt1 : replayState.attempt2;
    if (!attempt || !attempt.audioUrl) return;

    try {
      const audio = new Audio(attempt.audioUrl);
      replayAudioRef.current = audio;
      setPlayingAttempt(attemptNum);

      audio.ontimeupdate = () => {
        if (audio.duration && audio.duration > 0) {
          setPlaybackCurrentTime(audio.currentTime);
          setPlaybackProgress(audio.currentTime / audio.duration);
        }
      };

      audio.onended = () => {
        setPlayingAttempt(null);
        setPlaybackCurrentTime(0);
        setPlaybackProgress(0);
        replayAudioRef.current = null;
      };

      audio.onerror = (e) => {
        console.warn('[Answer Replay] Audio playback error:', e);
        setPlayingAttempt(null);
        replayAudioRef.current = null;
      };

      audio.play().catch((playErr) => {
        console.warn('[Answer Replay] Audio play prevented:', playErr);
        setPlayingAttempt(null);
      });
    } catch (e) {
      console.warn('[Answer Replay] Could not initialize audio:', e);
      setPlayingAttempt(null);
    }
  };

  const handleTryAgain = () => {
    stopSpeaking();
    stopReplayPlayback();
    setReplayState((prev) => ({
      ...prev,
      isRetryMode: true,
      isMinimized: false
    }));
    setCustomLabel('Attempt 2 · Tap mic to record');
    setStatusHint('Attempt 2 · Tap microphone once to speak your revised answer');
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

        // Normalize microphone audio amplitude to 0.0 - 1.0 for dynamic voice-reactive orb
        // Quiet ambient noise is below 0.012. Soft-saturate with tanh so sudden loud mic bursts cannot blow up.
        const rawEnergy = Math.max(0, rms - 0.012);
        const saturatedLevel = Math.min(1.0, Math.tanh(rawEnergy * 8.0));
        micAudioLevelRef.current = saturatedLevel;

        const now = Date.now();

        if (rms > SILENCE_THRESHOLD_RMS) {
          // Voice detected
          if (!hasSpokenRef.current) {
            hasSpokenRef.current = true;
            speechStartTimeRef.current = now;
            setCustomLabel('listening to your answer…');
            stopSpeaking();
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
    if (isCompleted || isProcessingRef.current) return;
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

      recordingStartTimeRef.current = Date.now();
      stopReplayPlayback();
      mediaRecorder.start();
      setState('listening');
      setCustomLabel(replayState.isRetryMode ? 'listening… speak revised answer' : 'listening… speak your answer');

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
   */
  const processAudioTranscriptionAndInterview = async (audioBlob: Blob) => {
    isProcessingRef.current = true;
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
      const durationSeconds = result.duration && result.duration > 0
        ? Math.round(result.duration)
        : Math.max(1, Math.round((Date.now() - recordingStartTimeRef.current) / 1000));

      if (userText.length > 0) {
        if (replayState.isRetryMode) {
          console.log('[Live Interview] User spoken Attempt 2 transcription:', userText);
          const audioUrl2 = URL.createObjectURL(audioBlob);
          objectUrlsRef.current.push(audioUrl2);

          const attempt2Data: AnswerAttempt = {
            attemptNumber: 2,
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
            onUserTranscribed(`(Attempt 2) ${userText}`);
          }

          setState('idle');
          setCustomLabel('Attempt 2 complete');
          setStatusHint('Compare your answers above · Click Resume Interview to continue');
          isProcessingRef.current = false;

          const questionToCompare = replayState.questionText || currentQuestionBeingAnsweredRef.current || 'Interview Question';
          fetchAnswerComparison({
            interviewId,
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

          return;
        }

        // --- Standard Interview Turn (Attempt 1) ---
        console.log('[Live Interview] 1. User spoken transcription:', userText);

        // Revoke previous turn object URLs to keep session memory clean
        objectUrlsRef.current.forEach((u) => {
          try { URL.revokeObjectURL(u); } catch {}
        });
        objectUrlsRef.current = [];

        const audioUrl1 = URL.createObjectURL(audioBlob);
        objectUrlsRef.current.push(audioUrl1);

        const questionAnswered = currentQuestionBeingAnsweredRef.current || initialQuestionToSpeak || 'Interview Question';

        const attempt1Data: AnswerAttempt = {
          attemptNumber: 1,
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
          durationSeconds
        }).then((notesRes) => {
          setReplayState((prev) => {
            if (!prev.attempt1 || prev.attempt1.audioUrl !== audioUrl1) return prev;
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

        // Step 6: Append Gemini response as separate "Pal (Interviewer)" state update
        if (onPalResponse && aiResponse) {
          onPalResponse(aiResponse);
          currentQuestionBeingAnsweredRef.current = aiResponse;
        }

        // Step 7: Display interviewer follow-up, closing statement, or unavailable notice
        if (aiResponse) {
          showCaption(aiResponse);

          const isErrorState = followupResult.status === 'error' || Boolean(followupResult.error_type);

          if (isErrorState) {
            const isQuota = followupResult.error_type === 'quota_exceeded' || followupResult.error_type === 'quota_exhausted' || aiResponse.includes('usage limit');
            const isConnection = followupResult.error_type === 'connection_error' || aiResponse.includes('connection error');
            setCustomLabel('Interviewer unavailable');
            setStatusHint(
              isQuota
                ? 'Gemini usage limit reached · You can retry once service is available'
                : isConnection
                ? 'Connection error · Tap the mic to try speaking again'
                : 'AI service error · Tap the mic to try speaking again'
            );
            setState('speaking');

            // Reset creature to idle ready for retry, keeping interview active
            setTimeout(() => {
              setState('idle');
              setCustomLabel('Interviewer unavailable');
              setStatusHint(
                isQuota
                  ? 'Gemini usage limit reached · Tap the mic to retry when available'
                  : isConnection
                  ? 'Connection error · Tap the mic to try speaking again'
                  : 'AI service error · Tap the mic to try speaking again'
              );
              isProcessingRef.current = false;
            }, 3500);
            return;
          }

          if (shouldEnd) {
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

          const currentTurnLabel = endReason === 'wrapup_question' ? 'Wrap-up question' : 'Interviewer follow-up';
          setCustomLabel(currentTurnLabel);

          speakText(aiResponse, {
            onStart: () => {
              setState('speaking');
            },
            onEnd: () => {
              setState('idle');
              setCustomLabel(endReason === 'wrapup_question' ? 'Wrap-up question' : undefined);
              if (endReason === 'wrapup_question') {
                setStatusHint('Wrap-up · Feel free to share anything not yet covered');
              }
              isProcessingRef.current = false;
            },
            onError: (err) => {
              console.warn('[VoiceExperience] Kokoro TTS speech playback error:', err);
              setState('idle');
              setCustomLabel(endReason === 'wrapup_question' ? 'Wrap-up question' : undefined);
              isProcessingRef.current = false;
            }
          });
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
   * Flow handler: Mic button click starts turn when idle,
   * interrupts and starts answering when speaking (barge-in),
   * or finishes recording early when listening.
   */
  const handleToggleFlow = () => {
    unlockAudio();
    if (isCompleted) return;

    // Barge-in: if Pal is currently speaking, tapping mic immediately stops speech and starts recording
    if (state === 'speaking') {
      stopSpeaking();
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

  const isCompactVisual = Boolean(replayState.isVisible && replayState.attempt1 && !replayState.isMinimized);

  return (
    <div className="stage relative w-full h-full flex flex-col items-center justify-between overflow-hidden select-none">
      {/* 1. Fixed Header */}
      <div className="w-full shrink-0">
        <Header />
      </div>

      {/* 2. Responsive Central Interactive Area */}
      <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-between px-3 sm:px-6 py-1 sm:py-2 overflow-hidden">
        {/* Upper Zone: Pal / Voice Visualization */}
        <div className={`w-full flex flex-col items-center justify-center transition-all duration-300 overflow-visible ${
          isCompactVisual ? 'shrink-0 pt-0.5' : 'flex-1'
        }`}>
          <VoiceCreature
            state={state}
            onTap={isCompleted ? undefined : handleToggleFlow}
            audioLevelRef={micAudioLevelRef}
            compact={isCompactVisual}
          />

          <div className="shrink-0 mt-1 sm:mt-1.5 min-h-[18px] flex items-center justify-center">
            <StateLabel state={state} customLabel={customLabel} />
          </div>

          {/* Dynamic Subtitle Slot: Visible when caption text exists, or collapsed to save space during replay */}
          {captionVisible ? (
            <div className="w-full max-w-lg h-[46px] shrink-0 flex items-center justify-center mt-1 px-2 overflow-hidden">
              <ResponseCaption captionText={captionText} visible={captionVisible} />
            </div>
          ) : !replayState.isVisible ? (
            <div className="w-full max-w-lg h-[46px] shrink-0 flex items-center justify-center mt-1 px-2 overflow-hidden" />
          ) : null}
        </div>

        {/* Dedicated Lower-Middle Zone: Answer Comparison / Replay Panel */}
        {replayState.isVisible && replayState.attempt1 && (
          <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-center my-1 sm:my-2 px-1 sm:px-2 z-10">
            <AnswerReplayCard
              replayState={replayState}
              onPlayAttempt={playAttempt}
              onStopPlayback={stopReplayPlayback}
              playingAttempt={playingAttempt}
              playbackCurrentTime={playbackCurrentTime}
              playbackProgress={playbackProgress}
              onTryAgain={handleTryAgain}
              onCancelRetry={handleCancelRetry}
              onResumeInterview={handleResumeInterview}
              onToggleMinimize={() => setReplayState((prev) => ({ ...prev, isMinimized: !prev.isMinimized }))}
              onClose={() => setReplayState((prev) => ({ ...prev, isVisible: false }))}
            />
          </div>
        )}
      </div>

      {/* 3. Anchored Bottom Controls: Mic button ALWAYS fixed in position */}
      <div className="w-full shrink-0">
        <VoiceControls
          state={state}
          onStartFlow={handleToggleFlow}
          isPanelOpen={isLivePanelOpen}
          onTogglePanel={onToggleLivePanel}
          unreadCount={unreadCount}
          statusHint={statusHint || (isCompleted ? 'Interview Complete · Review the full transcript in the side panel' : 'Tap microphone once to speak · Auto-detects when you finish')}
          isCompleted={isCompleted}
        />
      </div>
    </div>
  );
};
