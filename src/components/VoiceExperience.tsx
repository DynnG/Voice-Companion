import React, { useState, useRef, useEffect } from 'react';
import { VoiceState, AttachedDocument, Message } from '../types/conversation';
import { Header } from './Header';
import { VoiceCreature } from './VoiceCreature';
import { StateLabel } from './StateLabel';
import { ResponseCaption } from './ResponseCaption';
import { VoiceControls } from './VoiceControls';
import { transcribeAudio } from '../services/sttService';
import { sendInterviewMessage, ConversationTurn } from '../services/interviewService';

interface VoiceExperienceProps {
  onUserAnswerAndAiResponse?: (userText: string, aiResponse: string) => void;
  onUserTranscribed?: (userText: string) => void;
  onThinkingChange?: (thinking: boolean) => void;
  isLivePanelOpen: boolean;
  onToggleLivePanel: () => void;
  unreadCount?: number;
  jobRole?: string;
  attachedDocuments?: AttachedDocument[];
  conversationHistory?: Message[];
  initialQuestionToSpeak?: string;
}

export const VoiceExperience: React.FC<VoiceExperienceProps> = ({
  onUserAnswerAndAiResponse,
  onUserTranscribed,
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

  // Clean up media stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const showCaption = (text: string) => {
    setCaptionText(text);
    setCaptionVisible(true);
  };

  const hideCaption = () => {
    setCaptionVisible(false);
  };

  const startRecording = async () => {
    if (isProcessingRef.current) return;
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
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        // Stop mic tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
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

      mediaRecorder.start(250);
      setState('listening');
      setCustomLabel('listening… (tap to finish answer)');
    } catch (err: any) {
      console.error('Microphone error:', err);
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

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setState('thinking');
      setCustomLabel('transcribing answer & consulting Gemini…');
      onThinkingChange?.(true);
      isProcessingRef.current = true;
    }
  };

  const processAudioTranscriptionAndInterview = async (audioBlob: Blob) => {
    setState('thinking');
    setCustomLabel('transcribing & generating Gemini follow-up…');
    onThinkingChange?.(true);

    try {
      // Map conversation history into context
      const historyContext = conversationHistory.map((m) => ({
        sender: m.sender,
        text: m.text
      }));

      const result = await transcribeAudio(audioBlob, {
        jobRole,
        attachedDocuments: attachedDocuments.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category
        })),
        history: historyContext,
        generateAiResponse: true
      });

      const userText = (result.transcription || result.text || '').trim();
      const aiResponse = (result.ai_response || '').trim();

      if (userText.length > 0) {
        console.log('[Live Interview] User spoken transcription:', userText);
        console.log('[Live Interview] Gemini follow-up response:', aiResponse);

        // Immediately update Live Conversation with both user answer and Gemini follow-up question
        if (onUserAnswerAndAiResponse && aiResponse) {
          onUserAnswerAndAiResponse(userText, aiResponse);
        } else if (onUserTranscribed) {
          onUserTranscribed(userText);
        }

        onThinkingChange?.(false);

        if (aiResponse) {
          showCaption(aiResponse);
          setCustomLabel('Interviewer follow-up ready');
          setState('speaking');

          setTimeout(() => {
            setState('idle');
            setCustomLabel(undefined);
            isProcessingRef.current = false;
          }, 3500);
        } else {
          setState('speaking');
          setCustomLabel('transcribed');
          showCaption(`"${userText}"`);

          setTimeout(() => {
            hideCaption();
            setState('idle');
            setCustomLabel(undefined);
            isProcessingRef.current = false;
          }, 2600);
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

  const handleToggleFlow = () => {
    if (state === 'idle') {
      startRecording();
    } else if (state === 'listening') {
      stopRecording();
    } else if (state === 'speaking') {
      startRecording();
    }
  };

  return (
    <div className="stage relative w-full h-full flex flex-col items-center justify-between overflow-hidden">
      <Header />

      <VoiceCreature state={state} onTap={handleToggleFlow} />

      <StateLabel state={state} customLabel={customLabel} />

      <div className="w-full flex flex-col items-center gap-[14px]">
        <ResponseCaption captionText={captionText} visible={captionVisible} />
        <VoiceControls
          state={state}
          onStartFlow={handleToggleFlow}
          isPanelOpen={isLivePanelOpen}
          onTogglePanel={onToggleLivePanel}
          unreadCount={unreadCount}
          statusHint={statusHint}
        />
      </div>
    </div>
  );
};

