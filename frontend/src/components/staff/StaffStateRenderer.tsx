'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ActionType, StaffStateId } from '@/types';
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
import { getAllowedActionTypes, getAllowedNav, canReassignTaskTeam, type StaffRole } from '@/lib/staffPermissions';
import { useStaffActions, useStaffAction, useUpdateStaffAction } from '@/hooks/useStaffApi';
import { buildStaffHref } from '@/components/staff/staffNav';
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<StaffStateId>('S-S-001');
  const [staffKey, setStaffKey] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | undefined>();

  useEffect(() => {
    const stored = getStoredStaffKey();
    if (!stored) return;

    setStaffKey(stored);
    setState(getStaffEntryState(true));

    const cachedRole = getStoredStaffRole() as StaffRole | null;
    if (cachedRole) setStaffRole(cachedRole);

    void fetchStaffRole(stored).then((role) => {
      if (!role) return;
      setStoredStaffRole(role);
      setStaffRole(role);
    });
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
    router.replace('/onboard/staff');
  }, [router]);

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
    const href = buildStaffHref(
      pathname,
      new URLSearchParams(searchParams.toString()),
      'help-desk',
      { taskId: selectedId }
    );
    router.push(href);
    setSelectedId(null);
    setState(staffTransition('S-S-003', 'BACK') ?? 'S-S-002');
  }, [selectedId, router, pathname, searchParams]);

  const handleUpdateStatus = useCallback(
    async (status: 'acknowledged' | 'resolved') => {
      if (!staffKey || !selectedId) return;
      await updateMutation.mutateAsync({ actionId: selectedId, status, staffKey });
      setSelectedId(null);
      setState('S-S-002');
    },
    [staffKey, selectedId, updateMutation]
  );

  const handleReassignTeam = useCallback(
    async (actionType: ActionType) => {
      if (!staffKey || !selectedId || !selectedAction) return;
      if (actionType === selectedAction.actionType) return;
      await updateMutation.mutateAsync({ actionId: selectedId, actionType, staffKey });
    },
    [staffKey, selectedId, selectedAction, updateMutation]
  );

  if (state === 'S-S-001') {
    return <StaffPinScreen onSubmit={handlePinSubmit} error={pinError} />;
  }

  if (!staffRole) {
    return (
      <div className="staff-ui flex h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading workspace…</p>
      </div>
    );
  }

  const effectiveRole: StaffRole = staffRole;
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
          canReassignTeam={canReassignTaskTeam(effectiveRole)}
          onClose={handleCloseDetail}
          onUpdateStatus={handleUpdateStatus}
          onReassignTeam={(actionType) => void handleReassignTeam(actionType)}
          onGetHelp={handleGetHelp}
        />
      )}
    </div>
  );
}
