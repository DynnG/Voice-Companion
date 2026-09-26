import React, { useState } from 'react';
import { Conversation, Message, AttachedDocument } from '../types/conversation';
import { AppShell } from './AppShell';
import { VoiceExperience } from './VoiceExperience';
import { LiveConversationPanel } from './LiveConversationPanel';
import { DocumentAttachmentScreen } from './DocumentAttachmentScreen';
import { fetchInitialInterviewQuestion } from '../services/sttService';

interface InterviewSession {
  id: string;
  jobRole: string;
  status: 'setup' | 'active' | 'completed';
  attachedDocuments: AttachedDocument[];
  messages: Message[];
}

const createInitialSession = (): InterviewSession => ({
  id: `session-${Date.now()}`,
  jobRole: 'Software Developer',
  status: 'setup',
  attachedDocuments: [],
  messages: []
});

export const VoiceCompanion: React.FC = () => {
  // Session-only state: strictly held in memory for the active interview
  const [session, setSession] = useState<InterviewSession>(createInitialSession);
  const [isLivePanelOpen, setIsLivePanelOpen] = useState<boolean>(false);
  const [initialQuestionToSpeak, setInitialQuestionToSpeak] = useState<string | undefined>(undefined);
  const [isThinking, setIsThinking] = useState<boolean>(false);

  // Start a new interview workflow: clears all previous documents, messages, and context
  const handleNewInterview = () => {
    setSession(createInitialSession());
    setInitialQuestionToSpeak(undefined);
    setIsThinking(false);
    setIsLivePanelOpen(false);
  };

  // Transition from Document Attachment Screen to Live Voice Interview
  const handleStartInterview = async (jobRole: string, docs: AttachedDocument[]) => {
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

    const initialPalMessage: Message = {
      id: `msg-${Date.now()}-init`,
      sender: 'Pal',
      text: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setInitialQuestionToSpeak(questionText);
    setIsLivePanelOpen(true);

    // 3. Update session state to active with in-memory documents and opening question
    setSession((prev) => ({
      ...prev,
      jobRole: cleanRole,
      status: 'active',
      attachedDocuments: docs,
      messages: [initialPalMessage]
    }));
  };

  // Step 1: Immediately commit user transcript to session messages in memory
  const handleUserTranscribed = (transcribedText: string) => {
    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      sender: 'You',
      text: transcribedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setSession((prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg]
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

  // Step 3: Handle interview completion when Gemini signals should_end
  const handleInterviewCompleted = (reason?: string) => {
    console.log(`[Session Interview] Completed (reason: ${reason})`);
    setSession((prev) => ({
      ...prev,
      status: 'completed'
    }));
  };

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
      onNewInterview={handleNewInterview}
      isLivePanelOpen={isLivePanelOpen}
      onToggleLivePanel={() => setIsLivePanelOpen((prev) => !prev)}
      activeRole={session.status !== 'setup' ? session.jobRole : undefined}
      showNewInterviewButton={session.status !== 'setup'}
    >
      {/* CENTRAL WORKSPACE: Setup Screen (Upload Documents) OR Live Voice Interview */}
      <main className="flex-1 h-full relative overflow-hidden bg-[#050810] flex items-center justify-center">
        {session.status === 'setup' ? (
          <DocumentAttachmentScreen
            initialJobRole={session.jobRole}
            initialDocuments={session.attachedDocuments}
            onStartInterview={handleStartInterview}
          />
        ) : (
          <VoiceExperience
            interviewId={session.id}
            onUserTranscribed={handleUserTranscribed}
            onPalResponse={handlePalResponse}
            onThinkingChange={setIsThinking}
            onInterviewCompleted={handleInterviewCompleted}
            interviewStatus={session.status}
            isLivePanelOpen={isLivePanelOpen}
            onToggleLivePanel={() => setIsLivePanelOpen((prev) => !prev)}
            jobRole={session.jobRole}
            attachedDocuments={session.attachedDocuments}
            conversationHistory={session.messages}
            initialQuestionToSpeak={initialQuestionToSpeak}
          />
        )}
      </main>

      {/* Live Conversation Transcript Panel */}
      <LiveConversationPanel
        conversation={activeConversation}
        isOpen={isLivePanelOpen}
        onClose={() => setIsLivePanelOpen(false)}
        isThinking={isThinking}
      />
    </AppShell>
  );
};
