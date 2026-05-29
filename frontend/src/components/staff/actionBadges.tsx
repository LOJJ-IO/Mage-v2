import { parseApiTimestamp } from '@/lib/parseTimestamp';
import { ActionType, StaffActionEscalationType } from '@/types';

export const parseActionTimestamp = parseApiTimestamp;

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

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = parseApiTimestamp(iso).getTime();
  if (Number.isNaN(then)) return 'Unknown time';
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  return parseApiTimestamp(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatPreciseTimestamp(iso: string): string {
  return parseApiTimestamp(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function escalationTooltip(type: StaffActionEscalationType): string {
  switch (type) {
    case 'escalated':
      return 'Escalated — needs urgent attention';
    case 'contact':
      return 'Contact — guest asked to speak with the front desk';
    case 'status_check':
      return 'Status — guest is following up on a prior request';
    case 'repetition':
      return 'Repeat — similar request from this guest; check if duplicate';
    default:
      return '';
  }
}
