export interface TranscribeResult {
  text: string;
  language: string;
  language_probability: number;
  duration: number;
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
}

export async function transcribeAudio(audioBlob: Blob): Promise<TranscribeResult> {
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
