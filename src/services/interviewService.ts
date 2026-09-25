export interface ConversationTurn {
  role: 'user' | 'pal' | 'model' | 'assistant';
  text: string;
}

export interface InterviewChatPayload {
  message: string;
  history?: ConversationTurn[];
  job_role?: string;
  context_docs?: string[];
  system_instruction?: string;
}

export interface InterviewChatResult {
  text: string;
  model: string;
  latency_ms: number;
}

export async function sendInterviewMessage(payload: InterviewChatPayload): Promise<InterviewChatResult> {
  const apiUrl = import.meta.env.VITE_INTERVIEW_API_URL || 'http://localhost:8000/interview/chat';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
      throw new Error('Could not connect to Backend server at http://localhost:8000. Is the server running?');
    }
    throw error;
  }
}
