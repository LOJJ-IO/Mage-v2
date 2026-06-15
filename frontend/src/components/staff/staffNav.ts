export type StaffNavId =
  | 'tasks'
  | 'assigned'
  | 'schedule'
  | 'review'
  | 'guest-chat'
  | 'help-desk'
  | 'knowledge';

export interface StaffNavItem {
  id: StaffNavId;
  label: string;
  icon: 'star' | 'user' | 'list' | 'calendar' | 'message' | 'book' | 'layers';
  href?: string;
  badge?: number;
}

export const STAFF_NAV_ITEMS: StaffNavItem[] = [
  { id: 'review', label: 'Review specialist', icon: 'star' },
  { id: 'assigned', label: 'Assigned to me', icon: 'user' },
  { id: 'tasks', label: 'Tasks', icon: 'list' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar' },
  { id: 'guest-chat', label: 'Chat with guests', icon: 'message' },
  { id: 'knowledge', label: 'Knowledge', icon: 'layers' },
  { id: 'help-desk', label: 'Help desk', icon: 'book' },
];

const STAFF_NAV_IDS = new Set<string>(STAFF_NAV_ITEMS.map((item) => item.id));

export function parseStaffNavId(value: string | null | undefined): StaffNavId | null {
  if (!value || !STAFF_NAV_IDS.has(value)) return null;
  return value as StaffNavId;
}

export function staffNavLabel(nav: StaffNavId): string {
  return STAFF_NAV_ITEMS.find((item) => item.id === nav)?.label ?? nav;
}
