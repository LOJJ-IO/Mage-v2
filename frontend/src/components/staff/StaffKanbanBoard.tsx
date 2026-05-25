'use client';

import { StaffAction } from '@/types';
import { IconCalendar, IconList } from './StaffIcons';
import { StaffKanbanColumn } from './StaffKanbanColumn';

interface StaffKanbanBoardProps {
  todo: StaffAction[];
  ongoing: StaffAction[];
  done: StaffAction[];
  isLoading: boolean;
  onSelect: (id: string) => void;
}

export function StaffKanbanBoard({
  todo,
  ongoing,
  done,
  isLoading,
  onSelect,
}: StaffKanbanBoardProps) {
  return (
    <div className="flex h-full flex-col min-h-0">
      <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconList className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">Tasks</h1>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            <IconCalendar className="w-4 h-4" />
            Calendar
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            Filter
          </button>
          <button
            type="button"
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            Sort
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            Automate
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">
              Pro
            </span>
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 md:p-6">
        {isLoading && todo.length === 0 && ongoing.length === 0 && done.length === 0 ? (
          <div className="flex gap-4 h-full min-w-[900px]">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex-1 min-w-[280px] rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse h-64"
              />
            ))}
          </div>
        ) : (
          <div className="flex gap-4 h-full min-w-min lg:min-w-0 lg:grid lg:grid-cols-3 lg:gap-5">
            <StaffKanbanColumn columnId="todo" actions={todo} onSelect={onSelect} />
            <StaffKanbanColumn columnId="ongoing" actions={ongoing} onSelect={onSelect} />
            <StaffKanbanColumn columnId="done" actions={done} onSelect={onSelect} />
          </div>
        )}
      </div>
    </div>
  );
}
