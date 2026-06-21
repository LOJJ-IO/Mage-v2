'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StaffStateId } from '@/types';
import {
  clearStoredStaffKey,
  clearStoredStaffRole,
  getStaffEntryState,
  getStoredStaffKey,
  getStoredStaffRole,
  setStoredStaffKey,
  setStoredStaffRole,
  staffTransition,
} from '@/lib/stateMachineStaff';
import { getAllowedActionTypes, getAllowedNav, type StaffRole } from '@/lib/staffPermissions';
import { useStaffActions, useStaffAction, useUpdateStaffAction } from '@/hooks/useStaffApi';
import { StaffPinScreen } from './StaffPinScreen';
import { StaffWorkspace } from './StaffWorkspace';
import { StaffDetailPanel } from './StaffDetailPanel';

async function verifyStaffKey(key: string): Promise<boolean> {
  const { apiClient } = await import('@/lib/api');
  const res = await apiClient.listStaffActions(key);
  return res.success;
}

async function fetchStaffRole(key: string): Promise<StaffRole | null> {
  const { apiClient } = await import('@/lib/api');
  const res = await apiClient.getStaffSession(key);
  if (res.success && res.data) {
    return res.data.role as StaffRole;
  }
  return null;
}

export function StaffStateRenderer() {
  const router = useRouter();
  const [state, setState] = useState<StaffStateId>('S-S-001');
  const [staffKey, setStaffKey] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | undefined>();

  useEffect(() => {
    const stored = getStoredStaffKey();
    if (stored) {
      setStaffKey(stored);
      const storedRole = getStoredStaffRole() as StaffRole | null;
      if (storedRole) setStaffRole(storedRole);
      setState(getStaffEntryState(true));
    }
  }, []);

  const { data: actions = [], isLoading } = useStaffActions(staffKey);
  const { data: selectedAction } = useStaffAction(staffKey, selectedId);
  const updateMutation = useUpdateStaffAction();

  const handlePinSubmit = useCallback(async (key: string) => {
    setPinError(undefined);
    const ok = await verifyStaffKey(key);
    if (!ok) {
      setPinError('Invalid staff key. Try mage-staff-dev for local dev.');
      return;
    }
    setStoredStaffKey(key);
    setStaffKey(key);
    const role = await fetchStaffRole(key);
    if (role) {
      setStoredStaffRole(role);
      setStaffRole(role);
    }
    setState(staffTransition('S-S-001', 'SUBMIT_PIN') ?? 'S-S-002');
  }, []);

  const handleLogout = useCallback(() => {
    clearStoredStaffKey();
    clearStoredStaffRole();
    setStaffKey(null);
    setStaffRole(null);
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

  const handleGetHelp = useCallback(() => {
    if (!selectedId) return;
    router.push(`/staff?nav=help-desk&task=${encodeURIComponent(selectedId)}`);
    setSelectedId(null);
    setState(staffTransition('S-S-003', 'BACK') ?? 'S-S-002');
  }, [selectedId, router]);

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

  const effectiveRole: StaffRole = staffRole ?? 'manager';
  const allowedNav = getAllowedNav(effectiveRole);
  const allowedActionTypes = getAllowedActionTypes(effectiveRole);

  return (
    <div className="staff-ui font-sans flex h-screen min-h-0 w-full overflow-hidden">
      <StaffWorkspace
        actions={actions}
        staffKey={staffKey!}
        isLoading={isLoading}
        staffRole={effectiveRole}
        allowedNav={allowedNav}
        allowedActionTypes={allowedActionTypes}
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
          onGetHelp={handleGetHelp}
        />
      )}
    </div>
  );
}
