'use client';

import { DragEvent, ReactNode, useRef } from 'react';
import { StaffAction, StaffActionEscalationType } from '@/types';
import {
  actionTypeBadgeClass,
  actionTypeLabel,
  escalationBadgeClass,
  escalationLabel,
  escalationTooltip,
} from './actionBadges';
import { TaskRelativeTime } from './TaskRelativeTime';
import {
  IconChecklist,
  IconEscalationMark,
  IconGrip,
  IconHeadset,
  IconMessage,
  IconRepeat,
  IconStatusClock,
} from './StaffIcons';
import { isDuplicateRequest } from './staffTaskQuery';

function guestInitials(action: StaffAction): string {
  const name = action.guestName ?? action.guestId;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function IconFrame({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'violet' | 'red' | 'amber' | 'blue';
}) {
  const toneClass =
    tone === 'violet'
      ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40'
        : tone === 'amber'
          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40'
          : tone === 'blue'
            ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40'
            : 'border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300';

  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${toneClass}`}
    >
      {children}
    </span>
  );
}

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

function EscalationTitleIcon({ type }: { type: StaffActionEscalationType }) {
  const tip = escalationTooltip(type);
  if (type === 'escalated') {
    return (
      <KanbanTooltip label={tip}>
        <IconFrame tone="red">
          <IconEscalationMark className="text-sm font-bold text-red-600" />
        </IconFrame>
      </KanbanTooltip>
    );
  }
  if (type === 'contact') {
    return (
      <KanbanTooltip label={tip}>
        <IconFrame tone="amber">
          <IconHeadset className="w-3.5 h-3.5" />
        </IconFrame>
      </KanbanTooltip>
    );
  }
  if (type === 'status_check') {
    return (
      <KanbanTooltip label={tip}>
        <IconFrame tone="blue">
          <IconStatusClock />
        </IconFrame>
      </KanbanTooltip>
    );
  }
  if (type === 'repetition') {
    return (
      <KanbanTooltip label={tip}>
        <IconFrame tone="violet">
          <IconRepeat className="w-3.5 h-3.5" />
        </IconFrame>
      </KanbanTooltip>
    );
  }
  return null;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

interface StaffKanbanCardProps {
  action: StaffAction;
  onSelect: (id: string) => void;
  variant?: 'default' | 'mobile';
  requestIndexLabel?: string;
  requestIndex?: number;
  requestTotal?: number;
  sessionMessageCount?: number;
  isDuplicate?: boolean;
}

export function StaffKanbanCard({
  action,
  onSelect,
  variant = 'default',
  requestIndexLabel,
  requestIndex,
  requestTotal,
  sessionMessageCount = 0,
  isDuplicate = false,
}: StaffKanbanCardProps) {
  const escalation = action.escalationType ?? 'normal';
  const showEscalationIcon = escalation !== 'normal';
  const messageCount = sessionMessageCount > 0 ? sessionMessageCount : 0;
  const didDragRef = useRef(false);

  const requestTooltip =
    requestIndex && requestTotal
      ? `Guest request ${requestIndex} of ${requestTotal} from this guest`
      : requestTotal && requestTotal > 1
        ? `${requestTotal} requests from this guest`
        : 'Only request from this guest so far';

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    didDragRef.current = true;
    event.dataTransfer.setData('text/plain', action.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 0);
  };

  const handleClick = () => {
    if (didDragRef.current) return;
    onSelect(action.id);
  };

  if (variant === 'mobile') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(action.id);
          }
        }}
        className="flex w-full cursor-pointer flex-col rounded-2xl border border-neutral-100 bg-white p-4 text-left shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-shadow active:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-[15px] font-semibold leading-snug text-neutral-900 line-clamp-2 dark:text-white">
            {action.summary}
          </h3>
          {showEscalationIcon && <EscalationTitleIcon type={escalation} />}
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <IconStatusClock className="h-3.5 w-3.5 shrink-0" />
          <span>{formatShortDate(action.createdAt)}</span>
          {action.roomNumber && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span>Room {action.roomNumber}</span>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
              {guestInitials(action)}
            </span>
            {messageCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
                <IconMessage className="h-3.5 w-3.5" />
                {messageCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isDuplicate && (
              <IconFrame tone="violet">
                <IconRepeat className="w-3.5 h-3.5" />
              </IconFrame>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <IconChecklist className="h-3.5 w-3.5" />
              {requestIndexLabel ?? '—'}
            </span>
            <span
              className={`inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full ${actionTypeBadgeClass(action.actionType)}`}
            >
              {actionTypeLabel(action.actionType)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(action.id);
        }
      }}
      className="flex w-full cursor-pointer gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900"
    >
      <span
        className="mt-0.5 flex h-5 w-4 shrink-0 cursor-grab items-start justify-center text-neutral-400 active:cursor-grabbing"
        aria-hidden
      >
        <IconGrip className="h-3.5 w-3.5 pointer-events-none" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-sm font-semibold leading-snug text-neutral-900 line-clamp-2 dark:text-white">
            {action.summary}
          </h3>
          {showEscalationIcon && (
            <span className="flex shrink-0 items-center gap-1">
              <EscalationTitleIcon type={escalation} />
            </span>
          )}
        </div>

        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {action.sourceMessage}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span
            className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${actionTypeBadgeClass(action.actionType)}`}
          >
            {actionTypeLabel(action.actionType)}
          </span>
          {escalation === 'contact' && (
            <KanbanTooltip label={escalationTooltip('contact')}>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${escalationBadgeClass('contact')}`}
              >
                <IconHeadset className="w-3 h-3 shrink-0" />
                {escalationLabel('contact')}
              </span>
            </KanbanTooltip>
          )}
          {escalation === 'status_check' && (
            <KanbanTooltip label={escalationTooltip('status_check')}>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${escalationBadgeClass('status_check')}`}
              >
                <IconStatusClock className="w-3 h-3 shrink-0" />
                {escalationLabel('status_check')}
              </span>
            </KanbanTooltip>
          )}
          {action.roomNumber && (
            <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              Room {action.roomNumber}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <TaskRelativeTime iso={action.createdAt} />

            <KanbanTooltip
              label={
                messageCount > 0
                  ? `This guest has sent ${messageCount} message${messageCount === 1 ? '' : 's'} this session`
                  : 'No guest messages loaded for this session yet'
              }
            >
              <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-300">
                <IconFrame>
                  <IconMessage className="w-3.5 h-3.5" />
                </IconFrame>
                {messageCount > 0 ? messageCount : '—'}
              </span>
            </KanbanTooltip>

            {isDuplicate && (
              <KanbanTooltip label="Possible duplicate — check guest chat in case they sent the same request twice">
                <span className="inline-flex items-center">
                  <IconFrame tone="violet">
                    <IconRepeat className="w-3.5 h-3.5" />
                  </IconFrame>
                </span>
              </KanbanTooltip>
            )}

            <KanbanTooltip label={requestTooltip}>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-200">
                <IconFrame tone={requestTotal && requestTotal > 1 ? 'violet' : 'neutral'}>
                  <IconChecklist className="w-3.5 h-3.5" />
                </IconFrame>
                {requestIndexLabel ?? '—'}
              </span>
            </KanbanTooltip>
          </div>

          <KanbanTooltip label={action.guestName ?? action.guestId}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
              {guestInitials(action)}
            </span>
          </KanbanTooltip>
        </div>
      </div>
    </div>
  );
}
