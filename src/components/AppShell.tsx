import React from 'react';
import { Menu, MessageSquare, PanelLeftOpen } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  onOpenMobileSidebar: () => void;
  isDesktopSidebarCollapsed: boolean;
  onToggleDesktopSidebar: () => void;
  isLivePanelOpen: boolean;
  onToggleLivePanel: () => void;
  activeConversationTitle?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  onOpenMobileSidebar,
  isDesktopSidebarCollapsed,
  onToggleDesktopSidebar,
  isLivePanelOpen,
  onToggleLivePanel,
  activeConversationTitle,
}) => {
  return (
    <div className="w-screen h-screen flex flex-col bg-[#133020] text-[#f5eedb] overflow-hidden select-none font-inter">
      {/* Top Application Shell Navbar */}
      <header className="h-14 bg-[#133020] border-b border-[#046241]/40 px-4 flex items-center justify-between z-30 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Mobile Hamburger Button */}
          <button
            onClick={onOpenMobileSidebar}
            className="md:hidden p-2 rounded-lg text-[#f5eedb] hover:bg-[#046241]/40 transition-colors"
            title="Open Conversation History"
          >
            <Menu className="w-5 h-5 text-[#f5eedb]" />
          </button>

          {/* Desktop Expand Sidebar Button (when collapsed) */}
          {isDesktopSidebarCollapsed && (
            <button
              onClick={onToggleDesktopSidebar}
              className="hidden md:flex p-2 rounded-lg text-[#f5eedb] hover:bg-[#046241]/40 transition-colors"
              title="Expand Conversation History"
            >
              <PanelLeftOpen className="w-5 h-5 text-[#FFB347]" />
            </button>
          )}

          {/* Shell Brand Title */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#046241] flex items-center justify-center font-space font-bold text-xs text-[#ffffff] shadow-xs">
              P
            </div>
            <span className="font-space font-semibold text-sm tracking-wide text-[#ffffff]">
              Pal Companion
            </span>
            {activeConversationTitle && (
              <span className="hidden sm:inline-block text-xs text-[#f5eedb]/60 truncate max-w-[200px] border-l border-[#046241]/40 pl-2 ml-1">
                {activeConversationTitle}
              </span>
            )}
          </div>
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
