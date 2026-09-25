import React, { useState, useRef, useEffect } from 'react';
import { VoiceState } from '../types/conversation';
import { Header } from './Header';
import { VoiceCreature } from './VoiceCreature';
import { StateLabel } from './StateLabel';
import { ResponseCaption } from './ResponseCaption';
import { VoiceControls } from './VoiceControls';
import { transcribeAudio } from '../services/sttService';

interface VoiceExperienceProps {
  onUserTranscribed?: (userText: string) => void;
  isLivePanelOpen: boolean;
  onToggleLivePanel: () => void;
  unreadCount?: number;
}

export const VoiceExperience: React.FC<VoiceExperienceProps> = ({
  onUserTranscribed,
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

        await processAudioTranscription(audioBlob);
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

  const processAudioTranscription = async (audioBlob: Blob) => {
    setState('thinking');
    setCustomLabel('transcribing audio…');

    try {
      const result = await transcribeAudio(audioBlob);
      const text = result.text ? result.text.trim() : '';

      if (text.length > 0) {
        // Send transcribed message to conversation transcript
        if (onUserTranscribed) {
          onUserTranscribed(text);
        }

        setState('speaking');
        setCustomLabel('transcribed');
        showCaption(`"${text}"`);

        setTimeout(() => {
          hideCaption();
          setState('idle');
          setCustomLabel(undefined);
          isProcessingRef.current = false;
        }, 2600);
      } else {
        // No speech recognized
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
