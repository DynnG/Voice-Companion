import React from 'react';
import { VoiceState } from '../types/conversation';

interface StateLabelProps {
  state: VoiceState;
  customLabel?: string;
}

const DEFAULT_STATE_TEXT: Record<VoiceState, string> = {
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

export const StateLabel: React.FC<StateLabelProps> = ({ state, customLabel }) => {
  const displayText = customLabel || DEFAULT_STATE_TEXT[state];

  return (
    <div
      className="state-label"
      id="stateLabel"
      style={{ color: STATE_COLORS[state] || undefined }}
    >
      {displayText}
    </div>
  );
};
