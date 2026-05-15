import { Message, Ticket, GuestProfile, TranscriptionResponse, ConversationContext, ApiResponse, ChatMessageResponse } from '@/types';

/**
 * When unset, requests use same-origin `/api/...` (see next.config.js rewrites → FastAPI).
 * Set NEXT_PUBLIC_API_URL only if you need the browser to talk to the API host directly
 * (e.g. no Next dev server in front).
 */
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

/** WebSocket URL for agent availability (ws or wss from http/https). */
export function getAgentAvailabilityWsUrl(): string {
  const base = API_BASE_URL.trim().replace(/\/$/, '');
  if (base) {
    const wsBase = base.startsWith('https') ? base.replace(/^https/, 'wss') : base.replace(/^http/, 'ws');
    return `${wsBase}/api/agents/ws`;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:8000/api/agents/ws`;
  }
  return 'ws://127.0.0.1:8000/api/agents/ws';
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        const detail = (error as { detail?: unknown }).detail;
        let message: string;
        if (Array.isArray(detail)) {
          message = detail
            .map((d: { msg?: string }) => d?.msg || JSON.stringify(d))
            .filter(Boolean)
            .join('; ');
        } else if (typeof detail === 'string') {
          message = detail;
        } else {
          message = 'Request failed';
        }
        return { success: false, error: message || 'Request failed' };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // Chat endpoints
  async sendMessage(
    message: string,
    conversationContext: ConversationContext,
    images?: string[],
    guestId?: string
  ): Promise<ApiResponse<ChatMessageResponse>> {
    return this.request<ChatMessageResponse>('/api/chat/message', {
      method: 'POST',
      body: JSON.stringify({
        content: message,
        conversation_context: conversationContext,
        images,
        guest_id: guestId,
      }),
    });
  }

  async streamMessage(
    message: string,
    conversationContext: ConversationContext,
    onChunk: (chunk: string) => void,
    images?: string[],
    guestId?: string
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: message,
        conversation_context: conversationContext,
        images,
        guest_id: guestId,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error('Stream request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              onChunk(parsed.content);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  // Transcription endpoints (with timeout and backend error message preserved)
  async transcribeAudio(
    audioBlob: Blob,
    options?: { timeoutMs?: number }
  ): Promise<ApiResponse<TranscriptionResponse>> {
    const timeoutMs = options?.timeoutMs ?? 60_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const formData = new FormData();
    const ext = audioBlob.type === 'audio/mp4' ? 'm4a' : audioBlob.type?.includes('ogg') ? 'ogg' : 'webm';
    formData.append('audio', audioBlob, `recording.${ext}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/transcribe`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const detail =
          typeof errBody?.detail === 'string'
            ? errBody.detail
            : Array.isArray(errBody?.detail)
              ? errBody.detail.join(', ')
              : 'Transcription failed';
        return { success: false, error: detail };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        const message =
          error.name === 'AbortError'
            ? 'Transcription timed out. Try a shorter recording.'
            : error.message;
        return { success: false, error: message };
      }
      return {
        success: false,
        error: 'Transcription error',
      };
    }
  }

  // Ticket endpoints
  async createTicket(guestId: string, issue: string): Promise<ApiResponse<Ticket>> {
    return this.request<Ticket>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({
        guest_id: guestId,
        issue,
      }),
    });
  }

  async updateTicket(
    ticketId: string,
    updates: Partial<Ticket>
  ): Promise<ApiResponse<Ticket>> {
    return this.request<Ticket>(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async resolveTicket(ticketId: string): Promise<ApiResponse<Ticket>> {
    return this.request<Ticket>(`/api/tickets/${ticketId}/resolve`, {
      method: 'POST',
    });
  }

  async cancelTicket(ticketId: string): Promise<ApiResponse<{ cancelled: boolean }>> {
    return this.request<{ cancelled: boolean }>(`/api/tickets/${ticketId}/cancel`, {
      method: 'POST',
    });
  }

  // Guest profile endpoints
  async getGuestProfile(guestId: string): Promise<ApiResponse<GuestProfile>> {
    return this.request<GuestProfile>(`/api/guests/${guestId}`);
  }

  async getGuestByBooking(bookingId: string): Promise<ApiResponse<GuestProfile>> {
    return this.request<GuestProfile>(`/api/guests/booking/${bookingId}`);
  }

  // Agent availability endpoints
  async checkAgentAvailability(): Promise<ApiResponse<{
    humanAgentAvailable: boolean;
    aiAgentAvailable: boolean;
  }>> {
    return this.request<{
      humanAgentAvailable: boolean;
      aiAgentAvailable: boolean;
    }>('/api/agents/availability');
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<{ status: string }>> {
    return this.request<{ status: string }>('/api/health');
  }
}

export const apiClient = new ApiClient();
