import React, { useState, useRef, useEffect } from 'react';
import { VoiceState, Conversation } from '../types/conversation';
import { Header } from './Header';
import { VoiceCreature } from './VoiceCreature';
import { StateLabel } from './StateLabel';
import { ResponseCaption } from './ResponseCaption';
import { VoiceControls } from './VoiceControls';
import { transcribeAudio } from '../services/sttService';
import { sendInterviewMessage, ConversationTurn } from '../services/interviewService';

interface VoiceExperienceProps {
  activeConversation?: Conversation;
  onUserTranscribed?: (userText: string) => void;
  onPalResponse?: (palText: string) => void;
  isLivePanelOpen: boolean;
  onToggleLivePanel: () => void;
  unreadCount?: number;
}

export const VoiceExperience: React.FC<VoiceExperienceProps> = ({
  activeConversation,
  onUserTranscribed,
  onPalResponse,
  isLivePanelOpen,
  onToggleLivePanel,
  unreadCount = 0
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
          isProcessingRef.current = false;
          return;
        }

        await processAudioTranscriptionAndInterview(audioBlob);
      };

      mediaRecorder.start(250);
      setState('listening');
      setCustomLabel('listening… (tap to finish)');
    } catch (err: any) {
      console.error('Microphone error:', err);
      setState('idle');
      setCustomLabel(undefined);
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
      setCustomLabel('transcribing with faster-whisper…');
      isProcessingRef.current = true;
    }
  };

  const processAudioTranscriptionAndInterview = async (audioBlob: Blob) => {
    setState('thinking');
    setCustomLabel('transcribing audio…');

    let transcript = '';

    // Step 1: Faster-Whisper Speech-To-Text
    try {
      const result = await transcribeAudio(audioBlob);
      transcript = result.text ? result.text.trim() : '';
    } catch (apiError: any) {
      console.error('STT API error:', apiError);
      setState('idle');
      setCustomLabel('connection error');
      setStatusHint('Backend unreachable at http://localhost:8000. Ensure uvicorn server is running.');
      showCaption(`STT Error: ${apiError.message || 'Failed to connect to STT backend'}`);

      setTimeout(() => {
        hideCaption();
        setCustomLabel(undefined);
        isProcessingRef.current = false;
      }, 4000);
      return;
    }

    // Step 2: Handle Empty Speech
    if (!transcript) {
      setState('speaking');
      setCustomLabel(undefined);
      showCaption('No speech detected. Please tap the mic and try speaking again.');

      setTimeout(() => {
        hideCaption();
        setState('idle');
        isProcessingRef.current = false;
      }, 2600);
      return;
    }

    // Step 3: Record User Transcription
    if (onUserTranscribed) {
      onUserTranscribed(transcript);
    }

    // Step 4: Call Gemini for AI Interview Response
    setState('thinking');
    setCustomLabel('Pal is thinking…');

    try {
      // Build conversation history from active conversation
      const history: ConversationTurn[] = (activeConversation?.messages || []).map((m) => ({
        role: m.sender === 'Pal' ? 'pal' : 'user',
        text: m.text,
      }));

      // Document context snippets if available
      const contextDocs = activeConversation?.attachedDocuments?.map(
        (doc) => `[File: ${doc.name}] Category: ${doc.category}`
      );

      const aiResult = await sendInterviewMessage({
        message: transcript,
        history,
        job_role: activeConversation?.jobRole || 'Software Developer',
        context_docs: contextDocs,
      });

      const reply = aiResult.text || '';

      if (onPalResponse && reply) {
        onPalResponse(reply);
      }

      // Display Interviewer response
      setState('speaking');
      setCustomLabel('Pal responded');
      showCaption(reply);

      setTimeout(() => {
        hideCaption();
        setState('idle');
        setCustomLabel(undefined);
        isProcessingRef.current = false;
      }, 4500);
    } catch (geminiError: any) {
      console.warn('Gemini interviewer error or unconfigured:', geminiError);
      // STT succeeded, show user's transcription if Gemini fails or is unconfigured
      setState('speaking');
      setCustomLabel('transcribed');
      showCaption(`"${transcript}"`);

      if (geminiError.message && geminiError.message.includes('GEMINI_API_KEY')) {
        setStatusHint('Add GEMINI_API_KEY to backend/.env to enable AI interviewer responses.');
      }

      setTimeout(() => {
        hideCaption();
        setState('idle');
        setCustomLabel(undefined);
        isProcessingRef.current = false;
      }, 3000);
    }
  };

  const handleToggleFlow = () => {
    if (state === 'idle') {
      startRecording();
    } else if (state === 'listening') {
      stopRecording();
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
