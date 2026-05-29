import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { toGuestFriendlyError } from '@/lib/guestErrors';
import { ConversationContext, Ticket, GuestProfile, Message } from '@/types';
import { useMageStore } from '@/store/mageStore';

// Query keys
export const queryKeys = {
  guestProfile: (guestId: string) => ['guest', guestId],
  conversationHistory: (guestId: string) => ['chat', 'history', guestId],
  agentAvailability: ['agents', 'availability'],
  health: ['health'],
};

// Guest profile query
export function useGuestProfile(guestId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.guestProfile(guestId || ''),
    queryFn: () => apiClient.getGuestProfile(guestId!),
    enabled: !!guestId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Agent availability query
export function useAgentAvailability() {
  const setContext = useMageStore((state) => state.setContext);

  return useQuery({
    queryKey: queryKeys.agentAvailability,
    queryFn: async () => {
      const response = await apiClient.checkAgentAvailability();
      if (response.success && response.data) {
        setContext({
          humanAgentAvailable: response.data.humanAgentAvailable,
          aiAgentAvailable: response.data.aiAgentAvailable,
        });
      }
      return response;
    },
    staleTime: 10000, // 10 seconds (no refetchInterval; app uses WebSocket for live updates)
  });
}

export function useConversationHistory(guestId: string | undefined) {
  const conversationContext = useMageStore((s) => s.context.conversationContext);

  return useQuery({
    queryKey: queryKeys.conversationHistory(guestId || ''),
    queryFn: async () => {
      const response = await apiClient.getConversationHistory(guestId!);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to load history');
      }
      return response.data.messages;
    },
    enabled: !!guestId,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    refetchInterval:
      conversationContext === 'FRONT_DESK_AGENT' ? 4000 : false,
  });
}

// Send message mutation
export function useSendMessage() {
  const { addMessage, context, guestProfile } = useMageStore();

  return useMutation({
    mutationFn: async ({
      content,
      images,
      skipUserBubble,
      taskContinuation,
    }: {
      content: string;
      images?: string[];
      skipUserBubble?: boolean;
      taskContinuation?: boolean;
    }) => {
      if (!skipUserBubble) {
        addMessage({
          role: 'user',
          content,
          images,
        });
      }

      const response = await apiClient.sendMessage(
        content,
        context.conversationContext,
        images,
        guestProfile?.id,
        taskContinuation ?? skipUserBubble
      );

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to send message');
      }
      return response.data;
    },
    onSuccess: (data) => {
      const list = data.messages ?? [];
      for (const m of list) {
        addMessage({
          role: m.role,
          content: m.content,
          kind: m.kind,
          intro: m.intro,
          faqItems: m.faqItems,
          triggerContent: m.triggerContent,
          faqResolved: m.faqResolved,
          requireContactConfirmation: m.requireContactConfirmation,
        });
      }
    },
    onError: (error) => {
      addMessage({
        role: 'assistant',
        content: toGuestFriendlyError(
          error instanceof Error ? error.message : undefined
        ),
      });
    },
  });
}

export function useFaqFeedback() {
  const { addMessage, updateMessage, guestProfile } = useMageStore();

  return useMutation({
    mutationFn: async ({
      helpful,
      triggerContent,
      faqTitles,
      faqMessageId,
      faqPanelMessageId,
    }: {
      helpful: boolean;
      triggerContent: string;
      faqTitles?: string[];
      faqMessageId?: string;
      faqPanelMessageId: string;
    }) => {
      if (!guestProfile?.id) {
        throw new Error('No guest profile');
      }
      updateMessage(faqPanelMessageId, { faqResolved: helpful });
      const response = await apiClient.sendFaqFeedback({
        guestId: guestProfile.id,
        helpful,
        triggerContent,
        faqTitles,
        faqMessageId,
      });
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to send feedback');
      }
      return response.data;
    },
    onSuccess: (data, variables) => {
      for (const m of data.messages ?? []) {
        addMessage({
          role: m.role,
          content: m.content,
          kind: m.kind,
          intro: m.intro,
          faqItems: m.faqItems,
          triggerContent: m.triggerContent,
          faqResolved: m.faqResolved,
          requireContactConfirmation: m.requireContactConfirmation,
        });
      }
      updateMessage(variables.faqPanelMessageId, {
        faqResolved: variables.helpful,
      });
    },
    onError: (_err, variables) => {
      updateMessage(variables.faqPanelMessageId, { faqResolved: null });
    },
  });
}

// Stream message mutation (for real-time response)
export function useStreamMessage() {
  const { addMessage, context, guestProfile } = useMageStore();

  return useMutation({
    mutationFn: async ({
      content,
      images,
      onChunk,
    }: {
      content: string;
      images?: string[];
      onChunk: (chunk: string) => void;
    }) => {
      // Add user message immediately
      addMessage({
        role: 'user',
        content,
        images,
      });

      // Stream response
      await apiClient.streamMessage(
        content,
        context.conversationContext,
        onChunk,
        images,
        guestProfile?.id
      );
    },
  });
}

// Transcribe audio mutation
export function useTranscribeAudio() {
  return useMutation({
    mutationFn: async (audioBlob: Blob) => {
      const response = await apiClient.transcribeAudio(audioBlob);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
  });
}

// Create ticket mutation
export function useCreateTicket() {
  const { setActiveTicket, guestProfile } = useMageStore();

  return useMutation({
    mutationFn: async (issue: string) => {
      if (!guestProfile?.id) {
        throw new Error('No guest profile');
      }
      const response = await apiClient.createTicket(guestProfile.id, issue);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: (ticket) => {
      if (ticket) {
        setActiveTicket(ticket);
      }
    },
  });
}

// Resolve ticket mutation
export function useResolveTicket() {
  const { setActiveTicket } = useMageStore();

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const response = await apiClient.resolveTicket(ticketId);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      setActiveTicket(null);
    },
  });
}

// Cancel ticket mutation
export function useCancelTicket() {
  const { setActiveTicket } = useMageStore();

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const response = await apiClient.cancelTicket(ticketId);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      setActiveTicket(null);
    },
  });
}

// Health check
export function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiClient.healthCheck(),
    staleTime: 60000,
  });
}
