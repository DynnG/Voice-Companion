import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, User, Bot, FileText, AlertCircle, Download, Send } from 'lucide-react';
import { Conversation } from '../types/conversation';

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
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation?.messages.length, isOpen, isThinking]);

  if (!isOpen) return null;

  const docs = conversation?.attachedDocuments || [];
  const isInputDisabled = isThinking || conversation?.status === 'completed';

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isInputDisabled) return;
    setInputText('');
    onSendAnswer?.(trimmed);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Main Panel Container: Floating Rounded Glass Panel on All 4 Edges */}
      <aside
        className={`
          fixed md:relative inset-x-3 bottom-3 top-auto md:inset-auto md:my-3 md:mr-4
          w-auto md:w-96 h-[80vh] md:h-[calc(100%-24px)]
          z-50 md:z-20 shrink-0
          bg-gradient-to-b from-[rgba(218,241,222,0.06)] via-[rgba(7,28,19,0.72)] to-[rgba(5,20,14,0.78)] backdrop-blur-2xl
          text-[#F5EEDB] font-manrope
          border border-[rgba(218,241,222,0.12)] border-t-[rgba(245,238,219,0.25)]
          shadow-[inset_0_1px_1px_rgba(245,238,219,0.18),0_24px_60px_rgba(0,0,0,0.55),0_0_30px_rgba(4,98,65,0.18)]
          rounded-3xl overflow-hidden
          flex flex-col
          transition-transform duration-300 ease-in-out
        `}
      >
        {/* Panel Header */}
        <div className="px-5 py-4 bg-gradient-to-b from-[rgba(218,241,222,0.05)] to-[rgba(12,38,26,0.50)] backdrop-blur-md text-[#F5EEDB] flex items-center justify-between border-b border-[rgba(218,241,222,0.08)] shrink-0 shadow-[inset_0_1px_1px_rgba(245,238,219,0.12)]">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-8 h-8 rounded-full bg-[rgba(255,179,71,0.12)] border border-[rgba(255,179,71,0.28)] border-t-[rgba(255,195,112,0.45)] flex items-center justify-center text-[#FFB347] shrink-0 shadow-[inset_0_1px_1px_rgba(255,195,112,0.20)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-fraunces font-medium text-base text-[#F5EEDB] truncate">
                  {conversation ? conversation.title : 'Live Interview'}
                </h3>
              </div>
              <p className="text-[11px] text-[#8EB69B] font-manrope flex items-center gap-1">
                {conversation?.status === 'completed' ? (
                  <span className="flex items-center gap-1 text-[#FFB347]">
                    <span className="w-2 h-2 rounded-full bg-[#FFB347]" />
                    Interview Complete
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[#2FE0A8]">
                    <span className="w-2 h-2 rounded-full bg-[#2FE0A8] animate-pulse" />
                    Live Interview Session
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#8EB69B] hover:text-[#F5EEDB] hover:bg-[rgba(218,241,222,0.1)] transition-colors"
            title="Close Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Attached Context Banner */}
        {docs.length > 0 && (
          <div className="bg-[rgba(19,48,32,0.4)] border-b border-[rgba(218,241,222,0.12)] px-4 py-2 text-[11px] text-[#8EB69B] font-manrope flex items-center gap-2 overflow-x-auto shrink-0">
            <FileText className="w-3.5 h-3.5 text-[#FFB347] shrink-0" />
            <span className="font-semibold text-[#8EB69B] shrink-0">Context:</span>
            <div className="flex items-center gap-1.5 truncate">
              {docs.map((d) => (
                <span key={d.id} className="bg-[rgba(218,241,222,0.06)] text-[#F5EEDB] px-2.5 py-0.5 rounded-full border border-[rgba(218,241,222,0.14)] truncate font-manrope">
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Messages Transcript Body (Scrolls Independently) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-transparent">
          {!conversation || conversation.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8EB69B] space-y-3">
              <div className="w-12 h-12 rounded-full bg-[rgba(218,241,222,0.06)] border border-[rgba(218,241,222,0.12)] flex items-center justify-center text-[#FFB347]">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="font-fraunces text-base font-normal text-[#F5EEDB]">No messages yet</p>
              <p className="text-xs max-w-xs text-[#8EB69B] font-manrope">
                Start speaking or type your answer below to begin the interview with Savi.
              </p>
            </div>
          ) : (
            conversation.messages.map((msg) => {
              const isUser = msg.sender === 'You';
              const isNotice = !isUser && msg.text.includes('AI interviewer is temporarily unavailable');
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                >
                  {/* Sender & Timestamp */}
                  <div className="flex items-center gap-1.5 px-1 text-[11px] font-manrope font-semibold text-[#8EB69B] uppercase tracking-wider">
                    {isNotice ? (
                      <>
                        <AlertCircle className="w-3 h-3 text-[#FFB347]" />
                        <span className="text-[#FFC370]">Interviewer Notice</span>
                      </>
                    ) : isUser ? (
                      <>
                        <span>You</span>
                        <User className="w-3 h-3 text-[#2FE0A8]" />
                      </>
                    ) : (
                      <>
                        <Bot className="w-3 h-3 text-[#FFB347]" />
                        <span>Savi (Interviewer)</span>
                      </>
                    )}
                    <span className="text-[10px] font-normal text-[#8EB69B]/60 lowercase">
                      • {msg.timestamp}
                    </span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`
                      max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-[0_4px_16px_rgba(0,0,0,0.25)] font-manrope
                      ${
                        isNotice
                          ? 'bg-[rgba(255,179,71,0.10)] backdrop-blur-sm text-[#FFC370] border border-[rgba(255,179,71,0.25)] border-t-[rgba(255,195,112,0.40)] shadow-[inset_0_1px_1px_rgba(255,195,112,0.16)] rounded-tl-xs'
                          : isUser
                          ? 'bg-gradient-to-br from-[#046241]/80 to-[#133020]/85 backdrop-blur-sm text-[#F5EEDB] border border-[rgba(218,241,222,0.14)] border-t-[rgba(245,238,219,0.22)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.14)] rounded-tr-xs'
                          : 'bg-[rgba(12,38,26,0.58)] backdrop-blur-sm text-[#F5EEDB] border border-[rgba(218,241,222,0.10)] border-t-[rgba(245,238,219,0.18)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.12)] rounded-tl-xs'
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
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-manrope font-semibold text-[#FFB347] uppercase tracking-wider">
                <Bot className="w-3 h-3 text-[#FFB347]" />
                <span>Savi (Interviewer)</span>
                <span className="text-[10px] font-normal text-[#8EB69B]/60 lowercase">• thinking…</span>
              </div>
              <div className="bg-[rgba(12,38,26,0.58)] backdrop-blur-sm text-[#F5EEDB] border border-[rgba(218,241,222,0.10)] border-t-[rgba(245,238,219,0.18)] rounded-2xl rounded-tl-xs px-4 py-3 text-sm flex items-center gap-2 shadow-[inset_0_1px_1px_rgba(245,238,219,0.12),0_4px_16px_rgba(0,0,0,0.2)]">
                <span className="w-2 h-2 rounded-full bg-[#FFB347] animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-[#FFB347] animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-[#FFB347] animate-bounce [animation-delay:0.4s]" />
                <span className="text-xs text-[#8EB69B] font-medium ml-1">Formulating follow-up question…</span>
              </div>
            </div>
          )}
          {conversation?.status === 'completed' && (
            <div className="p-3.5 my-2 bg-[rgba(4,98,65,0.2)] backdrop-blur-md border border-[rgba(218,241,222,0.14)] border-t-[rgba(245,238,219,0.20)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.12)] rounded-2xl text-center font-manrope">
              <div className="text-xs font-manrope font-semibold text-[#FFC370] flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FFB347]" />
                Interview Completed
              </div>
              <p className="text-[11px] text-[#8EB69B] font-manrope mt-0.5">
                This interview has concluded and is saved in your history.
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Panel Footer: Fixed at the bottom of the transcript */}
        <div className="shrink-0 p-3 sm:p-3.5 bg-gradient-to-b from-[rgba(218,241,222,0.03)] to-[rgba(12,38,26,0.55)] backdrop-blur-md border-t border-[rgba(245,238,219,0.14)] space-y-2.5 font-manrope shadow-[inset_0_1px_0_rgba(245,238,219,0.08)]">
          {/* Top Row: Message count / transcript info + Download Button */}
          <div className="flex items-center justify-between text-[11px] text-[#8EB69B] px-1">
            <span>{conversation?.messages.length || 0} messages recorded</span>
            {onDownloadReview ? (
              <button
                onClick={onDownloadReview}
                disabled={isDownloadingReview || (conversation?.messages.length || 0) === 0}
                className="flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-manrope font-semibold bg-[rgba(19,48,32,0.85)] backdrop-blur-md text-[#F5EEDB] border border-[rgba(218,241,222,0.14)] border-t-[rgba(245,238,219,0.24)] hover:bg-[#046241]/85 hover:border-[rgba(255,179,71,0.40)] hover:border-t-[rgba(255,195,112,0.55)] hover:shadow-[0_0_12px_rgba(255,179,71,0.2)] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed group shadow-[inset_0_1px_1px_rgba(245,238,219,0.14)]"
                title={canDownloadReview ? "Download complete interview transcript (PDF) · Download Review" : "Download in-progress interview transcript (PDF) · Download Review"}
                aria-label="Download interview transcript"
              >
                <Download className="w-3.5 h-3.5 text-[#FFB347] transition-transform group-hover:-translate-y-0.5" />
                <span>{isDownloadingReview ? 'Downloading…' : 'Download'}</span>
              </button>
            ) : (
              <span className="text-[#8EB69B] font-semibold font-manrope">Savi Interviewer</span>
            )}
            {/* Note: canDownloadReview && onDownloadReview: Download Review button rendered above */}
          </div>

          {/* Bottom Row: Permanent Text Input with Integrated Send Button */}
          <form
            onSubmit={handleFormSubmit}
            className="flex items-center gap-2 bg-[#F5EEDB] border border-[rgba(218,241,222,0.3)] rounded-2xl p-1.5 pl-3.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-[#FFB347]/50 focus-within:border-[#FFB347]"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your answer..."
              disabled={isInputDisabled}
              className="flex-1 bg-transparent text-[#04170F] placeholder-[#8EB69B] text-xs sm:text-sm font-manrope outline-none min-w-0 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isInputDisabled || !inputText.trim()}
              className="w-8 h-8 rounded-full bg-gradient-to-r from-[#FFC370] to-[#FFB347] text-[#133020] flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-xs hover:scale-105"
              title="Send answer"
              aria-label="Send answer"
            >
              <Send className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
};
