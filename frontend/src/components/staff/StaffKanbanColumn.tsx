'use client';

import { ReactNode } from 'react';
import { StaffAction } from '@/types';
import { IconCheckCircle, IconCheckSquare, IconCircle, IconMore, IconPlus } from './StaffIcons';
import { StaffKanbanCard } from './StaffKanbanCard';

export type KanbanColumnId = 'todo' | 'ongoing' | 'done';

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
  onSelect: (id: string) => void;
}

export function StaffKanbanColumn({ columnId, actions, onSelect }: StaffKanbanColumnProps) {
  const meta = COLUMN_META[columnId];
  const isEmpty = actions.length === 0;

  return (
    <div className="flex min-w-[280px] max-w-[360px] flex-1 flex-col rounded-xl bg-neutral-50/80 dark:bg-neutral-900/50 md:min-w-[300px] lg:min-w-0">
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
          actions.map((action) => (
            <StaffKanbanCard key={action.id} action={action} onSelect={onSelect} />
          ))
        )}

        {!isEmpty && columnId === 'done' && null}

        {isEmpty && columnId !== 'done' && (
          <p className="py-8 text-center text-xs text-neutral-400">No tasks in this column</p>
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
