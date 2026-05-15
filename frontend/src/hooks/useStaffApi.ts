import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { StaffActionStatus } from '@/types';
import { getStoredStaffKey } from '@/lib/stateMachineStaff';

export const staffQueryKeys = {
  actions: (staffKey: string) => ['staff', 'actions', staffKey] as const,
  action: (staffKey: string, id: string) => ['staff', 'action', staffKey, id] as const,
};

export function useStaffActions(staffKey: string | null) {
  return useQuery({
    queryKey: staffQueryKeys.actions(staffKey || ''),
    queryFn: async () => {
      const response = await apiClient.listStaffActions(staffKey!);
      if (!response.success) throw new Error(response.error || 'Failed to load actions');
      return response.data ?? [];
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
