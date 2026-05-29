import { Message } from '@/types';

export function staffChatBubbleClasses(role: Message['role']): string {
  if (role === 'user') {
    return 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white rounded-bl-sm';
  }
  if (role === 'staff') {
    return 'bg-mage-blue/15 dark:bg-mage-blue/25 text-mage-black dark:text-white rounded-br-sm border border-mage-blue/30';
  }
  return 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-br-sm';
}

export function staffChatMetaClasses(role: Message['role']): string {
  if (role === 'user') return 'text-neutral-400';
  if (role === 'staff') return 'text-mage-blue/80 dark:text-mage-blue';
  return 'text-white/70 dark:text-neutral-500';
}
