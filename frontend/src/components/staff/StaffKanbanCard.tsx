'use client';

import { StaffAction } from '@/types';
import {
  actionTypeBadgeClass,
  actionTypeLabel,
  escalationBadgeClass,
  escalationLabel,
} from './actionBadges';
import {
  IconAlert,
  IconCalendar,
  IconChecklist,
  IconLink,
  IconMessage,
} from './StaffIcons';

function formatCardDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusProgress(status: StaffAction['status']): string {
  switch (status) {
    case 'acknowledged':
      return '2/4';
    case 'resolved':
      return '4/4';
    default:
      return '1/4';
  }
}

function priorityDotClass(action: StaffAction): string {
  if (action.escalationType === 'escalated') return 'bg-red-500';
  if (action.escalationType === 'contact') return 'bg-amber-400';
  if (action.status === 'acknowledged') return 'bg-sky-400';
  return 'bg-red-400';
}

function guestInitials(action: StaffAction): string {
  const name = action.guestName ?? action.guestId;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface StaffKanbanCardProps {
  action: StaffAction;
  onSelect: (id: string) => void;
}

export function StaffKanbanCard({ action, onSelect }: StaffKanbanCardProps) {
  const showAlert =
    action.escalationType === 'escalated' || action.escalationType === 'contact';

  return (
    <button
      type="button"
      onClick={() => onSelect(action.id)}
      className="group relative w-full text-left rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <span
        className={`absolute top-4 right-4 w-2 h-2 rounded-full ${priorityDotClass(action)}`}
        aria-hidden
      />

      <div className="flex items-start gap-2 pr-4">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug line-clamp-2">
          {action.summary}
        </h3>
        {showAlert && (
          <span className="shrink-0 text-red-500" aria-label="Needs attention">
            <IconAlert />
          </span>
        )}
      </div>

      <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
        {action.sourceMessage}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span
          className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${actionTypeBadgeClass(action.actionType)}`}
        >
          {actionTypeLabel(action.actionType)}
        </span>
        {action.escalationType && action.escalationType !== 'normal' && (
          <span
            className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${escalationBadgeClass(action.escalationType)}`}
          >
            {escalationLabel(action.escalationType)}
          </span>
        )}
        {action.roomNumber && (
          <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            Room {action.roomNumber}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-neutral-400">
          <span className="inline-flex items-center gap-1 text-[11px]">
            <IconCalendar className="w-3.5 h-3.5" />
            {formatCardDate(action.createdAt)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px]">
            <IconMessage className="w-3.5 h-3.5" />
            1
          </span>
          <span className="inline-flex items-center gap-1 text-[11px]">
            <IconLink className="w-3.5 h-3.5" />
          </span>
          <span className="inline-flex items-center gap-1 text-[11px]">
            <IconChecklist className="w-3.5 h-3.5" />
            {statusProgress(action.status)}
          </span>
        </div>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[10px] font-semibold text-neutral-700 dark:text-neutral-200"
          title={action.guestName ?? action.guestId}
        >
          {guestInitials(action)}
        </span>
      </div>
    </button>
  );
}
