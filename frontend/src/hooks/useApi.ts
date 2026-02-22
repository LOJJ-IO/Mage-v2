import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { ConversationContext, Ticket, GuestProfile, Message } from '@/types';
import { useMageStore } from '@/store/mageStore';

// Query keys
export const queryKeys = {
  guestProfile: (guestId: string) => ['guest', guestId],
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

// Send message mutation
export function useSendMessage() {
  const queryClient = useQueryClient();
  const { addMessage, context, guestProfile } = useMageStore();

  return useMutation({
    mutationFn: async ({
      content,
      images,
    }: {
      content: string;
      images?: string[];
    }) => {
      // Add user message immediately
      addMessage({
        role: 'user',
        content,
        images,
      });

      // Send to API
      const response = await apiClient.sendMessage(
        content,
        context.conversationContext,
        images,
        guestProfile?.id
      );

      return response;
    },
    onSuccess: (response) => {
      if (response.success && response.data) {
        addMessage({
          role: 'assistant',
          content: response.data.content,
          requireContactConfirmation: (response.data as any).require_contact_confirmation,
        });
      }
    },
    onError: (error) => {
      addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
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
