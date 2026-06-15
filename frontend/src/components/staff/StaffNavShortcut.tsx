'use client';

import { useRouter } from 'next/navigation';
import { StaffNavId } from './staffNav';
import { StaffNavIcon } from './StaffNavIcon';

interface StaffNavShortcutProps {
  target: StaffNavId;
  label?: string;
  className?: string;
}

const DEFAULT_LABELS: Partial<Record<StaffNavId, string>> = {
  tasks: 'Tasks',
  schedule: 'Calendar',
  'guest-chat': 'Guest chat',
  review: 'Reviews',
  knowledge: 'Knowledge',
  'help-desk': 'Help desk',
};

/** Cross-page utility link styled like the Tasks → Calendar button. */
export function StaffNavShortcut({ target, label, className = '' }: StaffNavShortcutProps) {
  const router = useRouter();
  const text = label ?? DEFAULT_LABELS[target] ?? target;

  return (
    <button
      type="button"
      onClick={() => router.push(`/staff?nav=${encodeURIComponent(target)}`)}
      className={`inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900 ${className}`}
    >
      <StaffNavIcon nav={target} className="w-4 h-4" />
      {text}
    </button>
  );
}
