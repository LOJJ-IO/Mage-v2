'use client';

import { ReactNode, useEffect, useState } from 'react';
import { formatPreciseTimestamp, formatRelativeTime } from './actionBadges';

function KanbanTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 rounded-md border border-neutral-200 bg-neutral-900 px-2 py-1 text-center text-[10px] font-medium leading-snug text-white shadow-lg group-hover/tip:block dark:border-neutral-700"
      >
        {label}
      </span>
    </span>
  );
}

/** Re-renders on an interval so "Just now" advances to minutes/hours ago. */
export function TaskRelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => formatRelativeTime(iso));

  useEffect(() => {
    const update = () => setLabel(formatRelativeTime(iso));
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return (
    <KanbanTooltip label={formatPreciseTimestamp(iso)}>
      <span className="text-[11px] text-neutral-600 dark:text-neutral-300">{label}</span>
    </KanbanTooltip>
  );
}
