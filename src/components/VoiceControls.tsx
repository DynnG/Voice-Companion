import React from 'react';
import { MessageSquare } from 'lucide-react';
import { VoiceState } from '../types/conversation';

interface VoiceControlsProps {
  state: VoiceState;
  onStartFlow: () => void;
  isPanelOpen: boolean;
  onTogglePanel: () => void;
  unreadCount?: number;
  statusHint?: string;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  state,
  onStartFlow,
  isPanelOpen,
  onTogglePanel,
  unreadCount = 0,
  statusHint,
}) => {
  return (
    <footer className="voice-footer">
      <div className="mic-row">
        {/* Existing Microphone Button - Design Locked */}
        <button
          className={`mic-btn ${state === 'listening' ? 'live' : ''}`}
          id="micBtn"
          aria-label={state === 'listening' ? 'Stop recording and transcribe' : 'Start talking'}
          onClick={onStartFlow}
          title={state === 'listening' ? 'Tap to finish speaking' : 'Tap to talk'}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </button>

        {/* Feature 1: Live Conversation Button - 60px circular button */}
        <button
          className={`chat-btn ${isPanelOpen ? 'active-panel' : ''}`}
          id="liveChatBtn"
          aria-label="Toggle live conversation panel"
          onClick={onTogglePanel}
          title="Live Conversation Transcript"
        >
          <MessageSquare className="w-[22px] h-[22px] transition-transform duration-200 hover:scale-105" />
          {unreadCount > 0 && !isPanelOpen && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#FFB347] text-[#133020] font-bold text-[10px] rounded-full flex items-center justify-center border-2 border-[#0a0e18]">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      <div className="hint text-center max-w-sm">
        {statusHint || 'Tap microphone to speak · faster-whisper STT backend connected'}
      </div>
    </footer>
  );
};
