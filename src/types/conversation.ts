export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type DocumentCategory = 'resume' | 'job_description' | 'portfolio' | 'other';

export interface AttachedDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  size: string;
  uploadedAt: string;
  content?: string;
  extractedText?: string;
}

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
  status: 'setup' | 'active' | 'completed';
  jobRole?: string;
  attachedDocuments?: AttachedDocument[];
  messages: Message[];
  isReadOnly?: boolean;
}
