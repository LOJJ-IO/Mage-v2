/**
 * Frontend mirror of backend/app/services/staff_permissions.py.
 * Keep in sync with the backend matrix whenever roles or nav IDs change.
 */
import type { StaffNavId } from '@/components/staff/staffNav';
import type { ActionType } from '@/types';

export type StaffRole =
  | 'manager'
  | 'front_desk'
  | 'maintenance'
  | 'housekeeping'
  | 'room_service';

const ALL_ACTION_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
  'MAINTENANCE',
  'ROOM_SERVICE',
  'HOUSEKEEPING',
  'CONTACT_FRONT_DESK',
  'HANDOFF',
]);

export const ROLE_NAV: Record<StaffRole, ReadonlySet<StaffNavId>> = {
  manager: new Set<StaffNavId>(['tasks', 'assigned', 'schedule', 'review', 'guest-chat', 'help-desk', 'knowledge']),
  front_desk: new Set<StaffNavId>(['tasks', 'assigned', 'schedule', 'review', 'guest-chat', 'help-desk', 'knowledge']),
  maintenance: new Set<StaffNavId>(['tasks', 'assigned', 'schedule']),
  housekeeping: new Set<StaffNavId>(['tasks', 'assigned', 'schedule']),
  room_service: new Set<StaffNavId>(['tasks', 'assigned', 'schedule']),
};

export const ROLE_ACTION_TYPES: Record<StaffRole, ReadonlySet<ActionType>> = {
  manager: ALL_ACTION_TYPES,
  front_desk: ALL_ACTION_TYPES,
  maintenance: new Set<ActionType>(['MAINTENANCE', 'HANDOFF']),
  housekeeping: new Set<ActionType>(['HOUSEKEEPING', 'HANDOFF']),
  room_service: new Set<ActionType>(['ROOM_SERVICE', 'HANDOFF']),
};

/** Roles that may see the "Get help with this task" button (consumed by Agent 6). */
export const TASK_HELP_ROLES: ReadonlySet<StaffRole> = new Set<StaffRole>([
  'manager', 'front_desk', 'maintenance', 'housekeeping', 'room_service',
]);

/** Roles that may browse the Help Desk sidebar. */
export const BROWSE_HELP_ROLES: ReadonlySet<StaffRole> = new Set<StaffRole>(['manager', 'front_desk']);

/** Roles that may manually reassign a task to another team. */
export const REASSIGN_TEAM_ROLES: ReadonlySet<StaffRole> = new Set<StaffRole>([
  'manager',
  'front_desk',
]);

/** Valid reassignment targets (HANDOFF is resolved at log time). */
export const REASSIGNABLE_ACTION_TYPES: ActionType[] = [
  'MAINTENANCE',
  'HOUSEKEEPING',
  'ROOM_SERVICE',
  'CONTACT_FRONT_DESK',
];

export function canReassignTaskTeam(role: StaffRole): boolean {
  return REASSIGN_TEAM_ROLES.has(role);
}

export function getAllowedNav(role: StaffRole): StaffNavId[] {
  return Array.from(ROLE_NAV[role]) as StaffNavId[];
}

export function getAllowedActionTypes(role: StaffRole): ActionType[] {
  return Array.from(ROLE_ACTION_TYPES[role]) as ActionType[];
}
