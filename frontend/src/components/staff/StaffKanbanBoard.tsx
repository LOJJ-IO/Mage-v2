'use client';

import { useRef, useState } from 'react';
import { ActionType, StaffAction, StaffActionStatus } from '@/types';
import { useMediaQuery } from '@/hooks/useResizableWidth';
import { IconCheckCircle, IconCheckSquare, IconCircle, IconFilter, IconSort, IconX } from './StaffIcons';
import { StaffKanbanColumn } from './StaffKanbanColumn';
import { StaffKanbanMobileColumn } from './StaffKanbanMobileColumn';
import { StaffNavIcon } from './StaffNavIcon';
import { StaffNavShortcut } from './StaffNavShortcut';
import { StaffModuleBody, StaffPageHeader } from './StaffPageHeader';
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
  title?: string;
  showCalendarShortcut?: boolean;
  onSelect: (id: string) => void;
  onToggleServiceType: (type: ActionType) => void;
  onToggleFloor: (floor: string) => void;
  onChangeSort: (sort: TaskSortKey) => void;
  onResetView: () => void;
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
  title = 'Tasks',
  showCalendarShortcut = true,
  onSelect,
  onToggleServiceType,
  onToggleFloor,
  onChangeSort,
  onResetView,
  onMoveAction,
  guestMessageCounts,
}: StaffKanbanBoardProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
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
      <StaffPageHeader
        icon={<StaffNavIcon nav={title === 'Assigned to me' ? 'assigned' : 'tasks'} />}
        title={title}
        actions={
          showCalendarShortcut ? <StaffNavShortcut target="schedule" label="Calendar" /> : undefined
        }
        toolbar={
          <>
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
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            Automate
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">
              Pro
            </span>
          </button>
          <span className="ml-auto hidden text-xs text-neutral-500 sm:inline">
            {totalVisible} visible / {allActions.length} total
          </span>
          </>
        }
      />

      <StaffModuleBody
        className={
          isDesktop
            ? 'overflow-x-auto overflow-y-hidden p-4 md:p-6'
            : 'overflow-y-auto overflow-x-hidden bg-neutral-50/80 p-4 pb-24 dark:bg-neutral-950/80'
        }
      >
        {isLoading && todo.length === 0 && ongoing.length === 0 && done.length === 0 ? (
          isDesktop ? (
            <div className="flex h-full min-w-[900px] gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-64 min-w-[280px] flex-1 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
              ))}
            </div>
          )
        ) : isDesktop ? (
          <div className="flex h-full min-w-min gap-1 lg:min-w-0 lg:grid lg:grid-cols-3 lg:gap-1">
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
        ) : (
          <div className="flex flex-col gap-6">
            <StaffKanbanMobileColumn
              columnId="todo"
              title="To-do"
              icon={<IconCheckSquare className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />}
              iconBgClass="bg-neutral-100 dark:bg-neutral-800"
              actions={todo}
              allActions={allActions}
              guestMessageCounts={guestMessageCounts}
              onSelect={onSelect}
            />
            <StaffKanbanMobileColumn
              columnId="ongoing"
              title="In progress"
              icon={<IconCircle className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
              iconBgClass="bg-sky-50 dark:bg-sky-950/50"
              actions={ongoing}
              allActions={allActions}
              guestMessageCounts={guestMessageCounts}
              onSelect={onSelect}
            />
            <StaffKanbanMobileColumn
              columnId="done"
              title="Done"
              icon={<IconCheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              iconBgClass="bg-emerald-50 dark:bg-emerald-950/40"
              actions={done}
              allActions={allActions}
              guestMessageCounts={guestMessageCounts}
              onSelect={onSelect}
            />
          </div>
        )}
      </StaffModuleBody>
    </div>
  );
}
