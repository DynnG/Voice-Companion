import React, { useState, useRef } from 'react';
import { VoiceState } from '../types/conversation';
import { Header } from './Header';
import { VoiceCreature } from './VoiceCreature';
import { StateLabel } from './StateLabel';
import { ResponseCaption } from './ResponseCaption';
import { VoiceControls } from './VoiceControls';

interface VoiceExperienceProps {
  onNewMessagePair?: (userText: string, palText: string) => void;
  isLivePanelOpen: boolean;
  onToggleLivePanel: () => void;
  unreadCount?: number;
}

const REPLIES = [
  "Got it — here's what I found for you.",
  "Sure thing. Let me walk you through it.",
  "That's a good question. Here's the short answer."
];

const USER_PROMPTS = [
  "Can you summarize my daily schedule and action items?",
  "What are the best patterns for React state management?",
  "Could you explain how the organic creature animation works?",
  "What should I keep in mind for our project architecture?"
];

export const VoiceExperience: React.FC<VoiceExperienceProps> = ({
  onNewMessagePair,
  isLivePanelOpen,
  onToggleLivePanel,
  unreadCount = 0
}) => {
  const [state, setState] = useState<VoiceState>('idle');
  const [captionText, setCaptionText] = useState('');
  const [captionVisible, setCaptionVisible] = useState(false);
  const busyRef = useRef(false);

  const startFlow = () => {
    if (busyRef.current) return;
    busyRef.current = true;

    setCaptionVisible(false);
    setState('listening');

    // Pick user prompt and Pal reply for transcript addition
    const prompt = USER_PROMPTS[Math.floor(Math.random() * USER_PROMPTS.length)];
    const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];

    setTimeout(() => {
      setState('thinking');
      setTimeout(() => {
        setState('speaking');
        setCaptionText(reply);
        setCaptionVisible(true);

        // Add to transcript
        if (onNewMessagePair) {
          onNewMessagePair(prompt, reply);
        }

        setTimeout(() => {
          setCaptionVisible(false);
          setState('idle');
          busyRef.current = false;
        }, 2600);
      }, 1100);
    }, 1800);
  };

  return (
    <div className="stage relative w-full h-full flex flex-col items-center justify-between overflow-hidden">
      <Header />

      <VoiceCreature state={state} onTap={startFlow} />

      <StateLabel state={state} />

      <div className="w-full flex flex-col items-center gap-[14px]">
        <ResponseCaption captionText={captionText} visible={captionVisible} />
        <VoiceControls
          state={state}
          onStartFlow={startFlow}
          isPanelOpen={isLivePanelOpen}
          onTogglePanel={onToggleLivePanel}
          unreadCount={unreadCount}
        />
      </div>
    </div>
  );
};
