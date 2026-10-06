import { LoadingSkeleton } from './LoadingSkeleton';
import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Download, Send, X, AlertCircle, AudioLines } from 'lucide-react';
import { Conversation } from '../types/conversation';
import { transcriptHighlightRanges } from '../services/transcriptHighlights';
import { isOffTopicRedirect, isClarificationQuery } from '../services/sttService';

interface LiveConversationPanelProps {
  conversation: Conversation | null;
  isOpen: boolean;
  onClose: () => void;
  isThinking?: boolean;
  isTranscribing?: boolean;
  canDownloadReview?: boolean;
  onDownloadReview?: () => void;
  isDownloadingReview?: boolean;
  onOpenAnswerReview?: (replayId: string) => void;
  onSendAnswer?: (text: string) => void;
}

export const LiveConversationPanel: React.FC<LiveConversationPanelProps> = ({
  conversation,
  isOpen,
  onClose,
  isThinking = false,
  isTranscribing = false,
  canDownloadReview = false,
  onDownloadReview,
  isDownloadingReview = false,
  onSendAnswer,
  onOpenAnswerReview,
}) => {
  const [inputText, setInputText] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isUserScrolledUp = useRef(false);
  const prevMsgCountRef = useRef(0);
  const prevThinkingRef = useRef(false);

  // Use only actual current interview messages from session state
  const displayMessages = conversation?.messages || [];
  const questionCount = displayMessages.filter((m) => m.sender === 'Pal').length;
  const messageCount = displayMessages.length;
  const lastMessageText = displayMessages[displayMessages.length - 1]?.text;

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // Tolerance of ~100px to define 'near bottom'
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    isUserScrolledUp.current = !isNearBottom;
  };

  useEffect(() => {
    const isNewMsg = displayMessages.length > prevMsgCountRef.current;
    const isNewThinking = isThinking && !prevThinkingRef.current;
    
    prevMsgCountRef.current = displayMessages.length;
    prevThinkingRef.current = isThinking;

    if (isOpen && scrollContainerRef.current && !isUserScrolledUp.current) {
      const container = scrollContainerRef.current;
      if (isNewMsg || isNewThinking) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } else {
        // Use instant scroll for streaming updates to avoid jitter
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [displayMessages.length, lastMessageText, isOpen, isThinking, isTranscribing]);

  if (!isOpen) return null;

  const isInputDisabled = isThinking || isTranscribing || conversation?.status === 'completed';

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
    const ranges = transcriptHighlightRanges(text);
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    ranges.forEach(({ start, end }) => {
      parts.push(text.slice(cursor, start));
      parts.push(<span key={start} className="bg-[#FFC370]/65 text-[#133020] rounded-[3px] px-0.5 py-px [box-decoration-break:clone]">{text.slice(start, end)}</span>);
      cursor = end;
    });
    parts.push(text.slice(cursor));
    return parts;
  };

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
              {conversation?.jobRole || 'Software Developer'} • {questionCount} question{questionCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Close Button matching Image 1 */}
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-[rgba(218,241,222,0.06)] border border-[rgba(218,241,222,0.12)] hover:bg-[rgba(218,241,222,0.16)] text-[#F5EEDB] flex items-center justify-center transition-all cursor-pointer"
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
            Questions {Math.min(questionCount, 8)}/8
          </span>
        </div>
        <div className="savi-segs mt-1.5">
          {Array.from({ length: 8 }).map((_, i) => {
            const isFilled = i < questionCount;
            const isCurrent = i === questionCount && !isThinking;
            return (
              <i
                key={i}
                className={isFilled ? 'on' : isCurrent ? 'cur' : ''}
              />
            );
          })}
        </div>
      </div>

      {/* Cream Inner Card matching Image 1 (.cream) */}
      <div className="savi-cream flex-1 min-h-0 flex flex-col overflow-hidden text-[#133020]">
        {/* Messages Transcript Log matching Image 1 */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3.5 space-y-3 pr-2"
        >
          {(!conversation || conversation.messages.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-[#133020]/50 font-manrope">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-[#133020]" />
              <p className="text-xs">No messages recorded yet.</p>
            </div>
          ) : (
            displayMessages.map((msg, messageIndex) => {
              const isUser = msg.sender === 'You';
              const nextMessage = displayMessages[messageIndex + 1];
              const isOffTopic = isUser && !isClarificationQuery(msg.text) && nextMessage?.sender === 'Pal' && isOffTopicRedirect(nextMessage.text);
              return (
                <div key={msg.id} className={`flex gap-2.5 items-start text-xs sm:text-[13px] max-w-[88%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                  {isUser ? (
                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 mt-0.5">
                      <img
                        src="/user.png"
                        alt="You"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#133020] flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
                      <img
                        src="/favicon-16x16.png"
                        alt="Savi"
                        className="w-full h-full object-contain p-1"
                      />
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className={`min-w-0 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-xs text-[#133020]">
                        {isUser ? 'You' : 'Savi'}
                      </span>
                      <span className="text-[11px] text-[#133020]/50 font-normal">
                        {msg.timestamp || ''}
                      </span>
                      {isUser && msg.replayId && onOpenAnswerReview && (
                        <button type="button" onClick={() => onOpenAnswerReview(msg.replayId!)} className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[#133020] hover:bg-[#133020]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#133020]" aria-label="Open Audio Playback and AI Notes for this answer" title="Audio Playback & AI Notes"><AudioLines className="w-4 h-4" aria-hidden="true" /></button>
                      )}
                    </div>
                    <div
                      className={`relative p-3 text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                        isUser
                          ? 'bg-[#dcecdf] text-[#133020] rounded-2xl rounded-tr-sm'
                          : 'bg-[#fffdf6] text-[#133020] rounded-2xl rounded-tl-sm'
                      }`}
                    >
                      {/* Chat Tail */}
                      {isUser ? (
                        <div
                          className="absolute top-0 -right-[8px] w-0 h-0"
                          style={{
                            borderTop: '0px solid transparent',
                            borderBottom: '10px solid transparent',
                            borderLeft: '8px solid #dcecdf',
                            borderRight: '0px solid transparent'
                          }}
                        />
                      ) : (
                        <div
                          className="absolute top-0 -left-[8px] w-0 h-0"
                          style={{
                            borderTop: '0px solid transparent',
                            borderBottom: '10px solid transparent',
                            borderRight: '8px solid #fffdf6',
                            borderLeft: '0px solid transparent'
                          }}
                        />
                      )}
                      {isOffTopic && <span className="inline-flex align-middle mr-1.5 text-red-600" role="img" aria-label="Answer is off topic" title="This answer is off topic"><AlertCircle className="w-4 h-4" aria-hidden="true" /></span>}
                      {renderMessageText(msg.text, isUser)}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {isTranscribing && (
            <div className="ml-auto w-3/4 py-2 pr-11">
              <LoadingSkeleton label="Transcribing your answer" light bubble />
            </div>
          )}
          {isThinking && (
            <div className="flex items-center gap-2 text-xs text-[#133020]/70 font-manrope pl-9 py-1">
              <span className="w-1 h-1 rounded-full bg-[#133020] animate-bounce" />
              <span className="w-1 h-1 rounded-full bg-[#133020] animate-bounce [animation-delay:0.2s]" />
              <span className="w-1 h-1 rounded-full bg-[#133020] animate-bounce [animation-delay:0.4s]" />
              <span className="text-xs text-[#133020]/70 font-medium ml-1">Savi is thinking…</span>
            </div>
          )}
        </div>

        {/* Footer Area: Message count & Download Review Button matching Image 1 */}
        <div className="px-3.5 py-2 border-t border-[#133020]/10 shrink-0 flex items-center justify-between text-xs text-[#5b6f61]">
          <span>{messageCount} message{messageCount !== 1 ? 's' : ''}</span>
          {canDownloadReview && onDownloadReview && (
            <button
              type="button"
              onClick={onDownloadReview}
              disabled={isDownloadingReview}
              className="inline-flex items-center gap-2 rounded-xl border border-[#74b393]/50 bg-gradient-to-b from-[#2e654d] to-[#173e2c] px-3 py-1 text-xs font-semibold text-[#F5EEDB] shadow-[0_2px_6px_rgba(19,48,32,0.18),inset_0_1px_0_rgba(190,235,207,0.2)] hover:from-[#38795b] hover:to-[#205239] hover:shadow-[0_3px_10px_rgba(19,48,32,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#133020] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-wait"
              title="Download Review"
              aria-label="Download Review"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#b9e2ca]/15 text-[#b9e2ca]" aria-hidden="true"><Download className="w-3.5 h-3.5" /></span>
              <span>{isDownloadingReview ? 'Downloading…' : 'Download Review'}</span>
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
