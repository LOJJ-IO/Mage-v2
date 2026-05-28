'use client';

import { useCallback, useEffect, useState } from 'react';
import { StaffStateId } from '@/types';
import {
  clearStoredStaffKey,
  getStaffEntryState,
  getStoredStaffKey,
  setStoredStaffKey,
  staffTransition,
} from '@/lib/stateMachineStaff';
import { useStaffActions, useStaffAction, useUpdateStaffAction } from '@/hooks/useStaffApi';
import { StaffPinScreen } from './StaffPinScreen';
import { StaffWorkspace } from './StaffWorkspace';
import { StaffDetailPanel } from './StaffDetailPanel';

async function verifyStaffKey(key: string): Promise<boolean> {
  const { apiClient } = await import('@/lib/api');
  const res = await apiClient.listStaffActions(key);
  return res.success;
}

export function StaffStateRenderer() {
  const [state, setState] = useState<StaffStateId>('S-S-001');
  const [staffKey, setStaffKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | undefined>();

  useEffect(() => {
    const stored = getStoredStaffKey();
    if (stored) {
      setStaffKey(stored);
      setState(getStaffEntryState(true));
    }
  }, []);

  const { data: actions = [], isLoading } = useStaffActions(staffKey);
  const { data: selectedAction } = useStaffAction(staffKey, selectedId);
  const updateMutation = useUpdateStaffAction();

  const pendingCount = actions.filter((a) => a.status === 'pending').length;

  const handlePinSubmit = useCallback(async (key: string) => {
    setPinError(undefined);
    const ok = await verifyStaffKey(key);
    if (!ok) {
      setPinError('Invalid staff key. Try mage-staff-dev for local dev.');
      return;
    }
    setStoredStaffKey(key);
    setStaffKey(key);
    setState(staffTransition('S-S-001', 'SUBMIT_PIN') ?? 'S-S-002');
  }, []);

  const handleLogout = useCallback(() => {
    clearStoredStaffKey();
    setStaffKey(null);
    setSelectedId(null);
    setState('S-S-001');
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setState(staffTransition('S-S-002', 'SELECT_ACTION') ?? 'S-S-003');
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedId(null);
    setState(staffTransition('S-S-003', 'BACK') ?? 'S-S-002');
  }, []);

  const handleUpdateStatus = useCallback(
    async (status: 'acknowledged' | 'resolved') => {
      if (!staffKey || !selectedId) return;
      await updateMutation.mutateAsync({ actionId: selectedId, status, staffKey });
      setSelectedId(null);
      setState('S-S-002');
    },
    [staffKey, selectedId, updateMutation]
  );

  if (state === 'S-S-001') {
    return <StaffPinScreen onSubmit={handlePinSubmit} error={pinError} />;
  }

  return (
    <>
      <StaffWorkspace
        actions={actions}
        staffKey={staffKey!}
        isLoading={isLoading}
        pendingCount={pendingCount}
        onSelect={handleSelect}
        onLogout={handleLogout}
      />
      {state === 'S-S-003' && selectedAction && staffKey && (
        <StaffDetailPanel
          action={selectedAction}
          staffKey={staffKey}
          isUpdating={updateMutation.isPending}
          onClose={handleCloseDetail}
          onUpdateStatus={handleUpdateStatus}
        />
      )}
    </>
  );
}
