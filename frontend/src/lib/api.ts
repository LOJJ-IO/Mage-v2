import { Message, Ticket, GuestProfile, TranscriptionResponse, ConversationContext, ApiResponse } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        return { success: false, error: error.detail || 'Request failed' };
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
  ): Promise<ApiResponse<Message>> {
    return this.request<Message>('/api/chat/message', {
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

  // Transcription endpoints
  async transcribeAudio(audioBlob: Blob): Promise<ApiResponse<TranscriptionResponse>> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const response = await fetch(`${this.baseUrl}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        return { success: false, error: 'Transcription failed' };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transcription error',
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
