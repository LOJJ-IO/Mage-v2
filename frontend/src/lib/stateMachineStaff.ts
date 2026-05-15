import { StaffStateId } from '@/types';

export type StaffTrigger = 'SUBMIT_PIN' | 'SELECT_ACTION' | 'BACK' | 'ACK' | 'RESOLVE' | 'LOGOUT';

export interface StaffTransition {
  from: StaffStateId | 'ENTRY';
  trigger: StaffTrigger;
  to: StaffStateId;
}

export const STAFF_TRANSITIONS: StaffTransition[] = [
  { from: 'ENTRY', trigger: 'SUBMIT_PIN', to: 'S-S-002' },
  { from: 'S-S-001', trigger: 'SUBMIT_PIN', to: 'S-S-002' },
  { from: 'S-S-002', trigger: 'SELECT_ACTION', to: 'S-S-003' },
  { from: 'S-S-002', trigger: 'LOGOUT', to: 'S-S-001' },
  { from: 'S-S-003', trigger: 'BACK', to: 'S-S-002' },
  { from: 'S-S-003', trigger: 'ACK', to: 'S-S-002' },
  { from: 'S-S-003', trigger: 'RESOLVE', to: 'S-S-002' },
];

export function getStaffEntryState(hasStaffKey: boolean): StaffStateId {
  return hasStaffKey ? 'S-S-002' : 'S-S-001';
}

export function staffTransition(
  current: StaffStateId,
  trigger: StaffTrigger
): StaffStateId | null {
  const match = STAFF_TRANSITIONS.find((t) => t.from === current && t.trigger === trigger);
  if (match) return match.to;
  return null;
}

export const STAFF_STORAGE_KEY = 'mage-staff-key';

export function getStoredStaffKey(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(STAFF_STORAGE_KEY);
}

export function setStoredStaffKey(key: string): void {
  sessionStorage.setItem(STAFF_STORAGE_KEY, key);
}

export function clearStoredStaffKey(): void {
  sessionStorage.removeItem(STAFF_STORAGE_KEY);
}
