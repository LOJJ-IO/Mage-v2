import { ActionType, StaffActionEscalationType } from '@/types';

export function actionTypeLabel(type: ActionType): string {
  if (type === 'HANDOFF') {
    return 'Front Desk';
  }
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function actionTypeBadgeClass(type: ActionType): string {
  switch (type) {
    case 'MAINTENANCE':
      return 'bg-mage-yellow/20 text-mage-yellow dark:text-mage-yellow';
    case 'HOUSEKEEPING':
      return 'bg-mage-blue/15 text-mage-blue';
    case 'ROOM_SERVICE':
      return 'bg-mage-green/15 text-mage-green';
    case 'CONTACT_FRONT_DESK':
      return 'bg-mage-red/15 text-mage-red';
    case 'HANDOFF':
      return 'bg-mage-red/15 text-mage-red';
    default:
      return 'bg-mage-gray-100 text-mage-gray-600';
  }
}

export function statusDotClass(status: string): string {
  switch (status) {
    case 'resolved':
      return 'bg-mage-gray-300 dark:bg-mage-gray-600';
    case 'acknowledged':
      return 'bg-mage-blue';
    default:
      return 'border-2 border-mage-gray-400 dark:border-mage-gray-500 bg-transparent';
  }
}

export function escalationLabel(type: StaffActionEscalationType): string {
  switch (type) {
    case 'escalated':
      return 'Escalated';
    case 'contact':
      return 'Contact';
    case 'status_check':
      return 'Status';
    case 'repetition':
      return 'Repeat';
    default:
      return '';
  }
}

export function escalationBadgeClass(type: StaffActionEscalationType): string {
  switch (type) {
    case 'escalated':
      return 'bg-mage-red/20 text-mage-red';
    case 'contact':
      return 'bg-mage-yellow/20 text-mage-yellow dark:text-mage-yellow';
    case 'status_check':
      return 'bg-mage-blue/15 text-mage-blue';
    case 'repetition':
      return 'bg-mage-gray-200 text-mage-gray-600 dark:bg-mage-gray-700 dark:text-mage-gray-300';
    default:
      return 'bg-mage-gray-100 text-mage-gray-600';
  }
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}
