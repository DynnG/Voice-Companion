import React, { useEffect, useRef } from 'react';
import { X, Sparkles, User, Bot, FileText } from 'lucide-react';
import { Conversation } from '../types/conversation';

interface LiveConversationPanelProps {
  conversation: Conversation | null;
  isOpen: boolean;
  onClose: () => void;
  isThinking?: boolean;
}

export const LiveConversationPanel: React.FC<LiveConversationPanelProps> = ({
  conversation,
  isOpen,
  onClose,
  isThinking = false,
}) => {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation?.messages.length, isOpen, isThinking]);

  if (!isOpen) return null;

  const docs = conversation?.attachedDocuments || [];

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Main Panel Container */}
      {/* Desktop: Right-aligned panel. Mobile: Bottom sheet / overlay */}
      <aside
        className={`
          fixed md:relative right-0 bottom-0 top-auto md:top-0
          w-full md:w-96 h-[80vh] md:h-full
          z-50 md:z-20 shrink-0
          bg-[#F9F7F7] text-[#133020]
          border-t md:border-t-0 md:border-l border-[#046241]/20
          shadow-2xl md:shadow-none
          rounded-t-2xl md:rounded-none
          flex flex-col
          transition-transform duration-300 ease-in-out
        `}
      >
        {/* Panel Header */}
        <div className="px-5 py-4 bg-[#133020] text-[#f5eedb] flex items-center justify-between border-b border-[#046241]/40 rounded-t-2xl md:rounded-none">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-8 h-8 rounded-full bg-[#046241] flex items-center justify-center text-[#FFB347] shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-space font-semibold text-sm text-[#ffffff] truncate">
                  {conversation ? conversation.title : 'Live Interview'}
                </h3>
              </div>
              <p className="text-[11px] text-[#f5eedb]/70 font-inter flex items-center gap-1">
                <span className="flex items-center gap-1 text-[#5eead4]">
                  <span className="w-2 h-2 rounded-full bg-[#5eead4] animate-pulse" />
                  Live Interview Session
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#f5eedb]/80 hover:text-[#ffffff] hover:bg-[#046241] transition-colors"
            title="Close Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Attached Context Banner */}
        {docs.length > 0 && (
          <div className="bg-[#f5eedb] border-b border-[#046241]/20 px-4 py-2 text-[11px] text-[#133020] flex items-center gap-2 overflow-x-auto">
            <FileText className="w-3.5 h-3.5 text-[#046241] shrink-0" />
            <span className="font-semibold shrink-0">Context:</span>
            <div className="flex items-center gap-1.5 truncate">
              {docs.map((d) => (
                <span key={d.id} className="bg-[#ffffff] px-2 py-0.5 rounded-md border border-[#046241]/20 truncate">
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Messages Transcript Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F9F7F7]">
          {!conversation || conversation.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#133020]/60 space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#133020]/5 flex items-center justify-center text-[#046241]">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="font-space text-sm font-medium">No messages yet</p>
              <p className="text-xs max-w-xs text-[#133020]/70">
                Tap the microphone or creature on the voice screen to start speaking with Pal.
              </p>
            </div>
          ) : (
            conversation.messages.map((msg) => {
              const isUser = msg.sender === 'You';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                >
                  {/* Sender & Timestamp */}
                  <div className="flex items-center gap-1.5 px-1 text-[11px] font-space font-semibold text-[#133020]/70 uppercase tracking-wider">
                    {isUser ? (
                      <>
                        <span>You</span>
                        <User className="w-3 h-3 text-[#046241]" />
                      </>
                    ) : (
                      <>
                        <Bot className="w-3 h-3 text-[#046241]" />
                        <span>Pal (Interviewer)</span>
                      </>
                    )}
                    <span className="text-[10px] font-normal text-[#133020]/50 lowercase">
                      • {msg.timestamp}
                    </span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`
                      max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-xs font-inter
                      ${
                        isUser
                          ? 'bg-[#133020] text-[#ffffff] rounded-tr-xs'
                          : 'bg-[#ffffff] text-[#133020] border border-[#046241]/20 rounded-tl-xs'
                      }
                    `}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          {isThinking && (
            <div className="flex flex-col items-start space-y-1">
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-space font-semibold text-[#046241] uppercase tracking-wider">
                <Bot className="w-3 h-3 text-[#046241]" />
                <span>Pal (Interviewer)</span>
                <span className="text-[10px] font-normal text-[#133020]/50 lowercase">• thinking…</span>
              </div>
              <div className="bg-[#ffffff] text-[#133020] border border-[#046241]/20 rounded-2xl rounded-tl-xs px-4 py-3 text-sm flex items-center gap-2 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-[#046241] animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-[#046241] animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-[#046241] animate-bounce [animation-delay:0.4s]" />
                <span className="text-xs text-[#133020]/70 font-medium ml-1">Formulating follow-up question…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Panel Footer */}
        <div className="p-3 bg-[#ffffff] border-t border-[#046241]/15 text-[11px] text-[#133020]/60 text-center font-inter flex items-center justify-between px-4">
          <span>{conversation?.messages.length || 0} messages recorded</span>
          <span className="text-[#046241] font-semibold font-space">Pal Interviewer</span>
        </div>
      </aside>
    </>
  );
};
