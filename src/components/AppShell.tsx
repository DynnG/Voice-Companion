import React from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import mockMateLogo from '../assets/MockMate-logo.png';

interface AppShellProps {
  children: React.ReactNode;
  onNewInterview: () => void;
  isLivePanelOpen: boolean;
  onToggleLivePanel: () => void;
  activeRole?: string;
  showNewInterviewButton?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  onNewInterview,
  isLivePanelOpen,
  onToggleLivePanel,
  activeRole,
  showNewInterviewButton = false,
}) => {
  return (
    <div className="w-screen h-screen flex flex-col bg-[#133020] text-[#f5eedb] overflow-hidden select-none font-inter">
      {/* Top Application Shell Navbar */}
      <header className="h-14 bg-[#133020] border-b border-[#046241]/40 px-4 flex items-center justify-between z-30 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Shell Brand Title */}
          <div className="flex items-center gap-2">
            <img
              src={mockMateLogo}
              alt="MockMate Logo"
              className="w-7 h-7 rounded-lg object-contain shadow-xs"
            />
            <span className="font-space font-semibold text-sm tracking-wide text-[#ffffff]">
              MockMate
            </span>
            {activeRole && (
              <span className="hidden sm:inline-block text-xs text-[#f5eedb]/60 truncate max-w-[200px] border-l border-[#046241]/40 pl-2 ml-1">
                {activeRole}
              </span>
            )}
          </div>

          {/* Simple New Interview Action Button (available during active interview) */}
          {showNewInterviewButton && (
            <button
              onClick={onNewInterview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-space font-semibold bg-[#046241] text-[#ffffff] hover:bg-[#046241]/85 active:scale-95 transition-all shadow-xs border border-[#f5eedb]/20 ml-2"
              title="Start a new interview session"
            >
              <Plus className="w-3.5 h-3.5 text-[#FFB347]" />
              <span>New Interview</span>
            </button>
          )}
        </div>

        {/* Top Navbar Actions */}
        <div className="flex items-center gap-2">
          {/* Quick Toggle for Live Conversation Transcript */}
          <button
            onClick={onToggleLivePanel}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-space font-medium transition-all duration-200 border
              ${
                isLivePanelOpen
                  ? 'bg-[#046241] text-[#ffffff] border-[#f5eedb]/30 shadow-xs'
                  : 'bg-[#133020] text-[#f5eedb]/80 border-[#046241]/40 hover:bg-[#046241]/30 hover:text-[#ffffff]'
              }
            `}
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#FFB347]" />
            <span className="hidden sm:inline">Transcript</span>
          </button>
        </div>
      </header>

      {/* Main Layout Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {children}
      </div>
    </div>
  );
};

