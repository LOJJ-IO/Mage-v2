import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Message, StaffAction, StaffActionStatus, StaffGuestConversation } from '@/types';
import { getStoredStaffKey } from '@/lib/stateMachineStaff';

export const staffQueryKeys = {
  actions: (staffKey: string) => ['staff', 'actions', staffKey] as const,
  action: (staffKey: string, id: string) => ['staff', 'action', staffKey, id] as const,
  conversation: (staffKey: string, id: string) =>
    ['staff', 'conversation', staffKey, id] as const,
  inboxThreads: (staffKey: string) => ['staff', 'inbox-threads', staffKey] as const,
  guestConversation: (staffKey: string, guestId: string) =>
    ['staff', 'guest-conversation', staffKey, guestId] as const,
};

const ESCALATION_SORT: Record<string, number> = {
  escalated: 0,
  contact: 1,
  status_check: 2,
  repetition: 3,
  normal: 4,
};

export function sortStaffActions<T extends { escalationType?: string; createdAt: string }>(
  actions: T[]
): T[] {
  return [...actions].sort((a, b) => {
    const ea = ESCALATION_SORT[a.escalationType ?? 'normal'] ?? 4;
    const eb = ESCALATION_SORT[b.escalationType ?? 'normal'] ?? 4;
    if (ea !== eb) return ea - eb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function useStaffActions(staffKey: string | null) {
  return useQuery({
    queryKey: staffQueryKeys.actions(staffKey || ''),
    queryFn: async () => {
      const response = await apiClient.listStaffActions(staffKey!);
      if (!response.success) throw new Error(response.error || 'Failed to load actions');
      return sortStaffActions(response.data ?? []);
    },
    enabled: !!staffKey,
    refetchInterval: 2500,
  });
}

export function useStaffAction(staffKey: string | null, actionId: string | null) {
  return useQuery({
    queryKey: staffQueryKeys.action(staffKey || '', actionId || ''),
    queryFn: async () => {
      const response = await apiClient.getStaffAction(staffKey!, actionId!);
      if (!response.success) throw new Error(response.error || 'Failed to load action');
      return response.data!;
    },
    enabled: !!staffKey && !!actionId,
  });
}

export function useStaffInboxThreads(staffKey: string | null) {
  return useQuery({
    queryKey: staffQueryKeys.inboxThreads(staffKey || ''),
    queryFn: async () => {
      const response = await apiClient.listStaffInboxThreads(staffKey!);
      if (!response.success) throw new Error(response.error || 'Failed to load inbox');
      return response.data ?? [];
    },
    enabled: !!staffKey,
    refetchInterval: 3000,
    placeholderData: (previous) => previous,
  });
}

export function useStaffGuestConversation(staffKey: string | null, guestId: string | null) {
  return useQuery<StaffGuestConversation>({
    queryKey: staffQueryKeys.guestConversation(staffKey || '', guestId || ''),
    queryFn: async () => {
      const response = await apiClient.getStaffGuestConversation(staffKey!, guestId!);
      if (!response.success) throw new Error(response.error || 'Failed to load conversation');
      return response.data!;
    },
    enabled: !!staffKey && !!guestId,
    refetchInterval: 3000,
    retry: 2,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });
}

export function useStaffActionConversation(staffKey: string | null, actionId: string | null) {
  return useQuery({
    queryKey: staffQueryKeys.conversation(staffKey || '', actionId || ''),
    queryFn: async () => {
      const response = await apiClient.getStaffActionConversation(staffKey!, actionId!);
      if (!response.success) throw new Error(response.error || 'Failed to load conversation');
      return response.data!;
    },
    enabled: !!staffKey && !!actionId,
    refetchInterval: 3000,
    retry: 2,
    staleTime: 0,
  });
}

export function useUpdateStaffAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      actionId,
      status,
      actionType,
      staffKey,
    }: {
      actionId: string;
      staffKey: string;
      status?: StaffActionStatus;
      actionType?: StaffAction['actionType'];
    }) => {
      const response = await apiClient.updateStaffAction(staffKey, actionId, {
        status,
        actionType,
      });
      if (!response.success) throw new Error(response.error || 'Update failed');
      return response.data!;
    },
    onSuccess: (_, variables) => {
      const key = variables.staffKey || getStoredStaffKey() || '';
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.actions(key) });
      queryClient.invalidateQueries({
        queryKey: staffQueryKeys.action(key, variables.actionId),
      });
    },
  });
}

export function useSendStaffMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      actionId,
      guestId,
      content,
      staffKey,
    }: {
      actionId?: string;
      guestId?: string;
      content: string;
      staffKey: string;
    }) => {
      const response = guestId
        ? await apiClient.sendStaffGuestMessage(staffKey, guestId, content)
        : await apiClient.sendStaffActionMessage(staffKey, actionId!, content);
      if (!response.success) throw new Error(response.error || 'Send failed');
      return response.data!;
    },
    onMutate: async (variables) => {
      const key = variables.staffKey || getStoredStaffKey() || '';
      const optimisticId = `optimistic-staff-${Date.now()}`;
      const optimisticMessage: Message = {
        id: optimisticId,
        role: 'staff',
        content: variables.content,
        timestamp: new Date(),
      };

      if (variables.guestId) {
        const queryKey = staffQueryKeys.guestConversation(key, variables.guestId);
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<StaffGuestConversation>(queryKey);
        if (previous) {
          queryClient.setQueryData<StaffGuestConversation>(queryKey, {
            ...previous,
            messages: [...previous.messages, optimisticMessage],
          });
        }
        return { previous, queryKey, optimisticId };
      }

      if (variables.actionId) {
        const queryKey = staffQueryKeys.conversation(key, variables.actionId);
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<{ messages: Message[] }>(queryKey);
        if (previous) {
          queryClient.setQueryData(queryKey, {
            ...previous,
            messages: [...previous.messages, optimisticMessage],
          });
        }
        return { previous, queryKey, optimisticId };
      }

      return undefined;
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSuccess: (sentMessage, variables, context) => {
      const key = variables.staffKey || getStoredStaffKey() || '';

      const applySentMessage = (
        queryKey: readonly string[],
        previous: { messages: Message[] } | undefined
      ) => {
        if (!previous) return;
        const withoutOptimistic = previous.messages.filter(
          (m) => !m.id.startsWith('optimistic-staff-')
        );
        const alreadyPresent = withoutOptimistic.some((m) => m.id === sentMessage.id);
        queryClient.setQueryData(queryKey, {
          ...previous,
          messages: alreadyPresent
            ? withoutOptimistic
            : [...withoutOptimistic, sentMessage],
        });
      };

      if (variables.guestId) {
        const queryKey = staffQueryKeys.guestConversation(key, variables.guestId);
        const cached =
          queryClient.getQueryData<StaffGuestConversation>(queryKey) ??
          context?.previous;
        applySentMessage(queryKey, cached);
        queryClient.invalidateQueries({ queryKey: staffQueryKeys.inboxThreads(key) });
      }

      if (variables.actionId) {
        const queryKey = staffQueryKeys.conversation(key, variables.actionId);
        const cached =
          queryClient.getQueryData<{ messages: Message[] }>(queryKey) ??
          context?.previous;
        applySentMessage(queryKey, cached);
        queryClient.invalidateQueries({
          queryKey: staffQueryKeys.action(key, variables.actionId),
        });
      }

      queryClient.invalidateQueries({ queryKey: staffQueryKeys.actions(key) });
    },
  });
}
