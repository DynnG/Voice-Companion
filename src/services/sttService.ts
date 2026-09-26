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

export function extractConversationalText(rawText: string): string {
  if (!rawText) return '';
  let text = rawText.trim();

  // Strip markdown code fences if wrapped
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  } else {
    const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (blockMatch && blockMatch[1] && blockMatch[1].includes('{') && blockMatch[1].includes('}')) {
      text = blockMatch[1].trim();
    }
  }

  // Parse JSON if structure has braces
  if (text.includes('{') && text.includes('}')) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    const jsonSlice = text.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(jsonSlice);
      if (parsed && typeof parsed.response === 'string' && parsed.response.trim()) {
        let clean = parsed.response.trim();
        if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
          clean = clean.slice(1, -1).trim();
        }
        return clean;
      }
    } catch {
      // Regex fallback if JSON.parse fails due to unescaped control chars
      const respMatch = text.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
      if (respMatch && respMatch[1]) {
        try {
          return JSON.parse(`"${respMatch[1]}"`).trim();
        } catch {
          return respMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        }
      }
    }
  }

  // Remove leftover markdown fences or quotes
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

export async function fetchInitialInterviewQuestion(
  jobRole: string,
  attachedDocuments?: AttachedDocumentPayload[],
  interviewId?: string
): Promise<string> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const apiUrl = `${baseUrl}/interview/initial-question`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_role: jobRole,
        attached_documents: attachedDocuments || [],
        interview_id: interviewId
      })
    });

    if (response.ok) {
      const data = await response.json();
      const raw = data.ai_response || data.question || '';
      return extractConversationalText(raw);
    } else {
      if (response.status === 429) {
        return "AI interviewer is temporarily unavailable because the Gemini API usage limit has been reached. Please try again later.";
      }
      return "AI interviewer is temporarily unavailable due to an AI service error. Please try again in a moment.";
    }
  } catch (e) {
    console.warn('Could not fetch initial interview question from backend:', e);
    return "AI interviewer is temporarily unavailable due to a connection error. Please try again in a moment.";
  }
}

export interface FollowupQuestionResult {
  response: string;
  should_end: boolean;
  reason?: string;
  status?: 'success' | 'error';
  error_type?: string;
  error_message?: string;
}

export async function fetchFollowupInterviewQuestion(
  userAnswer: string,
  jobRole?: string,
  conversationHistory?: ConversationHistoryItem[],
  attachedDocuments?: AttachedDocumentPayload[],
  interviewId?: string
): Promise<FollowupQuestionResult> {
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
        attached_documents: attachedDocuments || [],
        interview_id: interviewId
      })
    });

    if (response.ok) {
      const data = await response.json();
      const cleanResponse = extractConversationalText(data.ai_response || '');
      const isError = data.status === 'error' || Boolean(data.error_type);
      return {
        response: cleanResponse,
        should_end: Boolean(data.should_end),
        reason: data.reason,
        status: isError ? 'error' : 'success',
        error_type: data.error_type,
        error_message: data.error_message || (isError ? cleanResponse : undefined)
      };
    } else {
      const errStatus = response.status;
      const isQuota = errStatus === 429;
      const errorMsg = isQuota
        ? 'AI interviewer is temporarily unavailable because the Gemini API usage limit has been reached. Please try again later.'
        : 'AI interviewer is temporarily unavailable due to an AI service error. Please try again in a moment.';
      return {
        response: errorMsg,
        should_end: false,
        reason: isQuota ? 'gemini_quota_exceeded' : 'gemini_ai_service_error',
        status: 'error',
        error_type: isQuota ? 'quota_exceeded' : 'ai_service_error',
        error_message: errorMsg
      };
    }
  } catch (e) {
    console.warn('Could not fetch follow-up interview question from backend:', e);
    const networkErrorMsg = 'AI interviewer is temporarily unavailable due to a connection error. Please try again in a moment.';
    return {
      response: networkErrorMsg,
      should_end: false,
      reason: 'gemini_connection_error',
      status: 'error',
      error_type: 'connection_error',
      error_message: networkErrorMsg
    };
  }
}

