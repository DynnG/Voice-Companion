import React from 'react';
import { Plus, MessageCircle, Clock, ChevronLeft, X, Lock, FileText } from 'lucide-react';
import { Conversation } from '../types/conversation';

interface ConversationHistoryProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (conv: Conversation) => void;
  onNewConversation: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  isCollapsedDesktop: boolean;
  onToggleCollapseDesktop: () => void;
}

const CATEGORIES: ('Today' | 'Yesterday' | 'Previous 7 Days' | 'Older')[] = [
  'Today',
  'Yesterday',
  'Previous 7 Days',
  'Older'
];

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  isOpenMobile,
  onCloseMobile,
  isCollapsedDesktop,
  onToggleCollapseDesktop,
}) => {
  const groupedConversations = CATEGORIES.map((cat) => ({
    category: cat,
    items: conversations.filter((c) => c.category === cat)
  }));

  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#133020] text-[#f5eedb] border-r border-[#046241]/30">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-[#046241]/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#046241] flex items-center justify-center text-[#f5eedb] font-space font-bold shadow-sm">
            P
          </div>
          <div className="font-space font-semibold text-sm tracking-wide text-[#ffffff]">
            Interview History
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Desktop Collapse Toggle */}
          <button
            onClick={onToggleCollapseDesktop}
            className="hidden md:flex p-1.5 rounded-md text-[#f5eedb]/70 hover:text-[#ffffff] hover:bg-[#046241]/40 transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {/* Mobile Close Button */}
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-md text-[#f5eedb]/70 hover:text-[#ffffff] hover:bg-[#046241]/40 transition-colors"
            title="Close Sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* New Interview Action Button */}
      <div className="p-3.5">
        <button
          onClick={() => {
            onNewConversation();
            if (isOpenMobile) onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#046241] text-[#ffffff] font-space text-xs font-semibold tracking-wider uppercase hover:bg-[#046241]/85 active:scale-[0.98] transition-all shadow-md hover:shadow-lg border border-[#f5eedb]/20"
        >
          <Plus className="w-4 h-4 text-[#FFB347]" />
          <span>New Interview</span>
        </button>
      </div>

      {/* Conversation Categories List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
        {groupedConversations.map(({ category, items }) => {
          if (items.length === 0) return null;
          return (
            <div key={category} className="space-y-1.5">
              <div className="px-2 text-[11px] font-space font-medium text-[#FFB347]/90 tracking-wider uppercase flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-[#FFB347]/70" />
                <span>{category}</span>
              </div>
              <div className="space-y-1">
                {items.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  const docCount = conv.attachedDocuments?.length || 0;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => {
                        onSelectConversation(conv);
                        if (isOpenMobile) onCloseMobile();
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between group transition-all duration-150 ${
                        isActive
                          ? 'bg-[#046241] text-[#ffffff] font-medium shadow-sm ring-1 ring-[#f5eedb]/30'
                          : 'text-[#f5eedb]/85 hover:bg-[#046241]/30 hover:text-[#ffffff]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <MessageCircle
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-[#FFB347]' : 'text-[#f5eedb]/50 group-hover:text-[#FFB347]'
                          }`}
                        />
                        <div className="min-w-0 flex flex-col">
                          <span className="text-xs truncate leading-snug">
                            {conv.title}
                          </span>
                          {conv.status === 'setup' && (
                            <span className="text-[10px] text-[#FFB347] font-medium leading-none mt-0.5">
                              • Setup in progress
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {docCount > 0 && (
                          <span
                            className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md ${
                              isActive ? 'bg-[#133020] text-[#f5eedb]' : 'bg-[#046241]/40 text-[#f5eedb]/80'
                            }`}
                            title={`${docCount} document(s) attached`}
                          >
                            <FileText className="w-2.5 h-2.5 text-[#FFB347]" />
                            {docCount}
                          </span>
                        )}
                        {conv.isReadOnly && (
                          <span title="Read-only history">
                            <Lock
                              className={`w-3 h-3 ${
                                isActive ? 'text-[#f5eedb]/80' : 'text-[#f5eedb]/40'
                              }`}
                            />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-[#046241]/30 text-[11px] text-[#f5eedb]/60 text-center font-inter">
        Pal Voice Companion v1.0
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Collapsed Rail View (when desktop is collapsed) */}
      {isCollapsedDesktop && (
        <div className="hidden md:flex flex-col items-center py-4 px-2 bg-[#133020] border-r border-[#046241]/30 w-16 space-y-4 z-20">
          <button
            onClick={onToggleCollapseDesktop}
            className="p-2 rounded-lg bg-[#046241] text-[#f5eedb] hover:bg-[#046241]/80 transition-colors"
            title="Expand History Sidebar"
          >
            <MessageCircle className="w-5 h-5 text-[#FFB347]" />
          </button>
          <button
            onClick={onNewConversation}
            className="p-2 rounded-lg bg-[#046241]/40 text-[#f5eedb] hover:bg-[#046241] transition-colors"
            title="New Interview"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Desktop Sidebar (Expanded) */}
      {!isCollapsedDesktop && (
        <aside className="hidden md:block w-72 shrink-0 h-full z-20">
          {sidebarContent}
        </aside>
      )}

      {/* Mobile Sidebar Overlay Drawer */}
      {isOpenMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Drawer content */}
          <div className="relative w-80 max-w-[85vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
