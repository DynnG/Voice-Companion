import React, { useState } from 'react';
import { Conversation, Message, AttachedDocument } from '../types/conversation';
import { initialMockConversations } from '../data/mockConversations';
import { AppShell } from './AppShell';
import { ConversationHistory } from './ConversationHistory';
import { VoiceExperience } from './VoiceExperience';
import { LiveConversationPanel } from './LiveConversationPanel';
import { DocumentAttachmentScreen } from './DocumentAttachmentScreen';

export const VoiceCompanion: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>(initialMockConversations);
  const [activeConversationId, setActiveConversationId] = useState<string>('conv-active-1');
  const [isLivePanelOpen, setIsLivePanelOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState<boolean>(false);

  // Find active conversation
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || conversations[0];

  // Select a conversation from sidebar
  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversationId(conv.id);
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
    setIsLivePanelOpen(false);
  };

  // Transition from Document Attachment Screen to Voice Interview
  const handleStartInterview = (jobRole: string, docs: AttachedDocument[]) => {
    const title = `Interview - ${jobRole.trim() || 'Software Developer'}`;
    const initialPalMessage: Message = {
      id: `msg-${Date.now()}-init`,
      sender: 'Pal',
      text: `Welcome to your mock interview for ${jobRole}! ${
        docs.length > 0
          ? `I've analyzed your ${docs.length} attached document(s) (${docs.map((d) => d.name).join(', ')}).`
          : "I'm ready to begin whenever you are."
      } Tap the microphone or creature to speak.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConversationId) {
          return {
            ...c,
            title,
            jobRole,
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

  // Handle transcribed audio message from faster-whisper STT backend
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

      {/* CENTRAL WORKSPACE: Setup Screen OR Locked Voice Companion UI */}
      <main className="flex-1 h-full relative overflow-hidden bg-[#050810] flex items-center justify-center">
        {activeConversation?.status === 'setup' ? (
          <DocumentAttachmentScreen
            initialJobRole={activeConversation.jobRole || 'Software Developer'}
            initialDocuments={activeConversation.attachedDocuments || []}
            onStartInterview={handleStartInterview}
          />
        ) : (
          <VoiceExperience
            onUserTranscribed={handleUserTranscribed}
            isLivePanelOpen={isLivePanelOpen}
            onToggleLivePanel={() => setIsLivePanelOpen((prev) => !prev)}
          />
        )}
      </main>

      {/* FEATURE 1: Live Conversation Panel */}
      <LiveConversationPanel
        conversation={activeConversation}
        isOpen={isLivePanelOpen}
        onClose={() => setIsLivePanelOpen(false)}
      />
    </AppShell>
  );
};
