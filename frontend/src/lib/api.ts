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
  StaffActionConversation,
  StaffActionStatus,
  StaffGuestConversation,
  StaffInboxThread,
} from '@/types';
import { mapApiMessage } from '@/lib/mapMessage';
import { GUEST_CHAT_ERROR, toGuestFriendlyError } from '@/lib/guestErrors';

export interface PendingStaffMember {
  id: string;
  staff_code: string;
  display_name: string;
  requested_role: string;
  status: string;
  property_id: string;
  created_at: string | null;
}

export interface TaskAssistMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface TaskAssistThread {
  action_id: string;
  messages: TaskAssistMessage[];
}

export interface TaskAssistResponse {
  reply: string;
  messages: TaskAssistMessage[];
}

/** Raw POST /api/chat/message payload (snake_case from FastAPI). */
type ChatMessageApiPayload = {
  messages: Record<string, unknown>[];
  continue_task?: boolean;
  task_message?: string | null;
};

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
    escalationType:
      raw.escalation_type != null
        ? (String(raw.escalation_type) as StaffAction['escalationType'])
        : 'normal',
    allowStaffJumpIn:
      raw.allow_staff_jump_in != null ? Boolean(raw.allow_staff_jump_in) : true,
    guestConversationThreadId:
      raw.guest_conversation_thread_id != null
        ? String(raw.guest_conversation_thread_id)
        : String(raw.guest_id),
  };
}

function mapGuestProfile(raw: Record<string, unknown>): GuestProfile {
  return {
    id: String(raw.id),
    name: String(raw.name),
    roomNumber: String(raw.room_number),
    checkIn: new Date(String(raw.check_in)),
    checkOut: new Date(String(raw.check_out)),
    bookingId: String(raw.booking_id),
    membershipTier: raw.membership_tier != null ? String(raw.membership_tier) : undefined,
    email: raw.email != null ? String(raw.email) : undefined,
    phone: raw.phone != null ? String(raw.phone) : undefined,
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
    return `${protocol}//${window.location.host}/api/agents/ws`;
  }
  return 'ws://127.0.0.1:8000/api/agents/ws';
}

/** Split a single returning-guest field into email vs booking ID. */
export function parseReturningGuestIdentifier(input: string): {
  email?: string;
  bookingId?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return {};
  if (trimmed.includes('@')) {
    return { email: trimmed };
  }
  return { bookingId: trimmed };
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
        credentials: 'include',
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
    const res = await this.request<ChatMessageApiPayload>(
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
  async getGuestMe(): Promise<ApiResponse<GuestProfile>> {
    const res = await this.request<Record<string, unknown>>('/api/guests/me');
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return { success: true, data: mapGuestProfile(res.data) };
  }

  async getGuestProfile(guestId: string): Promise<ApiResponse<GuestProfile>> {
    const res = await this.request<Record<string, unknown>>(`/api/guests/${guestId}`);
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return { success: true, data: mapGuestProfile(res.data) };
  }

  async verifyAuthToken(token: string): Promise<ApiResponse<{ ok: boolean }>> {
    return this.request<{ ok: boolean }>(
      `/api/auth/verify?t=${encodeURIComponent(token)}&redirect=false`
    );
  }

  async getAuthSession(): Promise<
    ApiResponse<{ authenticated: boolean; guestId?: string; propertyId?: string }>
  > {
    const res = await this.request<{
      authenticated: boolean;
      guest_id?: string;
      property_id?: string;
    }>('/api/auth/session');
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return {
      success: true,
      data: {
        authenticated: res.data.authenticated,
        guestId: res.data.guest_id,
        propertyId: res.data.property_id,
      },
    };
  }

  async signInGuestByEmail(email: string): Promise<ApiResponse<GuestProfile>> {
    const res = await this.request<Record<string, unknown>>('/api/auth/email-sign-in', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    });
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return { success: true, data: mapGuestProfile(res.data) };
  }

  async registerGuest(data: {
    name: string;
    email: string;
    bookingId?: string;
    roomNumber?: string;
    checkIn: string;
    checkOut: string;
    propertyId?: string;
  }): Promise<ApiResponse<{ verificationSent: boolean; email: string; verifyUrl?: string }>> {
    const res = await this.request<{
      verification_sent: boolean;
      email: string;
      verify_url?: string;
    }>('/api/auth/guest/register', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name.trim(),
        email: data.email.trim(),
        booking_id: data.bookingId?.trim() || null,
        room_number: data.roomNumber ?? null,
        check_in: data.checkIn,
        check_out: data.checkOut,
        property_id: data.propertyId ?? null,
      }),
    });
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return {
      success: true,
      data: {
        verificationSent: res.data.verification_sent,
        email: res.data.email,
        verifyUrl: res.data.verify_url,
      },
    };
  }

  async verifyGuestEmail(
    token: string
  ): Promise<ApiResponse<{ verified: boolean; magicLinkSent: boolean; verifyUrl?: string }>> {
    const res = await this.request<{
      verified: boolean;
      magic_link_sent: boolean;
      verify_url?: string;
    }>('/api/auth/guest/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return {
      success: true,
      data: {
        verified: res.data.verified,
        magicLinkSent: res.data.magic_link_sent,
        verifyUrl: res.data.verify_url,
      },
    };
  }

  async signInReturningGuest(data: {
    email?: string;
    bookingId?: string;
    propertyId?: string;
  }): Promise<ApiResponse<GuestProfile>> {
    const res = await this.request<Record<string, unknown>>('/api/auth/guest/sign-in', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email?.trim() || null,
        booking_id: data.bookingId?.trim() || null,
        property_id: data.propertyId ?? null,
      }),
    });
    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }
    return { success: true, data: mapGuestProfile(res.data) };
  }

  /** @deprecated Use signInReturningGuest */
  async signInGuestByBooking(
    _name: string,
    bookingId: string,
    propertyId?: string
  ): Promise<ApiResponse<GuestProfile>> {
    return this.signInReturningGuest({ bookingId, propertyId });
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

  // Staff session
  async getStaffSession(staffKey: string): Promise<ApiResponse<{
    role: string;
    display_name: string;
    staff_code: string;
    allowed_nav: string[];
    allowed_action_types: string[];
  }>> {
    return this.request('/api/staff/session', {}, staffKey);
  }

  // Staff inbox
  async listStaffInboxThreads(staffKey: string): Promise<ApiResponse<StaffInboxThread[]>> {
    const result = await this.request<Record<string, unknown>[]>(
      '/api/staff/inbox/threads?limit=100',
      {},
      staffKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      data: result.data.map((row) => ({
        guestId: String(row.guest_id),
        guestName: row.guest_name != null ? String(row.guest_name) : undefined,
        roomNumber: row.room_number != null ? String(row.room_number) : null,
        lastMessagePreview: String(row.last_message_preview ?? ''),
        lastMessageAt: String(row.last_message_at),
        messageCount: Number(row.message_count ?? 0),
        linkedActionId:
          row.linked_action_id != null ? String(row.linked_action_id) : null,
        liveChatPending: Boolean(row.live_chat_pending),
      })),
    };
  }

  async getStaffGuestConversation(
    staffKey: string,
    guestId: string
  ): Promise<ApiResponse<StaffGuestConversation>> {
    const result = await this.request<Record<string, unknown>>(
      `/api/staff/guests/${encodeURIComponent(guestId)}/conversation`,
      {},
      staffKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    const raw = result.data;
    const guestRaw = (raw.guest ?? {}) as Record<string, unknown>;
    const messagesRaw = (raw.messages ?? []) as Record<string, unknown>[];
    return {
      success: true,
      data: {
        guest: {
          id: String(guestRaw.id),
          name: String(guestRaw.name ?? ''),
          roomNumber:
            guestRaw.room_number != null ? String(guestRaw.room_number) : '',
          checkIn: guestRaw.check_in ? new Date(String(guestRaw.check_in)) : new Date(),
          checkOut: guestRaw.check_out ? new Date(String(guestRaw.check_out)) : new Date(),
          bookingId: String(guestRaw.booking_id ?? ''),
          email: guestRaw.email != null ? String(guestRaw.email) : undefined,
          phone: guestRaw.phone != null ? String(guestRaw.phone) : undefined,
          membershipTier:
            guestRaw.membership_tier != null ? String(guestRaw.membership_tier) : undefined,
        },
        messages: messagesRaw.map((m) => mapApiMessage(m)),
        linkedActionId:
          raw.linked_action_id != null ? String(raw.linked_action_id) : null,
      },
    };
  }

  async sendStaffGuestMessage(
    staffKey: string,
    guestId: string,
    content: string
  ): Promise<ApiResponse<Message>> {
    const result = await this.request<Record<string, unknown>>(
      `/api/staff/guests/${encodeURIComponent(guestId)}/message`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      },
      staffKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return { success: true, data: mapApiMessage(result.data) };
  }

  async listStaffActions(
    staffKey: string,
    status?: StaffActionStatus
  ): Promise<ApiResponse<StaffAction[]>> {
    const params = new URLSearchParams({ limit: '200' });
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

  async listGuestReviewSummaries(staffKey: string): Promise<
    ApiResponse<
      Array<{
        guestId: string;
        name: string;
        roomNumber: string;
        checkOut: Date;
        score: number | null;
      }>
    >
  > {
    const result = await this.request<
      Array<{
        guest_id: string;
        name: string;
        room_number: string;
        check_out: string;
        score: number | null;
      }>
    >('/api/staff/guests/review-summary', {}, staffKey);
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      data: result.data.map((row) => ({
        guestId: row.guest_id,
        name: row.name,
        roomNumber: row.room_number,
        checkOut: new Date(row.check_out),
        score: row.score,
      })),
    };
  }

  async listGuestHappinessScores(staffKey: string): Promise<ApiResponse<Record<string, number>>> {
    const result = await this.request<Array<{ guest_id: string; score: number | null }>>(
      '/api/staff/guests/happiness-scores',
      {},
      staffKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    const map: Record<string, number> = {};
    for (const row of result.data) {
      if (row.score != null) map[row.guest_id] = row.score;
    }
    return { success: true, data: map };
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

  async getStaffActionConversation(
    staffKey: string,
    actionId: string
  ): Promise<ApiResponse<StaffActionConversation>> {
    const result = await this.request<Record<string, unknown>>(
      `/api/staff/actions/${actionId}/conversation`,
      {},
      staffKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    const raw = result.data;
    const guestRaw = (raw.guest ?? {}) as Record<string, unknown>;
    const messagesRaw = (raw.messages ?? []) as Record<string, unknown>[];
    return {
      success: true,
      data: {
        action: mapStaffAction((raw.action ?? {}) as Record<string, unknown>),
        guest: {
          id: String(guestRaw.id),
          name: String(guestRaw.name),
          roomNumber: String(guestRaw.room_number ?? guestRaw.roomNumber),
          checkIn: new Date(String(guestRaw.check_in ?? guestRaw.checkIn)),
          checkOut: new Date(String(guestRaw.check_out ?? guestRaw.checkOut)),
          bookingId: String(guestRaw.booking_id ?? guestRaw.bookingId),
          email: guestRaw.email != null ? String(guestRaw.email) : undefined,
          phone: guestRaw.phone != null ? String(guestRaw.phone) : undefined,
          membershipTier:
            guestRaw.membership_tier != null
              ? String(guestRaw.membership_tier)
              : guestRaw.membershipTier != null
                ? String(guestRaw.membershipTier)
                : undefined,
        },
        messages: messagesRaw.map((m) => mapApiMessage(m)),
      },
    };
  }

  async sendStaffActionMessage(
    staffKey: string,
    actionId: string,
    content: string
  ): Promise<ApiResponse<Message>> {
    const result = await this.request<Record<string, unknown>>(
      `/api/staff/actions/${actionId}/message`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      },
      staffKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return { success: true, data: mapApiMessage(result.data) };
  }

  async fetchStaffCalendarFeed(
    staffKey: string,
    url: string
  ): Promise<ApiResponse<{ content: string; content_type?: string }>> {
    const result = await this.request<{ content: string; content_type?: string }>(
      '/api/staff/calendar/fetch',
      {
        method: 'POST',
        body: JSON.stringify({ url }),
      },
      staffKey
    );
    if (!result.success || !result.data?.content) {
      return { success: false, error: result.error ?? 'Could not load calendar feed.' };
    }
    return { success: true, data: result.data };
  }

  // ---------------------------------------------------------------------------
  // Staff onboarding (Agent 3)
  // ---------------------------------------------------------------------------

  /** Submit a staff access request. Returns staff_code + pending status. */
  async requestStaffAccess(
    displayName: string,
    requestedRole: string,
    propertyId?: string
  ): Promise<ApiResponse<{ staffCode: string; status: string }>> {
    const body: Record<string, string> = {
      display_name: displayName,
      requested_role: requestedRole,
    };
    if (propertyId) body.property_id = propertyId;

    const result = await this.request<{ staff_code: string; status: string }>(
      '/api/staff/onboarding/request',
      { method: 'POST', body: JSON.stringify(body) }
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      data: { staffCode: result.data.staff_code, status: result.data.status },
    };
  }

  /**
   * Exchange a plain-text access key for identity.
   * Store the raw key in sessionStorage; do NOT pass it back to this method on
   * subsequent calls — use it directly in X-Staff-Key headers.
   *
   * Response shape is the canonical Agent 4 contract:
   *   { staff_member_id, staff_code, display_name, approved_role, property_id }
   */
  async staffSignIn(accessKey: string): Promise<
    ApiResponse<{
      staffMemberId: string;
      staffCode: string;
      displayName: string;
      approvedRole: string;
      propertyId: string;
    }>
  > {
    const result = await this.request<{
      staff_member_id: string;
      staff_code: string;
      display_name: string;
      approved_role: string;
      property_id: string;
    }>('/api/staff/onboarding/sign-in', {
      method: 'POST',
      body: JSON.stringify({ access_key: accessKey }),
    });
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      data: {
        staffMemberId: result.data.staff_member_id,
        staffCode: result.data.staff_code,
        displayName: result.data.display_name,
        approvedRole: result.data.approved_role,
        propertyId: result.data.property_id,
      },
    };
  }

  /** List pending staff requests. Requires a manager-role access key. */
  async listPendingStaff(
    managerKey: string
  ): Promise<ApiResponse<PendingStaffMember[]>> {
    const result = await this.request<PendingStaffMember[]>(
      '/api/admin/staff/pending',
      {},
      managerKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  }

  /**
   * Approve a pending staff member and receive a one-time access key.
   * The key is shown exactly once; callers must display and hand it off securely.
   */
  async approveStaff(
    memberId: string,
    managerKey: string,
    approvedRole?: string
  ): Promise<
    ApiResponse<{
      accessKey: string;
      staffCode: string;
      displayName: string;
      approvedRole: string;
    }>
  > {
    const body: Record<string, string> = {};
    if (approvedRole) body.approved_role = approvedRole;

    const result = await this.request<{
      access_key: string;
      staff_code: string;
      display_name: string;
      approved_role: string;
    }>(
      `/api/admin/staff/${encodeURIComponent(memberId)}/approve`,
      { method: 'POST', body: JSON.stringify(body) },
      managerKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      data: {
        accessKey: result.data.access_key,
        staffCode: result.data.staff_code,
        displayName: result.data.display_name,
        approvedRole: result.data.approved_role,
      },
    };
  }

  /** Reject a pending staff member. */
  async rejectStaff(
    memberId: string,
    managerKey: string
  ): Promise<ApiResponse<{ status: string; staffCode: string }>> {
    const result = await this.request<{ status: string; staff_code: string }>(
      `/api/admin/staff/${encodeURIComponent(memberId)}/reject`,
      { method: 'POST', body: JSON.stringify({}) },
      managerKey
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      data: { status: result.data.status, staffCode: result.data.staff_code },
    };
  }

  async getTaskAssistThread(
    staffKey: string,
    actionId: string
  ): Promise<ApiResponse<TaskAssistThread>> {
    return this.request<TaskAssistThread>(
      `/api/staff/task-assist/${encodeURIComponent(actionId)}`,
      { method: 'GET' },
      staffKey
    );
  }

  async sendTaskAssistMessage(
    staffKey: string,
    actionId: string,
    message: string,
    staffMemberId?: string
  ): Promise<ApiResponse<TaskAssistResponse>> {
    return this.request<TaskAssistResponse>(
      '/api/staff/task-assist',
      {
        method: 'POST',
        body: JSON.stringify({
          action_id: actionId,
          message,
          ...(staffMemberId ? { staff_member_id: staffMemberId } : {}),
        }),
      },
      staffKey
    );
  }
}

export const apiClient = new ApiClient();
