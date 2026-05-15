import { ActionType } from '@/types';

export function actionTypeLabel(type: ActionType): string {
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
      return 'bg-mage-gray-200 dark:bg-mage-gray-700 text-mage-gray-700 dark:text-mage-gray-200';
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
