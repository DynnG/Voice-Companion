import React, { useState } from 'react';
import { Conversation, Message } from '../types/conversation';
import { initialMockConversations } from '../data/mockConversations';
import { AppShell } from './AppShell';
import { ConversationHistory } from './ConversationHistory';
import { VoiceExperience } from './VoiceExperience';
import { LiveConversationPanel } from './LiveConversationPanel';

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
    setIsLivePanelOpen(true); // Requirement: Clicking a previous conversation opens its transcript in Live Conversation panel
  };

  // Start a new conversation
  const handleNewConversation = () => {
    const newId = `conv-${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: 'New Voice Conversation',
      category: 'Today',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      isReadOnly: false,
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newId);
    setIsLivePanelOpen(true);
  };

  // Handle new message pair when voice interaction flow completes
  const handleNewMessagePair = (userText: string, palText: string) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = {
      id: `msg-${Date.now()}-1`,
      sender: 'You',
      text: userText,
      timestamp: nowStr,
    };
    const palMsg: Message = {
      id: `msg-${Date.now()}-2`,
      sender: 'Pal',
      text: palText,
      timestamp: nowStr,
    };

    setConversations((prev) => {
      // Check if current active conversation is read-only
      let targetConv = prev.find((c) => c.id === activeConversationId);
      if (!targetConv || targetConv.isReadOnly) {
        // Create a new editable live conversation
        const newId = `conv-${Date.now()}`;
        const newConv: Conversation = {
          id: newId,
          title: userText.length > 30 ? `${userText.slice(0, 30)}…` : userText,
          category: 'Today',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [userMsg, palMsg],
          isReadOnly: false,
        };
        setActiveConversationId(newId);
        return [newConv, ...prev];
      }

      // Append to active conversation
      return prev.map((c) => {
        if (c.id === targetConv.id) {
          const updatedMessages = [...c.messages, userMsg, palMsg];
          const updatedTitle =
            c.messages.length === 0
              ? userText.length > 32
                ? `${userText.slice(0, 32)}…`
                : userText
              : c.title;
          return {
            ...c,
            title: updatedTitle,
            updatedAt: new Date().toISOString(),
            messages: updatedMessages,
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
        onNewConversation={handleNewConversation}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsedDesktop={isDesktopSidebarCollapsed}
        onToggleCollapseDesktop={() => setIsDesktopSidebarCollapsed((prev) => !prev)}
      />

      {/* CENTRAL VOICE UI EXPERIENCE (LOCKED DESIGN) */}
      <main className="flex-1 h-full relative overflow-hidden bg-[#050810] flex items-center justify-center">
        <VoiceExperience
          onNewMessagePair={handleNewMessagePair}
          isLivePanelOpen={isLivePanelOpen}
          onToggleLivePanel={() => setIsLivePanelOpen((prev) => !prev)}
        />
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
