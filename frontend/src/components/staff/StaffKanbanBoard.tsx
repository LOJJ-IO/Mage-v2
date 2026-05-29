'use client';

import { useRef, useState } from 'react';
import { ActionType, StaffAction, StaffActionStatus } from '@/types';
import { IconCalendar, IconFilter, IconList, IconSort, IconX } from './StaffIcons';
import { StaffKanbanColumn } from './StaffKanbanColumn';
import { TaskFilters, TaskSortKey } from './staffTaskQuery';
import { useClickOutside } from './useClickOutside';

interface StaffKanbanBoardProps {
  allActions: StaffAction[];
  todo: StaffAction[];
  ongoing: StaffAction[];
  done: StaffAction[];
  filters: TaskFilters;
  sortKey: TaskSortKey;
  availableFloors: string[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onToggleServiceType: (type: ActionType) => void;
  onToggleFloor: (floor: string) => void;
  onChangeSort: (sort: TaskSortKey) => void;
  onResetView: () => void;
  onOpenCalendar: () => void;
  onMoveAction: (actionId: string, status: StaffActionStatus) => void;
  guestMessageCounts: Record<string, number>;
}

export function StaffKanbanBoard({
  allActions,
  todo,
  ongoing,
  done,
  filters,
  sortKey,
  availableFloors,
  isLoading,
  onSelect,
  onToggleServiceType,
  onToggleFloor,
  onChangeSort,
  onResetView,
  onOpenCalendar,
  onMoveAction,
  guestMessageCounts,
}: StaffKanbanBoardProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useClickOutside([filterRef, sortRef], () => {
    setFilterOpen(false);
    setSortOpen(false);
  }, filterOpen || sortOpen);

  const activeFilterCount = filters.serviceTypes.length + filters.floors.length;
  const totalVisible = todo.length + ongoing.length + done.length;

  const serviceOptions: Array<{ label: string; value: ActionType }> = [
    { label: 'Maintenance', value: 'MAINTENANCE' },
    { label: 'Housekeeping', value: 'HOUSEKEEPING' },
    { label: 'Room service', value: 'ROOM_SERVICE' },
    { label: 'Front desk', value: 'CONTACT_FRONT_DESK' },
    { label: 'Handoff', value: 'HANDOFF' },
  ];

  const sortOptions: Array<{ label: string; value: TaskSortKey }> = [
    { label: 'Escalation priority', value: 'escalation' },
    { label: 'Newest first', value: 'time_desc' },
    { label: 'Oldest first', value: 'time_asc' },
    { label: 'Room ascending', value: 'room_asc' },
    { label: 'Room descending', value: 'room_desc' },
    { label: 'Floor ascending', value: 'floor_asc' },
    { label: 'Floor descending', value: 'floor_desc' },
    { label: 'Guest request count ↑', value: 'guest_count_asc' },
    { label: 'Guest request count ↓', value: 'guest_count_desc' },
  ];

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
            onClick={onOpenCalendar}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            <IconCalendar className="w-4 h-4" />
            Calendar
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 relative">
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => {
                setFilterOpen((prev) => !prev);
                setSortOpen(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filterOpen || activeFilterCount > 0
                  ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900'
              }`}
            >
              <IconFilter className="w-3.5 h-3.5" />
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              {filterOpen && (
                <IconX
                  className="w-3 h-3"
                  aria-hidden
                />
              )}
            </button>
            {filterOpen && (
              <div className="absolute z-30 mt-2 w-72 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 shadow-xl">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                  Service type
                </p>
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {serviceOptions.map((option) => {
                    const active = filters.serviceTypes.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onToggleServiceType(option.value)}
                        className={`rounded-md border px-2 py-1.5 text-[11px] ${
                          active
                            ? 'border-neutral-400 dark:border-neutral-500 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white'
                            : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                  Floors
                </p>
                <div className="max-h-32 overflow-y-auto grid grid-cols-3 gap-1.5">
                  {availableFloors.map((floor) => {
                    const active = filters.floors.includes(floor);
                    return (
                      <button
                        key={floor}
                        type="button"
                        onClick={() => onToggleFloor(floor)}
                        className={`rounded-md border px-2 py-1 text-[11px] ${
                          active
                            ? 'border-neutral-400 dark:border-neutral-500 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white'
                            : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {floor === 'unknown' ? 'Unknown' : `Floor ${floor}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="relative" ref={sortRef}>
            <button
              type="button"
              onClick={() => {
                setSortOpen((prev) => !prev);
                setFilterOpen(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                sortOpen
                  ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900'
              }`}
            >
              <IconSort className="w-3.5 h-3.5" />
              Sort
              {sortOpen && <IconX className="w-3 h-3" aria-hidden />}
            </button>
            {sortOpen && (
              <div className="absolute z-30 mt-2 w-56 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 shadow-xl">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChangeSort(option.value);
                      setSortOpen(false);
                    }}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-xs ${
                      sortKey === option.value
                        ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white'
                        : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onResetView}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            Reset
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
          <span className="ml-auto text-xs text-neutral-500">
            {totalVisible} visible / {allActions.length} total
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 md:p-6">
        {isLoading && todo.length === 0 && ongoing.length === 0 && done.length === 0 ? (
          <div className="flex gap-3 h-full min-w-[900px]">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex-1 min-w-[280px] rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse h-64"
              />
            ))}
          </div>
        ) : (
          <div className="flex gap-1 h-full min-w-min lg:min-w-0 lg:grid lg:grid-cols-3 lg:gap-1">
            <StaffKanbanColumn
              columnId="todo"
              actions={todo}
              allActions={allActions}
              guestMessageCounts={guestMessageCounts}
              onSelect={onSelect}
              onMoveAction={onMoveAction}
            />
            <StaffKanbanColumn
              columnId="ongoing"
              actions={ongoing}
              allActions={allActions}
              guestMessageCounts={guestMessageCounts}
              onSelect={onSelect}
              onMoveAction={onMoveAction}
            />
            <StaffKanbanColumn
              columnId="done"
              actions={done}
              allActions={allActions}
              guestMessageCounts={guestMessageCounts}
              onSelect={onSelect}
              onMoveAction={onMoveAction}
            />
          </div>
        )}
      </div>
    </div>
  );
}
