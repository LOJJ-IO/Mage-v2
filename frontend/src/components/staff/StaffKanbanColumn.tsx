'use client';

import { DragEvent, ReactNode, useState } from 'react';
import { StaffAction, StaffActionStatus } from '@/types';
import { IconCheckCircle, IconCheckSquare, IconCircle, IconMore, IconPlus } from './StaffIcons';
import { StaffKanbanCard } from './StaffKanbanCard';
import { getGuestRequestIndex, isDuplicateRequest } from './staffTaskQuery';

export type KanbanColumnId = 'todo' | 'ongoing' | 'done';

const COLUMN_STATUS: Record<KanbanColumnId, StaffActionStatus> = {
  todo: 'pending',
  ongoing: 'acknowledged',
  done: 'resolved',
};

const COLUMN_META: Record<
  KanbanColumnId,
  { title: string; icon: ReactNode; iconClass: string }
> = {
  todo: {
    title: 'To-do',
    icon: <IconCheckSquare className="w-4 h-4" />,
    iconClass: 'text-neutral-500',
  },
  ongoing: {
    title: 'On-going',
    icon: <IconCircle className="w-4 h-4" />,
    iconClass: 'text-neutral-500',
  },
  done: {
    title: 'Done',
    icon: <IconCheckCircle className="w-4 h-4 text-emerald-500" />,
    iconClass: '',
  },
};

interface StaffKanbanColumnProps {
  columnId: KanbanColumnId;
  actions: StaffAction[];
  allActions: StaffAction[];
  guestMessageCounts: Record<string, number>;
  onSelect: (id: string) => void;
  onMoveAction: (actionId: string, status: StaffActionStatus) => void;
}

export function StaffKanbanColumn({
  columnId,
  actions,
  allActions,
  guestMessageCounts,
  onSelect,
  onMoveAction,
}: StaffKanbanColumnProps) {
  const meta = COLUMN_META[columnId];
  const isEmpty = actions.length === 0;
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const actionId = event.dataTransfer.getData('text/plain');
    if (!actionId) return;
    onMoveAction(actionId, COLUMN_STATUS[columnId]);
  };

  return (
    <div
      className={`flex w-full min-w-[280px] flex-1 flex-col rounded-xl transition-colors md:min-w-[300px] lg:min-w-0 ${
        dragOver
          ? 'bg-sky-50/90 ring-2 ring-sky-300 dark:bg-sky-950/30 dark:ring-sky-700'
          : 'bg-neutral-50/80 dark:bg-neutral-900/50'
      }`}
      onDragLeave={() => setDragOver(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <span className={meta.iconClass}>{meta.icon}</span>
        <h2 className="flex-1 text-sm font-semibold text-neutral-900 dark:text-white">
          {meta.title}
        </h2>
        <button
          type="button"
          className="rounded p-1 text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800"
          aria-label={`Add to ${meta.title}`}
        >
          <IconPlus className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800"
          aria-label="Column options"
        >
          <IconMore className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 min-h-[200px] max-h-[calc(100vh-220px)] lg:max-h-[calc(100vh-200px)]">
        {isEmpty && columnId === 'done' ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-700 px-4 py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <IconCheckCircle className="w-6 h-6 text-neutral-300 dark:text-neutral-600" />
            </div>
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              No tasks completed yet
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Completed tasks will appear here
            </p>
          </div>
        ) : (
          actions.map((action) => {
            const indexInfo = getGuestRequestIndex(action, allActions);
            return (
              <StaffKanbanCard
                key={action.id}
                action={action}
                onSelect={onSelect}
                requestIndexLabel={
                  indexInfo ? `${indexInfo.index}/${indexInfo.total}` : undefined
                }
                requestIndex={indexInfo?.index}
                requestTotal={indexInfo?.total}
                sessionMessageCount={guestMessageCounts[action.guestId] ?? 0}
                isDuplicate={isDuplicateRequest(action, allActions)}
              />
            );
          })
        )}

        {isEmpty && columnId !== 'done' && (
          <p className="py-8 text-center text-xs text-neutral-400">Drop tasks here</p>
        )}
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors"
        >
          <IconPlus className="w-3.5 h-3.5" />
          Add task
        </button>
      </div>
    </div>
  );
}
