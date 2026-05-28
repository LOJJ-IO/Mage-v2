export type StaffNavId =
  | 'tasks'
  | 'assigned'
  | 'schedule'
  | 'review'
  | 'guest-chat'
  | 'help-desk';

export interface StaffNavItem {
  id: StaffNavId;
  label: string;
  icon: 'star' | 'user' | 'list' | 'calendar' | 'message' | 'book';
  href?: string;
  badge?: number;
}

export const STAFF_NAV_ITEMS: StaffNavItem[] = [
  { id: 'review', label: 'Review specialist', icon: 'star' },
  { id: 'assigned', label: 'Assigned to me', icon: 'user' },
  { id: 'tasks', label: 'Tasks', icon: 'list' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar' },
  { id: 'guest-chat', label: 'Chat with guests', icon: 'message' },
  { id: 'help-desk', label: 'Help desk', icon: 'book' },
];
