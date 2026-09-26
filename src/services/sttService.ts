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

export interface AttachedDocumentPayload {
  id: string;
  name: string;
  category: string;
  content?: string;
  extracted_text?: string;
}

export interface TranscribeContext {
  jobRole?: string;
  attachedDocuments?: AttachedDocumentPayload[];
  history?: ConversationHistoryItem[];
  generateAiResponse?: boolean;
}

export async function extractDocumentText(file: File): Promise<{
  filename: string;
  file_type: string;
  extracted_text: string;
  char_count: number;
  status: string;
}> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  // Quick client-side extraction for plain text and markdown
  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    try {
      const text = await file.text();
      return {
        filename: file.name,
        file_type: ext,
        extracted_text: text.trim(),
        char_count: text.trim().length,
        status: 'success'
      };
    } catch (e) {
      console.warn('Failed client-side text read, falling back to backend extract:', e);
    }
  }

  // Backend extraction for PDF, DOCX, and fallback
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const apiUrl = `${baseUrl}/documents/extract`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      return {
        filename: data.filename || file.name,
        file_type: data.file_type || ext,
        extracted_text: data.extracted_text || '',
        char_count: data.char_count || 0,
        status: data.status || 'success'
      };
    }
    const errText = await response.text();
    console.error(`Document extract failed (${response.status}):`, errText);
  } catch (err) {
    console.error('Network error during document extraction:', err);
  }

  return {
    filename: file.name,
    file_type: ext,
    extracted_text: '',
    char_count: 0,
    status: 'failed'
  };
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
  attachedDocuments?: AttachedDocumentPayload[]
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

export async function fetchFollowupInterviewQuestion(
  userAnswer: string,
  jobRole?: string,
  conversationHistory?: ConversationHistoryItem[],
  attachedDocuments?: AttachedDocumentPayload[]
): Promise<string> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const apiUrl = `${baseUrl}/interview/followup`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_answer: userAnswer,
        job_role: jobRole || 'Software Developer',
        conversation_history: conversationHistory || [],
        attached_documents: attachedDocuments || []
      })
    });

    if (response.ok) {
      const data = await response.json();
      return (data.ai_response || '').trim();
    }
  } catch (e) {
    console.warn('Could not fetch follow-up interview question from backend:', e);
  }

  return 'Thank you for sharing that. Could you tell me more about how you would apply those skills in this role?';
}

