import React, { useState, useRef, useCallback } from 'react';
import { Conversation, Message, AttachedDocument, InterviewExchangeRecord } from '../types/conversation';
import { AppShell } from './AppShell';
import { VoiceExperience } from './VoiceExperience';
import { LiveConversationPanel } from './LiveConversationPanel';
import { DocumentAttachmentScreen } from './DocumentAttachmentScreen';
import { PostInterviewCompletionModal } from './PostInterviewCompletionModal';
import { fetchInitialInterviewQuestion, isQuotaExceededText, isInterviewErrorText } from '../services/sttService';
import { stopSpeaking, unlockAudio } from '../services/ttsService';
import { generateInterviewReviewPdf, InterviewReviewPdfData } from '../services/pdfService';

interface InterviewSession {
  id: string;
  jobRole: string;
  status: 'setup' | 'active' | 'completed';
  attachedDocuments: AttachedDocument[];
  messages: Message[];
  exchanges: InterviewExchangeRecord[];
  startTime?: number;
  endTime?: number;
  turnsUsed: number;
  maxTurns: number;
}

const MAX_TURNS = 8;

const createInitialSession = (): InterviewSession => ({
  id: `session-${Date.now()}`,
  jobRole: 'Software Developer',
  status: 'setup',
  attachedDocuments: [],
  messages: [],
  exchanges: [],
  startTime: undefined,
  endTime: undefined,
  turnsUsed: 0,
  maxTurns: MAX_TURNS
});

export const VoiceCompanion: React.FC = () => {
  // Session-only state: strictly held in memory for the active interview
  const [session, setSession] = useState<InterviewSession>(createInitialSession);
  const [isLivePanelOpen, setIsLivePanelOpen] = useState<boolean>(false);
  const [initialQuestionToSpeak, setInitialQuestionToSpeak] = useState<string | undefined>(undefined);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [downloadPdfError, setDownloadPdfError] = useState<string | null>(null);
  const [startInterviewError, setStartInterviewError] = useState<string | null>(null);
  const [submitAnswerFn, setSubmitAnswerFn] = useState<((text: string) => Promise<void>) | null>(null);
  const isStartingInterviewRef = useRef<boolean>(false);
  const handleRegisterSubmitAnswer = useCallback((handler: (text: string) => Promise<void>) => {
    setSubmitAnswerFn(() => handler);
  }, []);

  // Start a new interview workflow: clears all previous documents, messages, and context
  const handleNewInterview = () => {
    isStartingInterviewRef.current = false;
    stopSpeaking();
    setSession(createInitialSession());
    setInitialQuestionToSpeak(undefined);
    setIsThinking(false);
    setIsLivePanelOpen(false);
    setIsCompletionModalOpen(false);
    setIsDownloadingPdf(false);
    setDownloadPdfError(null);
    setStartInterviewError(null);
    setSubmitAnswerFn(null);
  };

  // Transition from Document Attachment Screen to Live Voice Interview
  const handleStartInterview = async (jobRole: string, docs: AttachedDocument[]) => {
    if (isStartingInterviewRef.current || (session.status !== 'setup' && !startInterviewError)) {
      return;
    }
    isStartingInterviewRef.current = true;
    try {
      unlockAudio();
      const cleanRole = jobRole.trim() || 'Software Developer';

      // 1. Prepare in-memory documents summary for initial Gemini question
      const docSummary = docs.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        content: d.content || d.extractedText,
        extracted_text: d.content || d.extractedText
      }));

      // 2. Fetch initial question from Gemini tailored to role and attached documents (in-memory)
      const questionText = await fetchInitialInterviewQuestion(cleanRole, docSummary, session.id);

      const isQuota = isQuotaExceededText(questionText);
      const isConnectionError = isInterviewErrorText(questionText) && !isQuota;

      const initialMessages: Message[] = [];
      if (!isQuota && questionText) {
        if (!isConnectionError) {
          const initialPalMessage: Message = {
            id: `msg-${Date.now()}-init`,
            sender: 'Pal',
            text: questionText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          initialMessages.push(initialPalMessage);
          setInitialQuestionToSpeak(questionText);
          setStartInterviewError(null);
        } else {
          setInitialQuestionToSpeak(undefined);
          setStartInterviewError(questionText);
        }
      } else {
        setInitialQuestionToSpeak(undefined);
        if (isQuota) {
          setStartInterviewError(null);
        }
      }

      setIsLivePanelOpen(true);

      // 3. Update session state to active with in-memory documents and opening question
      setSession((prev) => ({
        ...prev,
        jobRole: cleanRole,
        status: 'active',
        attachedDocuments: docs,
        messages: initialMessages,
        exchanges: [],
        startTime: Date.now(),
        endTime: undefined,
        turnsUsed: 0
      }));
    } catch (err) {
      console.error('[VoiceCompanion] Failed to start interview:', err);
      throw err;
    } finally {
      isStartingInterviewRef.current = false;
    }
  };

  // Step 1: Immediately commit user transcript to session messages in memory
  const handleUserTranscribed = (transcribedText: string) => {
    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      sender: 'You',
      text: transcribedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setSession((prev) => {
      const isRetry = transcribedText.startsWith('(Attempt 2)');
      const nextTurnsUsed = isRetry ? prev.turnsUsed : prev.turnsUsed + 1;
      const isFinishing = nextTurnsUsed >= prev.maxTurns;
      const nextStatus = isFinishing ? 'completed' : prev.status;
      if (isFinishing && prev.status !== 'completed') {
        setTimeout(() => {
          setIsCompletionModalOpen(true);
        }, 1200);
      }
      return {
        ...prev,
        status: nextStatus,
        turnsUsed: nextTurnsUsed,
        endTime: isFinishing ? (prev.endTime || Date.now()) : prev.endTime,
        messages: [...prev.messages, userMsg]
      };
    });
  };

  // Step 1b: Record exchange metadata for post-interview review and PDF generation
  const handleExchangeRecorded = (record: InterviewExchangeRecord) => {
    setSession((prev) => {
      const existingIdx = prev.exchanges.findIndex(
        (e) => e.id === record.id || e.order === record.order
      );
      if (existingIdx !== -1) {
        const updated = [...prev.exchanges];
        updated[existingIdx] = {
          ...updated[existingIdx],
          ...record,
          aiNotes: record.aiNotes.length > 0 ? record.aiNotes : updated[existingIdx].aiNotes
        };
        return { ...prev, exchanges: updated };
      }
      return { ...prev, exchanges: [...prev.exchanges, record] };
    });
  };

  const handleExchangeAiNotesUpdated = (exchangeId: string, notes: string[]) => {
    setSession((prev) => ({
      ...prev,
      exchanges: prev.exchanges.map((ex) =>
        ex.id === exchangeId || ex.id.includes(exchangeId)
          ? { ...ex, aiNotes: notes, aiNotesStatus: 'success' }
          : ex
      )
    }));
  };

  // Step 2: Commit Pal (Gemini Interviewer) follow-up response to session messages in memory
  const handlePalResponse = (palText: string) => {
    const palMsg: Message = {
      id: `msg-${Date.now()}-pal`,
      sender: 'Pal',
      text: palText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setSession((prev) => ({
      ...prev,
      messages: [...prev.messages, palMsg]
    }));
  };

  // Step 3: Handle interview completion when Gemini signals should_end or turn limit reached
  const handleInterviewCompleted = (reason?: string) => {
    console.log(`[Session Interview] Completed (reason: ${reason})`);
    setSession((prev) => ({
      ...prev,
      status: 'completed',
      endTime: prev.endTime || Date.now(),
      turnsUsed: Math.max(prev.turnsUsed, prev.maxTurns)
    }));
    setTimeout(() => {
      setIsCompletionModalOpen(true);
    }, 1200);
  };

  // Helper to ensure full exchange record integrity for the session
  const getCompleteSessionExchanges = (): InterviewExchangeRecord[] => {
    if (session.exchanges && session.exchanges.length > 0) {
      return session.exchanges;
    }

    // Resilient fallback: reconstruct from session messages if exchanges were somehow empty
    const pairs: InterviewExchangeRecord[] = [];
    let currentQ = 'Interview Question';
    let order = 1;

    for (let i = 0; i < session.messages.length; i++) {
      const msg = session.messages[i];
      if (msg.sender === 'Pal') {
        currentQ = msg.text;
      } else if (msg.sender === 'You' && !msg.text.startsWith('(Attempt 2)')) {
        pairs.push({
          id: `ex-fallback-${order}-${Date.now()}`,
          order,
          question: currentQ,
          userAnswer: msg.text,
          aiNotes: [],
          aiNotesStatus: 'idle',
          timestamp: msg.timestamp
        });
        order++;
      }
    }
    return pairs;
  };

  // Active review download handler generating in-browser PDF from fresh session data
  const handleDownloadReviewPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      setDownloadPdfError(null);

      const exchanges = getCompleteSessionExchanges();
      const pdfPayload: InterviewReviewPdfData = {
        jobRole: session.jobRole,
        exchanges,
        startTime: session.startTime,
        endTime: session.endTime || (session.status === 'completed' ? Date.now() : undefined),
        interviewId: session.id,
        status: session.status === 'completed' ? 'Completed' : 'In Progress',
        completedAt: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      await generateInterviewReviewPdf(pdfPayload);
    } catch (err: any) {
      console.error('[VoiceCompanion] Failed to generate PDF review:', err);
      setDownloadPdfError(err?.message || 'Failed to generate PDF review. Please try again.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const completedAnswersCount = getCompleteSessionExchanges().length;
  const canDownloadReview =
    session.status !== 'setup' && (completedAnswersCount >= 2 || session.status === 'completed');

  // Format session as Conversation object for LiveConversationPanel
  const activeConversation: Conversation = {
    id: session.id,
    title: `Interview - ${session.jobRole}`,
    jobRole: session.jobRole,
    status: session.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attachedDocuments: session.attachedDocuments,
    messages: session.messages
  };

  return (
    <AppShell
      isSetupPage={session.status === 'setup'}
      isInterviewActive={session.status !== 'setup'}
      onNewInterview={handleNewInterview}
      isLivePanelOpen={isLivePanelOpen}
      onToggleLivePanel={() => setIsLivePanelOpen((prev) => !prev)}
      activeRole={session.status !== 'setup' ? session.jobRole : undefined}
      showNewInterviewButton={session.status !== 'setup'}
      isCompleted={session.status === 'completed'}
      onOpenReview={() => setIsCompletionModalOpen(true)}
      canDownloadReview={canDownloadReview}
      onDownloadReview={handleDownloadReviewPdf}
      isDownloadingReview={isDownloadingPdf}
    >
      {/* CENTRAL WORKSPACE: Setup Screen (Upload Documents) OR Live Voice Interview */}
      {session.status === 'setup' ? (
        <main className="flex-1 h-full w-full relative overflow-hidden bg-transparent flex flex-col z-10">
          <DocumentAttachmentScreen
            initialJobRole={session.jobRole}
            initialDocuments={session.attachedDocuments}
            onStartInterview={handleStartInterview}
          />
        </main>
      ) : (
        <div className="w-full h-full flex flex-row overflow-hidden z-10 p-3 sm:p-4 gap-3 sm:gap-4">
          {/* Main Interview Area sits directly on the dark organic background */}
          <section className="flex-1 h-full min-w-0 relative overflow-hidden flex flex-col bg-transparent">
            <VoiceExperience
              interviewId={session.id}
              onUserTranscribed={handleUserTranscribed}
              onPalResponse={handlePalResponse}
              onThinkingChange={setIsThinking}
              onInterviewCompleted={handleInterviewCompleted}
              interviewStatus={session.status}
              turnsUsed={session.turnsUsed}
              maxTurns={session.maxTurns}
              isLivePanelOpen={isLivePanelOpen}
              onToggleLivePanel={() => setIsLivePanelOpen((prev) => !prev)}
              jobRole={session.jobRole}
              attachedDocuments={session.attachedDocuments}
              conversationHistory={session.messages}
              initialQuestionToSpeak={initialQuestionToSpeak}
              onExchangeRecorded={handleExchangeRecorded}
              onExchangeAiNotesUpdated={handleExchangeAiNotesUpdated}
              onOpenCompletionReview={() => setIsCompletionModalOpen(true)}
              canDownloadReview={canDownloadReview}
              onDownloadReview={handleDownloadReviewPdf}
              isDownloadingReview={isDownloadingPdf}
              downloadReviewError={downloadPdfError}
              onRegisterSubmitAnswer={handleRegisterSubmitAnswer}
              startInterviewError={startInterviewError}
              onRetryStartInterview={() => handleStartInterview(session.jobRole, session.attachedDocuments)}
              onNewInterview={handleNewInterview}
            />
          </section>

          {/* Live Conversation Transcript Panel: Remains its own distinct right-side glass panel */}
          {isLivePanelOpen && (
            <LiveConversationPanel
              conversation={activeConversation}
              isOpen={isLivePanelOpen}
              onClose={() => setIsLivePanelOpen(false)}
              isThinking={isThinking}
              canDownloadReview={canDownloadReview}
              onDownloadReview={handleDownloadReviewPdf}
              isDownloadingReview={isDownloadingPdf}
              onSendAnswer={submitAnswerFn || undefined}
            />
          )}
        </div>
      )}

      {/* Post-Interview Completion Modal & Download Review */}
      <PostInterviewCompletionModal
        isOpen={isCompletionModalOpen && session.status === 'completed'}
        onClose={() => setIsCompletionModalOpen(false)}
        sessionData={{
          id: session.id,
          jobRole: session.jobRole,
          exchanges: getCompleteSessionExchanges(),
          startTime: session.startTime,
          endTime: session.endTime
        }}
      />
    </AppShell>
  );
};
