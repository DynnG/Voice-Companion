import React, { useState } from 'react';
import { Conversation, Message, AttachedDocument } from '../types/conversation';
import { initialMockConversations } from '../data/mockConversations';
import { AppShell } from './AppShell';
import { ConversationHistory } from './ConversationHistory';
import { VoiceExperience } from './VoiceExperience';
import { LiveConversationPanel } from './LiveConversationPanel';
import { DocumentAttachmentScreen } from './DocumentAttachmentScreen';
import { fetchInitialInterviewQuestion } from '../services/sttService';

export const VoiceCompanion: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>(initialMockConversations);
  const [activeConversationId, setActiveConversationId] = useState<string>('conv-active-1');
  const [isLivePanelOpen, setIsLivePanelOpen] = useState<boolean>(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState<boolean>(false);
  const [initialQuestionToSpeak, setInitialQuestionToSpeak] = useState<string | undefined>(undefined);
  const [isThinking, setIsThinking] = useState<boolean>(false);

  // Find active conversation
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || conversations[0];

  // Select a conversation from sidebar
  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversationId(conv.id);
    setInitialQuestionToSpeak(undefined);
    setIsThinking(false);
    if (conv.status !== 'setup') {
      setIsLivePanelOpen(true);
    }
  };

  // Start a new interview workflow
  const handleNewInterview = () => {
    const newId = `interview-${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: 'Interview - Software Developer',
      category: 'Today',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'setup',
      jobRole: 'Software Developer',
      attachedDocuments: [],
      messages: [],
      isReadOnly: false,
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newId);
    setInitialQuestionToSpeak(undefined);
    setIsThinking(false);
    setIsLivePanelOpen(false);
  };

  // Transition from Document Attachment Screen to Voice Interview
  const handleStartInterview = async (jobRole: string, docs: AttachedDocument[]) => {
    const cleanRole = jobRole.trim() || 'Software Developer';
    const title = `Interview - ${cleanRole}`;

    // Generate initial interview question tailored to role and documents
    const docSummary = docs.map((d) => ({ id: d.id, name: d.name, category: d.category }));
    const questionText = await fetchInitialInterviewQuestion(cleanRole, docSummary);

    const initialPalMessage: Message = {
      id: `msg-${Date.now()}-init`,
      sender: 'Pal',
      text: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setInitialQuestionToSpeak(questionText);
    setIsLivePanelOpen(true);

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConversationId) {
          return {
            ...c,
            title,
            jobRole: cleanRole,
            attachedDocuments: docs,
            status: 'active',
            updatedAt: new Date().toISOString(),
            messages: [initialPalMessage],
          };
        }
        return c;
      })
    );
  };

  // Handle both user spoken transcription and Gemini AI follow-up response
  const handleUserAnswerAndAiResponse = (userText: string, aiResponse: string) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      sender: 'You',
      text: userText,
      timestamp: nowStr,
    };

    const palMsg: Message = {
      id: `msg-${Date.now() + 1}-pal`,
      sender: 'Pal',
      text: aiResponse,
      timestamp: nowStr,
    };

    setConversations((prev) => {
      let targetConv = prev.find((c) => c.id === activeConversationId);
      if (!targetConv || targetConv.isReadOnly) {
        const newId = `interview-${Date.now()}`;
        const newConv: Conversation = {
          id: newId,
          title: 'Interview - Software Developer',
          category: 'Today',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'active',
          jobRole: 'Software Developer',
          attachedDocuments: [],
          messages: [userMsg, palMsg],
          isReadOnly: false,
        };
        setActiveConversationId(newId);
        return [newConv, ...prev];
      }

      return prev.map((c) => {
        if (c.id === targetConv.id) {
          return {
            ...c,
            updatedAt: new Date().toISOString(),
            messages: [...c.messages, userMsg, palMsg],
          };
        }
        return c;
      });
    });
  };

  // Fallback for user transcription only
  const handleUserTranscribed = (transcribedText: string) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      sender: 'You',
      text: transcribedText,
      timestamp: nowStr,
    };

    setConversations((prev) => {
      let targetConv = prev.find((c) => c.id === activeConversationId);
      if (!targetConv || targetConv.isReadOnly) {
        const newId = `interview-${Date.now()}`;
        const newConv: Conversation = {
          id: newId,
          title: 'Interview - Software Developer',
          category: 'Today',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'active',
          jobRole: 'Software Developer',
          attachedDocuments: [],
          messages: [userMsg],
          isReadOnly: false,
        };
        setActiveConversationId(newId);
        return [newConv, ...prev];
      }

      return prev.map((c) => {
        if (c.id === targetConv.id) {
          return {
            ...c,
            updatedAt: new Date().toISOString(),
            messages: [...c.messages, userMsg],
          };
        }
        return c;
      });
    });
  };

  // Handle AI Interviewer response from Gemini
  const handlePalResponse = (palText: string) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const palMsg: Message = {
      id: `msg-${Date.now()}-pal`,
      sender: 'Pal',
      text: palText,
      timestamp: nowStr,
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConversationId) {
          return {
            ...c,
            updatedAt: new Date().toISOString(),
            messages: [...c.messages, palMsg],
          };
        }
        return c;
      })
    );
  };

  return (
    <AppShell
      onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
      isDesktopSidebarCollapsed={isDesktopSidebarCollapsed}
      onToggleDesktopSidebar={() => setIsDesktopSidebarCollapsed((prev) => !prev)}
      isLivePanelOpen={isLivePanelOpen}
      onToggleLivePanel={() => setIsLivePanelOpen((prev) => !prev)}
      activeConversationTitle={activeConversation?.title}
    >
      {/* FEATURE 2: Conversation History Sidebar */}
      <ConversationHistory
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewInterview}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsedDesktop={isDesktopSidebarCollapsed}
        onToggleCollapseDesktop={() => setIsDesktopSidebarCollapsed((prev) => !prev)}
      />

      {/* CENTRAL WORKSPACE: Setup Screen OR Voice Companion Interview UI */}
      <main className="flex-1 h-full relative overflow-hidden bg-[#050810] flex items-center justify-center">
        {activeConversation?.status === 'setup' ? (
          <DocumentAttachmentScreen
            initialJobRole={activeConversation.jobRole || 'Software Developer'}
            initialDocuments={activeConversation.attachedDocuments || []}
            onStartInterview={handleStartInterview}
          />
        ) : (
          <VoiceExperience
            onUserAnswerAndAiResponse={handleUserAnswerAndAiResponse}
            onUserTranscribed={handleUserTranscribed}
            onThinkingChange={setIsThinking}
            isLivePanelOpen={isLivePanelOpen}
            onToggleLivePanel={() => setIsLivePanelOpen((prev) => !prev)}
            jobRole={activeConversation?.jobRole}
            attachedDocuments={activeConversation?.attachedDocuments || []}
            conversationHistory={activeConversation?.messages || []}
            initialQuestionToSpeak={initialQuestionToSpeak}
          />
        )}
      </main>

      {/* FEATURE 1: Live Conversation Panel */}
      <LiveConversationPanel
        conversation={activeConversation}
        isOpen={isLivePanelOpen}
        onClose={() => setIsLivePanelOpen(false)}
        isThinking={isThinking}
      />
    </AppShell>
  );
};

