import {
  Message,
  Ticket,
  GuestProfile,
  TranscriptionResponse,
  ConversationContext,
  ApiResponse,
  ChatMessageResponse,
  ConversationHistoryResponse,
  FaqFeedbackRequest,
  StaffAction,
  StaffActionStatus,
} from '@/types';
import { mapApiMessage } from '@/lib/mapMessage';
import { GUEST_CHAT_ERROR, toGuestFriendlyError } from '@/lib/guestErrors';

function mapStaffAction(raw: Record<string, unknown>): StaffAction {
  return {
    id: String(raw.id),
    guestId: String(raw.guest_id),
    actionType: raw.action_type as StaffAction['actionType'],
    summary: String(raw.summary),
    sourceMessage: String(raw.source_message),
    status: raw.status as StaffActionStatus,
    createdAt: String(raw.created_at),
    guestName: raw.guest_name != null ? String(raw.guest_name) : undefined,
    roomNumber: raw.room_number != null ? String(raw.room_number) : undefined,
  };
}

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
    options: RequestInit = {},
    staffKey?: string
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };
      if (staffKey) {
        headers['X-Staff-Key'] = staffKey;
      }
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '' }));
        const detail = (error as { detail?: unknown }).detail;
        let message: string;
        if (Array.isArray(detail)) {
          message = detail
            .map((d: { msg?: string }) => d?.msg || '')
            .filter(Boolean)
            .join('; ');
        } else if (typeof detail === 'string') {
          message = detail;
        } else {
          message = '';
        }
        return {
          success: false,
          error: toGuestFriendlyError(message || GUEST_CHAT_ERROR),
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: toGuestFriendlyError(
          error instanceof Error ? error.message : undefined
        ),
      };
    }
  }

  // Chat endpoints
  async getPublicConfig(): Promise<ApiResponse<{ frontDeskPhone: string }>> {
    const res = await this.request<{ front_desk_phone?: string }>('/api/chat/public-config');
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return {
      success: true,
      data: { frontDeskPhone: String(res.data.front_desk_phone || '').trim() },
    };
  }

  async getConversationHistory(
    guestId: string
  ): Promise<ApiResponse<ConversationHistoryResponse>> {
    const res = await this.request<{ messages: Record<string, unknown>[] }>(
      `/api/chat/history/${encodeURIComponent(guestId)}`
    );
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return {
      success: true,
      data: {
        messages: (res.data.messages ?? []).map(mapApiMessage),
      },
    };
  }

  async sendFaqFeedback(
    payload: FaqFeedbackRequest
  ): Promise<ApiResponse<ChatMessageResponse>> {
    const res = await this.request<{ messages: Record<string, unknown>[] }>(
      '/api/chat/faq-feedback',
      {
        method: 'POST',
        body: JSON.stringify({
          guest_id: payload.guestId,
          helpful: payload.helpful,
          trigger_content: payload.triggerContent,
          faq_titles: payload.faqTitles,
          faq_message_id: payload.faqMessageId,
        }),
      }
    );
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return {
      success: true,
      data: { messages: (res.data.messages ?? []).map(mapApiMessage) },
    };
  }

  async sendMessage(
    message: string,
    conversationContext: ConversationContext,
    images?: string[],
    guestId?: string,
    taskContinuation?: boolean
  ): Promise<ApiResponse<ChatMessageResponse>> {
    const res = await this.request<{ messages: Record<string, unknown>[] }>(
      '/api/chat/message',
      {
        method: 'POST',
        body: JSON.stringify({
          content: message,
          conversation_context: conversationContext,
          images,
          guest_id: guestId,
          task_continuation: Boolean(taskContinuation),
        }),
      }
    );
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    const raw = res.data;
    return {
      success: true,
      data: {
        messages: (raw.messages ?? []).map(mapApiMessage),
        continueTask: Boolean(raw.continue_task),
        taskMessage: raw.task_message != null ? String(raw.task_message) : null,
      },
    };
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

  // Staff inbox
  async listStaffActions(
    staffKey: string,
    status?: StaffActionStatus
  ): Promise<ApiResponse<StaffAction[]>> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const qs = params.toString();
    const result = await this.request<Record<string, unknown>[]>(
      `/api/staff/actions${qs ? `?${qs}` : ''}`,
      {},
      staffKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data.map(mapStaffAction) };
  }

  async getStaffAction(staffKey: string, actionId: string): Promise<ApiResponse<StaffAction>> {
    const result = await this.request<Record<string, unknown>>(
      `/api/staff/actions/${actionId}`,
      {},
      staffKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return { success: true, data: mapStaffAction(result.data) };
  }

  async updateStaffAction(
    staffKey: string,
    actionId: string,
    status: StaffActionStatus
  ): Promise<ApiResponse<StaffAction>> {
    const result = await this.request<Record<string, unknown>>(
      `/api/staff/actions/${actionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
      staffKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return { success: true, data: mapStaffAction(result.data) };
  }
}

export const apiClient = new ApiClient();
