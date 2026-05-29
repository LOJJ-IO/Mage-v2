import { ActionType, StaffAction } from '@/types';
import { staffHotelConfig } from '@/config/staffHotel';

export type TaskSortKey =
  | 'time_desc'
  | 'time_asc'
  | 'escalation'
  | 'room_asc'
  | 'room_desc'
  | 'floor_asc'
  | 'floor_desc'
  | 'guest_count_desc'
  | 'guest_count_asc';

export interface TaskFilters {
  serviceTypes: ActionType[];
  floors: string[];
}

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  serviceTypes: [],
  floors: [],
};

export const DEFAULT_TASK_SORT: TaskSortKey = 'escalation';
const SORT_VALUES = new Set<TaskSortKey>([
  'time_desc',
  'time_asc',
  'escalation',
  'room_asc',
  'room_desc',
  'floor_asc',
  'floor_desc',
  'guest_count_desc',
  'guest_count_asc',
]);

const ESCALATION_SORT: Record<string, number> = {
  escalated: 0,
  contact: 1,
  status_check: 2,
  repetition: 3,
  normal: 4,
};

function parseNumeric(value?: string): number | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getGuestActionsMap(actions: StaffAction[]): Map<string, StaffAction[]> {
  const map = new Map<string, StaffAction[]>();
  for (const action of actions) {
    if (!action.guestId) continue;
    const prev = map.get(action.guestId) ?? [];
    prev.push(action);
    map.set(action.guestId, prev);
  }
  map.forEach((guestActions, guestId) => {
    map.set(
      guestId,
      [...guestActions].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    );
  });
  return map;
}

export function deriveFloor(
  roomNumber?: string,
  floorSuffixLength = staffHotelConfig.floorSuffixLength
): string | null {
  if (!roomNumber) return null;
  const digits = roomNumber.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= floorSuffixLength) return null;
  return String(Number.parseInt(digits.slice(0, digits.length - floorSuffixLength), 10));
}

export function getGuestTaskCount(action: StaffAction, allActions: StaffAction[]): number {
  if (!action.guestId) return 0;
  let count = 0;
  for (const row of allActions) {
    if (row.guestId === action.guestId) count += 1;
  }
  return count;
}

function normalizeRequestText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when this looks like the same request sent again (e.g. sprite twice), not merely multiple tasks. */
export function isDuplicateRequest(action: StaffAction, allActions: StaffAction[]): boolean {
  if (action.escalationType === 'repetition') return true;

  const summaryNorm = normalizeRequestText(action.summary);
  const sourceNorm = normalizeRequestText(action.sourceMessage);
  if (!summaryNorm && !sourceNorm) return false;

  const peers = allActions.filter(
    (row) => row.guestId === action.guestId && row.id !== action.id
  );

  for (const other of peers) {
    if (other.actionType !== action.actionType) continue;
    const otherSummary = normalizeRequestText(other.summary);
    const otherSource = normalizeRequestText(other.sourceMessage);

    if (summaryNorm && summaryNorm === otherSummary) return true;
    if (sourceNorm && sourceNorm === otherSource) return true;

    const probe = (summaryNorm.length >= sourceNorm.length ? summaryNorm : sourceNorm).slice(0, 24);
    if (probe.length >= 8) {
      if (otherSummary.includes(probe) || otherSource.includes(probe)) return true;
    }
  }
  return false;
}

export function getGuestRequestIndex(
  action: StaffAction,
  allActions: StaffAction[]
): { index: number; total: number } | null {
  if (!action.guestId) return null;
  const guestMap = getGuestActionsMap(allActions);
  const rows = guestMap.get(action.guestId);
  if (!rows || rows.length === 0) return null;
  const index = rows.findIndex((item) => item.id === action.id);
  if (index < 0) return null;
  return { index: index + 1, total: rows.length };
}

export function applyTaskFilters(
  actions: StaffAction[],
  filters: TaskFilters,
  floorSuffixLength = staffHotelConfig.floorSuffixLength
): StaffAction[] {
  return actions.filter((action) => {
    if (
      filters.serviceTypes.length > 0 &&
      !filters.serviceTypes.includes(action.actionType)
    ) {
      return false;
    }

    if (filters.floors.length > 0) {
      const floor = deriveFloor(action.roomNumber, floorSuffixLength) ?? 'unknown';
      if (!filters.floors.includes(floor)) return false;
    }

    return true;
  });
}

export function applyTaskSort(
  actions: StaffAction[],
  sortKey: TaskSortKey,
  allActions: StaffAction[],
  floorSuffixLength = staffHotelConfig.floorSuffixLength
): StaffAction[] {
  const rows = [...actions];
  rows.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();

    switch (sortKey) {
      case 'time_asc':
        return timeA - timeB;
      case 'time_desc':
        return timeB - timeA;
      case 'room_asc': {
        const ra = parseNumeric(a.roomNumber);
        const rb = parseNumeric(b.roomNumber);
        if (ra == null && rb == null) return timeB - timeA;
        if (ra == null) return 1;
        if (rb == null) return -1;
        return ra - rb || timeB - timeA;
      }
      case 'room_desc': {
        const ra = parseNumeric(a.roomNumber);
        const rb = parseNumeric(b.roomNumber);
        if (ra == null && rb == null) return timeB - timeA;
        if (ra == null) return 1;
        if (rb == null) return -1;
        return rb - ra || timeB - timeA;
      }
      case 'floor_asc': {
        const fa = parseNumeric(deriveFloor(a.roomNumber, floorSuffixLength) ?? undefined);
        const fb = parseNumeric(deriveFloor(b.roomNumber, floorSuffixLength) ?? undefined);
        if (fa == null && fb == null) return timeB - timeA;
        if (fa == null) return 1;
        if (fb == null) return -1;
        return fa - fb || timeB - timeA;
      }
      case 'floor_desc': {
        const fa = parseNumeric(deriveFloor(a.roomNumber, floorSuffixLength) ?? undefined);
        const fb = parseNumeric(deriveFloor(b.roomNumber, floorSuffixLength) ?? undefined);
        if (fa == null && fb == null) return timeB - timeA;
        if (fa == null) return 1;
        if (fb == null) return -1;
        return fb - fa || timeB - timeA;
      }
      case 'guest_count_asc': {
        const ga = getGuestTaskCount(a, allActions);
        const gb = getGuestTaskCount(b, allActions);
        return ga - gb || timeA - timeB;
      }
      case 'guest_count_desc': {
        const ga = getGuestTaskCount(a, allActions);
        const gb = getGuestTaskCount(b, allActions);
        return gb - ga || timeB - timeA;
      }
      case 'escalation':
      default: {
        const ea = ESCALATION_SORT[a.escalationType ?? 'normal'] ?? 4;
        const eb = ESCALATION_SORT[b.escalationType ?? 'normal'] ?? 4;
        if (ea !== eb) return ea - eb;
        return timeB - timeA;
      }
    }
  });
  return rows;
}

export function getAvailableFloors(
  actions: StaffAction[],
  floorSuffixLength = staffHotelConfig.floorSuffixLength
): string[] {
  const floors = new Set<string>();
  for (const action of actions) {
    const floor = deriveFloor(action.roomNumber, floorSuffixLength);
    floors.add(floor ?? 'unknown');
  }
  return Array.from(floors).sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return Number.parseInt(a, 10) - Number.parseInt(b, 10);
  });
}

export function parseTaskQueryState(searchParams: URLSearchParams): {
  filters: TaskFilters;
  sortKey: TaskSortKey;
} {
  const typesRaw = searchParams.get('types');
  const floorsRaw = searchParams.get('floors');
  const sortRaw = searchParams.get('sort');

  const serviceTypes = typesRaw
    ? typesRaw
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is ActionType =>
          ['MAINTENANCE', 'ROOM_SERVICE', 'HOUSEKEEPING', 'CONTACT_FRONT_DESK', 'HANDOFF'].includes(
            item
          )
        )
    : [];

  const floors = floorsRaw
    ? floorsRaw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const sortKey =
    sortRaw && SORT_VALUES.has(sortRaw as TaskSortKey)
      ? (sortRaw as TaskSortKey)
      : DEFAULT_TASK_SORT;

  return {
    filters: {
      serviceTypes,
      floors,
    },
    sortKey,
  };
}

export function buildTaskQueryState(
  existing: URLSearchParams,
  filters: TaskFilters,
  sortKey: TaskSortKey
): URLSearchParams {
  const next = new URLSearchParams(existing.toString());
  if (filters.serviceTypes.length > 0) {
    next.set('types', filters.serviceTypes.join(','));
  } else {
    next.delete('types');
  }

  if (filters.floors.length > 0) {
    next.set('floors', filters.floors.join(','));
  } else {
    next.delete('floors');
  }

  if (sortKey !== DEFAULT_TASK_SORT) {
    next.set('sort', sortKey);
  } else {
    next.delete('sort');
  }
  return next;
}

