export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'gesture_no';

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
  category?: 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Older';
  createdAt: string;
  updatedAt: string;
  status: 'setup' | 'active' | 'ending' | 'completed';
  jobRole?: string;
  attachedDocuments?: AttachedDocument[];
  messages: Message[];
  isReadOnly?: boolean;
}

export interface AnswerAttempt {
  attemptNumber: 1 | 2;
  audioBlob: Blob;
  audioUrl: string;
  transcript: string;
  durationSeconds: number;
  aiNotes: string[];
  aiNotesStatus: 'idle' | 'loading' | 'success' | 'error';
  errorMessage?: string;
}

export interface AnswerComparison {
  improvements: string[];
  stillImprove: string[];
  attempt2Notes: string[];
  status: 'idle' | 'loading' | 'success' | 'error';
  errorMessage?: string;
}

export interface ReplayState {
  questionText: string;
  attempt1: AnswerAttempt | null;
  attempt2: AnswerAttempt | null;
  comparison: AnswerComparison | null;
  isRetryMode: boolean;
  isVisible: boolean;
  isMinimized: boolean;
}

export interface InterviewExchangeRecord {
  id: string;
  order: number;
  question: string;
  userAnswer: string;
  attempt1Answer?: string;
  attempt2Answer?: string;
  durationSeconds?: number;
  aiNotes: string[];
  aiNotesStatus: 'idle' | 'loading' | 'success' | 'error';
  errorMessage?: string;
  timestamp: string;
}

