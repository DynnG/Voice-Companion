export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface Message {
  id: string;
  sender: 'You' | 'Pal';
  text: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  category: 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Older';
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  isReadOnly?: boolean;
}
