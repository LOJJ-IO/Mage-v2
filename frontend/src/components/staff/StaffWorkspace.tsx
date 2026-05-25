'use client';

import { useMemo, useState } from 'react';
import { StaffAction } from '@/types';
import { StaffSidebar } from './StaffSidebar';
import { StaffKanbanBoard } from './StaffKanbanBoard';
import { StaffNavId } from './staffNav';
import { IconList } from './StaffIcons';
import { sortStaffActions } from '@/hooks/useStaffApi';

interface StaffWorkspaceProps {
  actions: StaffAction[];
  isLoading: boolean;
  pendingCount: number;
  onSelect: (id: string) => void;
  onLogout: () => void;
}

function filterByNav(actions: StaffAction[], nav: StaffNavId): StaffAction[] {
  const sorted = sortStaffActions(actions);
  switch (nav) {
    case 'review':
      return sorted.filter(
        (a) =>
          a.escalationType === 'escalated' ||
          a.escalationType === 'contact' ||
          a.escalationType === 'repetition'
      );
    case 'assigned':
      return sorted.filter((a) => a.status !== 'resolved');
    case 'tasks':
    default:
      return sorted;
  }
}

function groupByStatus(actions: StaffAction[]) {
  return {
    todo: actions.filter((a) => a.status === 'pending'),
    ongoing: actions.filter((a) => a.status === 'acknowledged'),
    done: actions.filter((a) => a.status === 'resolved'),
  };
}

export function StaffWorkspace({
  actions,
  isLoading,
  pendingCount,
  onSelect,
  onLogout,
}: StaffWorkspaceProps) {
  const [activeNav, setActiveNav] = useState<StaffNavId>('tasks');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const filtered = useMemo(
    () => filterByNav(actions, activeNav),
    [actions, activeNav]
  );
  const columns = useMemo(() => groupByStatus(filtered), [filtered]);

  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      <StaffSidebar
        activeNav={activeNav}
        pendingCount={pendingCount}
        onNavChange={setActiveNav}
        onLogout={onLogout}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex lg:hidden items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-2 text-neutral-700 dark:text-neutral-300"
            aria-label="Open menu"
          >
            <IconList className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-neutral-900 dark:text-white">
            Mage Staff
          </span>
        </div>

        {activeNav === 'schedule' ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <p className="text-lg font-semibold text-neutral-900 dark:text-white">Schedule</p>
            <p className="mt-2 max-w-sm text-sm text-neutral-500">
              Shift and task scheduling will appear here. Use Tasks for the guest request board.
            </p>
          </div>
        ) : (
          <StaffKanbanBoard
            todo={columns.todo}
            ongoing={columns.ongoing}
            done={columns.done}
            isLoading={isLoading}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}
