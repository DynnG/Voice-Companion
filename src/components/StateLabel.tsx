import React from 'react';
import { VoiceState } from '../types/conversation';

interface StateLabelProps {
  state: VoiceState;
}

const STATE_TEXT: Record<VoiceState, string> = {
  idle: 'tap to talk',
  listening: 'listening…',
  thinking: 'thinking…',
  speaking: 'speaking…',
};

const STATE_COLORS: Record<VoiceState, string> = {
  idle: '',
  listening: 'var(--glow-a)',
  thinking: 'var(--glow-b)',
  speaking: 'var(--glow-c)',
};

export const StateLabel: React.FC<StateLabelProps> = ({ state }) => {
  return (
    <div
      className="state-label"
      id="stateLabel"
      style={{ color: STATE_COLORS[state] || undefined }}
    >
      {STATE_TEXT[state]}
    </div>
  );
};
