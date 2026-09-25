export interface TranscribeResult {
  text: string;
  transcription?: string;
  ai_response?: string;
  language: string;
  language_probability: number;
  duration: number;
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
  interview_error?: string;
}

export interface ConversationHistoryItem {
  sender: 'You' | 'Pal';
  text: string;
}

export interface TranscribeContext {
  jobRole?: string;
  attachedDocuments?: Array<{ id: string; name: string; category: string }>;
  history?: ConversationHistoryItem[];
  generateAiResponse?: boolean;
}

export async function transcribeAudio(
  audioBlob: Blob,
  context?: TranscribeContext
): Promise<TranscribeResult> {
  const formData = new FormData();
  
  // Use appropriate audio extension
  let ext = 'wav';
  if (audioBlob.type.includes('webm')) {
    ext = 'webm';
  } else if (audioBlob.type.includes('ogg')) {
    ext = 'ogg';
  } else if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a')) {
    ext = 'm4a';
  }

  formData.append('file', audioBlob, `recording.${ext}`);

  if (context?.jobRole) {
    formData.append('job_role', context.jobRole);
  }

  if (context?.history && context.history.length > 0) {
    formData.append('history', JSON.stringify(context.history));
  }

  if (context?.attachedDocuments && context.attachedDocuments.length > 0) {
    formData.append('attached_docs', JSON.stringify(context.attachedDocuments));
  }

  if (context?.generateAiResponse !== undefined) {
    formData.append('generate_ai_response', String(context.generateAiResponse));
  }

  const apiUrl = import.meta.env.VITE_STT_API_URL || 'http://localhost:8000/transcribe';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorJson = await response.json();
        errorDetail = errorJson.detail || JSON.stringify(errorJson);
      } catch {
        errorDetail = await response.text();
      }
      throw new Error(`Server returned ${response.status}: ${errorDetail || response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Could not connect to STT backend at http://localhost:8000. Is the server running?');
    }
    throw error;
  }
}

export async function fetchInitialInterviewQuestion(
  jobRole: string,
  attachedDocuments?: Array<{ id: string; name: string; category: string }>
): Promise<string> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const apiUrl = `${baseUrl}/interview/initial-question`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_role: jobRole,
        attached_documents: attachedDocuments || []
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.ai_response || data.question;
    }
  } catch (e) {
    console.warn('Could not fetch initial interview question from backend:', e);
  }

  return `Welcome to your interview practice for the ${jobRole || 'position'} role! To start off, could you please tell me about yourself and your background?`;
}

