import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { StaffActionStatus } from '@/types';
import { getStoredStaffKey } from '@/lib/stateMachineStaff';

export const staffQueryKeys = {
  actions: (staffKey: string) => ['staff', 'actions', staffKey] as const,
  action: (staffKey: string, id: string) => ['staff', 'action', staffKey, id] as const,
  conversation: (staffKey: string, id: string) =>
    ['staff', 'conversation', staffKey, id] as const,
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
  });
}

export function useUpdateStaffAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      actionId,
      status,
      staffKey,
    }: {
      actionId: string;
      status: StaffActionStatus;
      staffKey: string;
    }) => {
      const response = await apiClient.updateStaffAction(staffKey, actionId, status);
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
      content,
      staffKey,
    }: {
      actionId: string;
      content: string;
      staffKey: string;
    }) => {
      const response = await apiClient.sendStaffActionMessage(staffKey, actionId, content);
      if (!response.success) throw new Error(response.error || 'Send failed');
      return response.data!;
    },
    onSuccess: (_, variables) => {
      const key = variables.staffKey || getStoredStaffKey() || '';
      queryClient.invalidateQueries({
        queryKey: staffQueryKeys.conversation(key, variables.actionId),
      });
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.actions(key) });
      queryClient.invalidateQueries({
        queryKey: staffQueryKeys.action(key, variables.actionId),
      });
    },
  });
}
