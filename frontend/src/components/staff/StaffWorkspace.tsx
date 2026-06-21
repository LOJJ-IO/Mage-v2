'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { StaffAction } from '@/types';
import { StaffSidebar } from './StaffSidebar';
import { StaffKanbanBoard } from './StaffKanbanBoard';
import { StaffKnowledgeOnboarding } from './StaffKnowledgeOnboarding';
import { buildStaffHref, parseStaffNavId, staffNavLabel, StaffNavId } from './staffNav';
import { IconList } from './StaffIcons';
import { StaffScheduleView } from './StaffScheduleView';
import { StaffGuestInbox } from './StaffGuestInbox';
import { StaffReviewDashboard } from './StaffReviewDashboard';
import { StaffHelpDesk } from './StaffHelpDesk';
import { StaffMobileBottomNav } from './StaffMobileBottomNav';
import {
  applyTaskFilters,
  applyTaskSort,
  buildTaskQueryState,
  DEFAULT_TASK_FILTERS,
  DEFAULT_TASK_SORT,
  getAvailableFloors,
  parseTaskQueryState,
  TaskFilters,
  TaskSortKey,
} from './staffTaskQuery';
import { ActionType, StaffActionStatus } from '@/types';
import type { StaffRole } from '@/lib/staffPermissions';
import {
  canReassignTaskTeam,
  defaultActionTypeForRole,
} from '@/lib/staffPermissions';
import { useCreateStaffAction, useStaffInboxThreads, useUpdateStaffAction } from '@/hooks/useStaffApi';
import { countDirectGuestChatPending } from './staffNotifications';
import { StaffAddTaskDialog } from './StaffAddTaskDialog';
import type { KanbanColumnId } from './StaffKanbanColumn';
import {
  StaffContentShell,
  StaffEmptyState,
  StaffPageShell,
} from './StaffLayoutPrimitives';

interface StaffWorkspaceProps {
  actions: StaffAction[];
  staffKey: string;
  isLoading: boolean;
  staffRole: StaffRole;
  allowedNav: StaffNavId[];
  allowedActionTypes: ActionType[];
  onSelect: (id: string) => void;
  onLogout: () => void;
}

const TASK_VIEW_STORAGE_KEY = 'mage-staff-task-view';

function filterByNav(actions: StaffAction[], nav: StaffNavId): StaffAction[] {
  switch (nav) {
    case 'assigned':
      return actions.filter((a) => a.status !== 'resolved');
    case 'tasks':
    default:
      return actions;
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
  staffKey,
  isLoading,
  staffRole,
  allowedNav,
  allowedActionTypes,
  onSelect,
  onLogout,
}: StaffWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const queryState = useMemo(
    () => parseTaskQueryState(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const defaultNav: StaffNavId = allowedNav.includes('tasks') ? 'tasks' : (allowedNav[0] ?? 'tasks');
  const [activeNav, setActiveNav] = useState<StaffNavId>(defaultNav);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>(queryState.filters);
  const [sortKey, setSortKey] = useState<TaskSortKey>(queryState.sortKey);
  const [addTaskColumn, setAddTaskColumn] = useState<KanbanColumnId | null>(null);

  useEffect(() => {
    setFilters(queryState.filters);
    setSortKey(queryState.sortKey);
  }, [queryState]);

  useEffect(() => {
    const nav = parseStaffNavId(searchParams.get('nav'));
    if (nav && allowedNav.includes(nav)) setActiveNav(nav);
  }, [searchParams, allowedNav]);

  const kanbanNav: StaffNavId = activeNav === 'assigned' ? 'assigned' : 'tasks';

  const syncNav = useCallback(
    (nav: StaffNavId, options?: { taskId?: string | null }) => {
      setActiveNav(nav);
      const href = buildStaffHref(
        pathname,
        new URLSearchParams(searchParams.toString()),
        nav,
        options?.taskId ? { taskId: options.taskId } : undefined
      );
      router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const ensureKanbanNav = useCallback(() => {
    const urlNav = parseStaffNavId(searchParams.get('nav'));
    if (urlNav === 'help-desk' || searchParams.has('task')) {
      syncNav(kanbanNav);
    }
  }, [kanbanNav, searchParams, syncNav]);

  const handleSelectTask = useCallback(
    (id: string) => {
      ensureKanbanNav();
      onSelect(id);
    },
    [ensureKanbanNav, onSelect]
  );

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const hasQueryState = params.has('types') || params.has('floors') || params.has('sort');
    if (hasQueryState) return;

    try {
      const raw = localStorage.getItem(TASK_VIEW_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { filters: TaskFilters; sortKey: TaskSortKey };
      const next = buildTaskQueryState(params, parsed.filters, parsed.sortKey);
      if (next.toString() !== params.toString()) {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }
    } catch {
      // no-op
    }
  }, [pathname, router, searchParams]);

  const persistTaskView = (nextFilters: TaskFilters, nextSort: TaskSortKey) => {
    setFilters(nextFilters);
    setSortKey(nextSort);

    const state = { filters: nextFilters, sortKey: nextSort };
    localStorage.setItem(TASK_VIEW_STORAGE_KEY, JSON.stringify(state));

    const current = new URLSearchParams(searchParams.toString());
    if (activeNav === 'tasks' || activeNav === 'assigned') {
      current.set('nav', activeNav);
      current.delete('task');
    }
    const next = buildTaskQueryState(current, nextFilters, nextSort);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const toggleServiceType = (type: ActionType) => {
    const exists = filters.serviceTypes.includes(type);
    const nextFilters: TaskFilters = {
      ...filters,
      serviceTypes: exists
        ? filters.serviceTypes.filter((item) => item !== type)
        : [...filters.serviceTypes, type],
    };
    persistTaskView(nextFilters, sortKey);
  };

  const toggleFloor = (floor: string) => {
    const exists = filters.floors.includes(floor);
    const nextFilters: TaskFilters = {
      ...filters,
      floors: exists ? filters.floors.filter((item) => item !== floor) : [...filters.floors, floor],
    };
    persistTaskView(nextFilters, sortKey);
  };

  const resetTaskView = () => {
    persistTaskView(DEFAULT_TASK_FILTERS, DEFAULT_TASK_SORT);
  };

  const roleFilteredActions = useMemo(
    () => actions.filter((a) => allowedActionTypes.includes(a.actionType)),
    [actions, allowedActionTypes]
  );

  const navScopedActions = useMemo(
    () => filterByNav(roleFilteredActions, activeNav),
    [roleFilteredActions, activeNav]
  );

  const availableFloors = useMemo(() => getAvailableFloors(navScopedActions), [navScopedActions]);

  const filteredActions = useMemo(
    () => applyTaskFilters(navScopedActions, filters),
    [navScopedActions, filters]
  );

  const sortedActions = useMemo(
    () => applyTaskSort(filteredActions, sortKey, actions),
    [filteredActions, sortKey, actions]
  );
  const columns = useMemo(() => groupByStatus(sortedActions), [sortedActions]);

  const guestUnreadCount = useMemo(() => countDirectGuestChatPending(roleFilteredActions), [roleFilteredActions]);
  const { data: inboxThreads = [] } = useStaffInboxThreads(staffKey);
  const guestMessageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const thread of inboxThreads) {
      counts[thread.guestId] = thread.messageCount;
    }
    return counts;
  }, [inboxThreads]);
  const updateMutation = useUpdateStaffAction();
  const createMutation = useCreateStaffAction();
  const canPickTeam = canReassignTaskTeam(staffRole);
  const defaultTeam = defaultActionTypeForRole(staffRole);

  const handleMoveAction = async (actionId: string, status: StaffActionStatus) => {
    ensureKanbanNav();
    await updateMutation.mutateAsync({ actionId, status, staffKey });
  };

  const handleCreateTask = async (values: {
    summary: string;
    guestId: string;
    notes: string;
    actionType?: ActionType;
    status: StaffActionStatus;
  }) => {
    ensureKanbanNav();
    await createMutation.mutateAsync({
      staffKey,
      summary: values.summary,
      guestId: values.guestId,
      sourceMessage: values.notes || values.summary,
      actionType: values.actionType,
      status: values.status,
    });
    setAddTaskColumn(null);
  };

  return (
    <StaffPageShell>
      <StaffSidebar
        activeNav={activeNav}
        guestUnreadCount={guestUnreadCount}
        allowedNav={allowedNav}
        onNavChange={syncNav}
        onLogout={onLogout}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <StaffContentShell>
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg border border-neutral-200 p-2 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            aria-label="Open menu"
          >
            <IconList className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-neutral-900 dark:text-white">
            {staffNavLabel(activeNav)}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {(activeNav === 'tasks' || activeNav === 'assigned') && (
          <StaffKanbanBoard
            allActions={roleFilteredActions}
            todo={columns.todo}
            ongoing={columns.ongoing}
            done={columns.done}
            filters={filters}
            sortKey={sortKey}
            availableFloors={availableFloors}
            isLoading={isLoading}
            title={activeNav === 'assigned' ? 'Assigned to me' : 'Tasks'}
            showCalendarShortcut={activeNav === 'tasks'}
            onSelect={handleSelectTask}
            onToggleServiceType={toggleServiceType}
            onToggleFloor={toggleFloor}
            onChangeSort={(nextSort) => persistTaskView(filters, nextSort)}
            onResetView={resetTaskView}
            onMoveAction={(actionId, status) => void handleMoveAction(actionId, status)}
            onAddTask={setAddTaskColumn}
            guestMessageCounts={guestMessageCounts}
          />
        )}

        {activeNav === 'guest-chat' && (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <StaffGuestInbox staffKey={staffKey} />
          </div>
        )}
        {activeNav === 'schedule' && <StaffScheduleView staffKey={staffKey} />}
        {activeNav === 'review' && <StaffReviewDashboard actions={roleFilteredActions} staffKey={staffKey} />}
        {activeNav === 'help-desk' && (
          <StaffHelpDesk
            staffKey={staffKey}
            taskActionId={searchParams.get('task') ?? undefined}
            onBackToTask={() => syncNav('tasks')}
          />
        )}
        {activeNav === 'knowledge' && (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <StaffKnowledgeOnboarding staffKey={staffKey} embedded />
          </div>
        )}
        {activeNav !== 'tasks' &&
          activeNav !== 'assigned' &&
          activeNav !== 'guest-chat' &&
          activeNav !== 'schedule' &&
          activeNav !== 'review' &&
          activeNav !== 'help-desk' &&
          activeNav !== 'knowledge' && (
            <StaffEmptyState
              title="Coming soon"
              description="This workspace section is reserved for a future staff module."
            />
          )}
        </div>
      </StaffContentShell>

      <StaffMobileBottomNav
        activeNav={activeNav}
        guestUnreadCount={guestUnreadCount}
        allowedNav={allowedNav}
        onNavChange={syncNav}
        onOpenMenu={() => setMobileNavOpen(true)}
      />

      {addTaskColumn && (
        <StaffAddTaskDialog
          open
          columnId={addTaskColumn}
          staffKey={staffKey}
          canPickTeam={canPickTeam}
          defaultTeam={defaultTeam}
          isSubmitting={createMutation.isPending}
          onClose={() => setAddTaskColumn(null)}
          onSubmit={(values) => void handleCreateTask(values)}
        />
      )}
    </StaffPageShell>
  );
}
