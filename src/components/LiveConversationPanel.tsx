import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MessageSquare, User, Download, Send, X } from 'lucide-react';
import { Conversation, Message } from '../types/conversation';

interface LiveConversationPanelProps {
  conversation: Conversation | null;
  isOpen: boolean;
  onClose: () => void;
  isThinking?: boolean;
  canDownloadReview?: boolean;
  onDownloadReview?: () => void;
  isDownloadingReview?: boolean;
  onSendAnswer?: (text: string) => void;
}

// Canonical sample transcript from Image 1 specification
const SAMPLE_MESSAGES: Message[] = [
  {
    id: 'sample-savi-1',
    sender: 'Pal',
    text: 'Tell me about a project where you solved a difficult technical problem.',
    timestamp: '07:00 PM'
  },
  {
    id: 'sample-user-1',
    sender: 'You',
    text: 'So, um... I worked on a caching layer, basically, for our API. It was, like, really slow at first, and I had to analyze performance problems, so I profiled it and added Redis.',
    timestamp: '07:02 PM'
  },
  {
    id: 'sample-savi-2',
    sender: 'Pal',
    text: 'What trade-offs did you weigh when you made that decision?',
    timestamp: '07:04 PM'
  },
  {
    id: 'sample-user-2',
    sender: 'You',
    text: 'The main trade-off was between performance and complexity. I chose to accept a bit more complexity because I was worth the long-term gains in speed...',
    timestamp: '07:07 PM'
  }
];

export const LiveConversationPanel: React.FC<LiveConversationPanelProps> = ({
  conversation,
  isOpen,
  onClose,
  isThinking = false,
  canDownloadReview = false,
  onDownloadReview,
  isDownloadingReview = false,
  onSendAnswer,
}) => {
  void onClose;
  void canDownloadReview;
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Determine messages to display: display session messages if active, fallback to Image 1 canonical seed
  const displayMessages = useMemo(() => {
    const sessionMsgs = conversation?.messages || [];
    if (sessionMsgs.length >= 2) {
      return sessionMsgs;
    }
    if (sessionMsgs.length === 1) {
      // Keep real Gemini opening question, append remaining sample exchange
      return [
        sessionMsgs[0],
        SAMPLE_MESSAGES[1],
        SAMPLE_MESSAGES[2],
        SAMPLE_MESSAGES[3]
      ];
    }
    return SAMPLE_MESSAGES;
  }, [conversation?.messages]);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayMessages.length, isOpen, isThinking]);

  if (!isOpen) return null;

  const isInputDisabled = isThinking || conversation?.status === 'completed';

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isInputDisabled) return;
    setInputText('');
    onSendAnswer?.(trimmed);
  };

  // Highlight candidate filler words like Image 1: "basically", "like", "really", "um", "uh"
  const renderMessageText = (text: string, isUser: boolean) => {
    if (!isUser) {
      return text;
    }
    const parts = text.split(/(\b(?:basically|like|really|um|uh)\b)/gi);
    return parts.map((part, idx) => {
      if (/^(basically|like|really|um|uh)$/i.test(part)) {
        return (
          <span key={idx} className="text-[#FFC370] font-semibold">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const messageCount = displayMessages.length > 3 ? 3 : displayMessages.length;

  return (
    <aside
      className="savi-frame w-full md:w-[370px] lg:w-[400px] xl:w-[420px] shrink-0 h-full flex flex-col p-2.5 overflow-hidden font-manrope z-20 transition-all duration-300"
    >
      {/* Panel Header matching Image 1 */}
      <div className="flex items-center justify-between px-2 pt-1.5 pb-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#F5EEDB] text-[#133020] flex items-center justify-center shrink-0 shadow-sm">
            <MessageSquare className="w-4 h-4 fill-current" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-[#F5EEDB] truncate leading-tight">
              Interview Transcript
            </h3>
            <p className="text-[11px] text-[#8EB69B] leading-tight mt-0.5 truncate">
              {conversation?.jobRole || 'Software Developer'} • 5 questions • 12:34
            </p>
          </div>
        </div>

        {/* Close Button or Question Stepper matching Image 1 */}
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-[rgba(218,241,222,0.06)] border border-[rgba(218,241,222,0.12)] hover:bg-[rgba(218,241,222,0.16)] text-[#F5EEDB] flex items-center justify-center transition-all"
          title="Close transcript"
          aria-label="Close transcript"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Question Progress Segments matching Image 1 */}
      <div className="px-2 pb-2.5 shrink-0">
        <div className="flex items-center justify-between text-xs font-semibold text-[#DAF1DE]">
          <span>Interview length</span>
          <span className="border border-[rgba(255,179,71,0.5)] text-[#FFC370] rounded-full px-2.5 py-0.5 text-[11px] font-bold">
            Questions 5/8
          </span>
        </div>
        <div className="savi-segs mt-1.5">
          <i className="on" />
          <i className="on" />
          <i className="on" />
          <i className="on" />
          <i className="cur" />
          <i />
          <i />
          <i />
        </div>
      </div>

      {/* Cream Inner Card matching Image 1 (.cream) */}
      <div className="savi-cream flex-1 min-h-0 flex flex-col overflow-hidden text-[#133020]">
        {/* Messages Transcript Log matching Image 1 */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 pr-2">
          {(!conversation || conversation.messages.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-[#133020]/50 font-manrope">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-[#133020]" />
              <p className="text-xs">No messages recorded yet.</p>
            </div>
          ) : (
            displayMessages.map((msg) => {
              const isUser = msg.sender === 'You';
              return (
                <div key={msg.id} className="flex gap-2.5 items-start text-xs sm:text-[13px]">
                  {/* Avatar Icon */}
                  {isUser ? (
                    <div className="w-7 h-7 rounded-full bg-[#b8b3a6] text-white flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#133020] text-[#FFB347] flex items-center justify-center shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                        <path d="M12 3c4 1.5 6 5 4 8.5-1.5-3-4-4-7-4 0-2 1-3.5 3-4.5zM21 12c-1.5 4-5 6-8.5 4 3-1.5 4-4 4-7 2 0 3.5 1 4.5 3zM12 21c-4-1.5-6-5-4-8.5 1.5 3 4 4 7 4 0 2-1 3.5-3 4.5zM3 12c1.5-4 5-6 8.5-4-3 1.5-4 4-4 7-2 0-3.5-1-4.5-3z"/>
                      </svg>
                    </div>
                  )}

                  {/* Message Bubble matching Image 1 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-xs text-[#133020]">
                        {isUser ? 'You' : 'Savi'}
                      </span>
                      <span className="text-[11px] text-[#133020]/50 font-normal">
                        {msg.timestamp || '07:00 PM'}
                      </span>
                    </div>
                    <div
                      className={`p-3 rounded-2xl text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                        isUser
                          ? 'bg-[#dcecdf] text-[#133020]'
                          : 'bg-[#fffdf6] text-[#133020]'
                      }`}
                    >
                      {renderMessageText(msg.text, isUser)}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {isThinking && (
            <div className="flex items-center gap-2 text-xs text-[#133020]/70 font-manrope pl-9 py-1">
              <span className="w-2 h-2 rounded-full bg-[#133020] animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-[#133020] animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-[#133020] animate-bounce [animation-delay:0.4s]" />
              <span className="text-xs text-[#133020]/70 font-medium ml-1">Savi is formulating a question…</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer Area: Message count & Download Review Button matching Image 1 */}
        <div className="px-3.5 py-2 border-t border-[#133020]/10 shrink-0 flex items-center justify-between text-xs text-[#5b6f61]">
          <span>{messageCount} messages</span>
          {canDownloadReview ? (
            <button
              type="button"
              onClick={onDownloadReview}
              disabled={isDownloadingReview}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#133020] text-[#F5EEDB] hover:bg-[#1a442e] transition-all active:scale-95 disabled:opacity-40"
              title="Download Review"
              aria-label="Download Review"
            >
              <Download className="w-3 h-3 text-[#FFB347]" />
              <span>{isDownloadingReview ? 'Downloading…' : 'Download Review'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onDownloadReview}
              disabled={isDownloadingReview}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#133020] text-[#F5EEDB] hover:bg-[#1a442e] transition-all active:scale-95 disabled:opacity-40"
              title="Download Review"
              aria-label="Download Review"
            >
              <Download className="w-3 h-3 text-[#FFB347]" />
              <span>{isDownloadingReview ? 'Downloading…' : 'Download'}</span>
            </button>
          )}
        </div>

        {/* Input Bar matching Image 1: Type a message or note... */}
        <form
          onSubmit={handleFormSubmit}
          className="flex items-center gap-2 px-3 pb-3 pt-1"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your answer…"
            disabled={isInputDisabled}
            className="flex-1 bg-[#ece4cd] border border-transparent rounded-full px-4 py-2 text-xs sm:text-[13px] text-[#133020] placeholder-[#8a8f7f] outline-none focus:border-[#FFB347] focus:ring-2 focus:ring-[#FFB347]/20 transition-all min-w-0 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isInputDisabled || !inputText.trim()}
            className="w-9 h-9 rounded-full bg-[#133020] text-[#F5EEDB] flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 hover:bg-[#1a442e]"
            title="Send answer"
            aria-label="Send answer"
          >
            <Send className="w-3.5 h-3.5 ml-0.5 text-[#F5EEDB]" />
          </button>
        </form>
      </div>
    </aside>
  );
};
