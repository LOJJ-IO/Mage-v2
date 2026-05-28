'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  addDays,
  CalendarEvent,
  CalendarViewMode,
  eventEndDate,
  eventOverlapsDay,
  formatDayHeader,
  formatEventTime,
  formatMonthYear,
  getMonthGridDays,
  getViewRange,
  isSameDay,
  parseCalendarContent,
  startOfDay,
  startOfMonth,
  validateCalendarUrl,
} from '@/lib/staffCalendar';

interface CalendarSource {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  events: CalendarEvent[];
}

type VisibleEvent = CalendarEvent & {
  sourceId: string;
  sourceName: string;
  sourceColor: string;
};

const STORAGE_KEY = 'mage-staff-schedule-v2';
const COLORS = ['#0078d4', '#107c10', '#5c2d91', '#ca5010', '#d13438', '#038387'];

const VIEW_OPTIONS: { id: CalendarViewMode; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'work-week', label: 'Work week' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7);

function shiftAnchor(view: CalendarViewMode, anchor: Date, direction: -1 | 1): Date {
  const next = new Date(anchor);
  if (view === 'day') next.setDate(next.getDate() + direction);
  else if (view === 'work-week' || view === 'week') next.setDate(next.getDate() + direction * 7);
  else next.setMonth(next.getMonth() + direction);
  return next;
}

function getRangeLabel(view: CalendarViewMode, anchor: Date): string {
  if (view === 'month') return formatMonthYear(anchor);
  const { start, end } = getViewRange(view, anchor);
  const endInclusive = addDays(end, -1);
  if (view === 'day') {
    return anchor.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endInclusive.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function MiniMonth({
  anchor,
  selected,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: {
  anchor: Date;
  selected: Date;
  onSelectDay: (day: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const monthStart = startOfMonth(anchor);
  const days = getMonthGridDays(anchor);
  const today = startOfDay(new Date());

  return (
    <div className="px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
          {formatMonthYear(monthStart)}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-neutral-500">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-0.5">
            {label[0]}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = day.getMonth() === monthStart.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selected);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                !inMonth ? 'text-neutral-400 dark:text-neutral-600' : 'text-neutral-800 dark:text-neutral-200'
              } ${isSelected ? 'bg-[#0078d4] text-white' : isToday ? 'ring-1 ring-[#0078d4]' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({
  anchor,
  selectedDay,
  events,
  onSelectDay,
  onSelectEvent,
}: {
  anchor: Date;
  selectedDay: Date;
  events: VisibleEvent[];
  onSelectDay: (day: Date) => void;
  onSelectEvent: (id: string) => void;
}) {
  const days = getMonthGridDays(anchor);
  const monthIndex = anchor.getMonth();
  const today = startOfDay(new Date());

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-r border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-600 last:border-r-0 dark:border-neutral-800 dark:text-neutral-400"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const inMonth = day.getMonth() === monthIndex;
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);
          const dayEvents = events
            .filter((event) => eventOverlapsDay(event, day))
            .slice(0, 3);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`flex min-h-[88px] flex-col border-b border-r border-neutral-200 p-1 text-left last:border-r-0 dark:border-neutral-800 ${
                isSelected ? 'ring-2 ring-inset ring-[#0078d4]' : ''
              } ${!inMonth ? 'bg-neutral-50/80 dark:bg-neutral-950/40' : 'bg-white dark:bg-neutral-950'}`}
            >
              <span
                className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday
                    ? 'bg-[#0078d4] font-semibold text-white'
                    : inMonth
                      ? 'text-neutral-800 dark:text-neutral-200'
                      : 'text-neutral-400'
                }`}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayEvents.map((event) => (
                  <span
                    key={`${event.id}-${day.toISOString()}`}
                    role="presentation"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(event.id);
                    }}
                    className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: event.sourceColor }}
                    title={event.title}
                  >
                    {!event.allDay && (
                      <span className="mr-1 opacity-90">{formatEventTime(event)}</span>
                    )}
                    {event.title}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getColumnDays(anchor: Date, view: CalendarViewMode): Date[] {
  if (view === 'day') return [startOfDay(anchor)];
  const { start } = getViewRange(view, anchor);
  const dayCount = view === 'work-week' ? 5 : 7;
  return Array.from({ length: dayCount }, (_, i) => addDays(start, i));
}

function WeekGrid({
  anchor,
  view,
  events,
  onSelectEvent,
}: {
  anchor: Date;
  view: CalendarViewMode;
  events: VisibleEvent[];
  onSelectEvent: (id: string) => void;
}) {
  const days = getColumnDays(anchor, view);
  const dayCount = days.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div
        className="grid border-b border-neutral-200 dark:border-neutral-800"
        style={{ gridTemplateColumns: `56px repeat(${dayCount}, minmax(0, 1fr))` }}
      >
        <div />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="border-l border-neutral-200 px-2 py-2 text-center dark:border-neutral-800"
          >
            <p className="text-xs font-semibold text-neutral-900 dark:text-white">
              {formatDayHeader(day)}
            </p>
          </div>
        ))}
      </div>
      <div
        className="grid flex-1"
        style={{ gridTemplateColumns: `56px repeat(${dayCount}, minmax(0, 1fr))` }}
      >
        {HOURS.map((hour) => (
          <div key={hour} className="contents">
            <div className="border-b border-r border-neutral-200 px-1 py-2 text-right text-[10px] text-neutral-500 dark:border-neutral-800">
              {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
            </div>
            {days.map((day) => {
              const slotEvents = events.filter((event) => {
                if (event.allDay) return false;
                const start = new Date(event.start);
                return isSameDay(start, day) && start.getHours() === hour;
              });
              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className="relative min-h-[48px] border-b border-l border-neutral-200 dark:border-neutral-800"
                >
                  {slotEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectEvent(event.id)}
                      className="absolute inset-x-0.5 top-0.5 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-white"
                      style={{ backgroundColor: event.sourceColor }}
                    >
                      {event.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {events.some((e) => e.allDay) && (
        <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            All day
          </p>
          <div className="flex flex-wrap gap-1">
            {events
              .filter((e) => e.allDay)
              .map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onSelectEvent(event.id)}
                  className="rounded px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: event.sourceColor }}
                >
                  {event.title}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}


export function StaffScheduleView({ staffKey }: { staffKey: string }) {
  const [view, setView] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [calendarUrl, setCalendarUrl] = useState('');
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('mage-staff-schedule-v1');
    if (!raw) return;
    try {
      setSources(JSON.parse(raw) as CalendarSource[]);
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  }, [sources]);

  const visibleEvents = useMemo((): VisibleEvent[] => {
    return sources
      .filter((source) => source.visible)
      .flatMap((source) =>
        source.events.map((event) => ({
          ...event,
          sourceId: source.id,
          sourceName: source.name,
          sourceColor: source.color,
        }))
      );
  }, [sources]);

  const rangeEvents = useMemo(() => {
    const { start, end } = getViewRange(view, anchorDate);
    return visibleEvents
      .filter((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = eventEndDate(event);
        return eventStart < end && eventEnd > start;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [visibleEvents, view, anchorDate]);

  const selectedEvent =
    visibleEvents.find((event) => event.id === selectedEventId) ?? null;

  const showStatus = useCallback((type: 'ok' | 'err', text: string) => {
    setStatusMessage({ type, text });
    window.setTimeout(() => setStatusMessage(null), 6000);
  }, []);

  const addCalendarSource = useCallback(
    (name: string, events: CalendarEvent[]) => {
      if (events.length === 0) {
        showStatus('err', 'No events found in that file or feed.');
        return;
      }
      setSources((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${prev.length}`,
          name,
          color: COLORS[prev.length % COLORS.length],
          visible: true,
          events,
        },
      ]);
      showStatus('ok', `Added “${name}” with ${events.length} event${events.length === 1 ? '' : 's'}.`);
      setImportOpen(false);
    },
    [showStatus]
  );

  const handleFileUpload = async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    const { events } = parseCalendarContent(file.name, text);
    addCalendarSource(file.name.replace(/\.(ics|csv|xml)$/i, ''), events);
  };

  const handleAddUrlFeed = async () => {
    const validationError = validateCalendarUrl(calendarUrl);
    if (validationError) {
      showStatus('err', validationError);
      return;
    }
    setIsFetchingUrl(true);
    const result = await apiClient.fetchStaffCalendarFeed(staffKey, calendarUrl.trim());
    setIsFetchingUrl(false);
    if (!result.success || !result.data?.content) {
      showStatus('err', result.error ?? 'Could not load calendar URL.');
      return;
    }
    const urlLabel = (() => {
      try {
        const host = new URL(calendarUrl.trim()).hostname;
        const path = new URL(calendarUrl.trim()).pathname;
        if (path.toLowerCase().includes('.ics')) return host;
        return `${host} feed`;
      } catch {
        return 'Calendar feed';
      }
    })();
    const { events } = parseCalendarContent('feed.ics', result.data.content);
    addCalendarSource(urlLabel, events);
    setCalendarUrl('');
  };

  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((row) => row.id !== id));
  };

  const rangeLabel = getRangeLabel(view, anchorDate);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-950">
      <div className="shrink-0 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/80 md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            title="Local calendars only — API sync coming later"
            className="rounded-md bg-[#0078d4] px-3 py-1.5 text-xs font-semibold text-white opacity-60"
          >
            New event
          </button>
          <div className="inline-flex rounded-md border border-neutral-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-950">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  view === option.id
                    ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setAnchorDate(today);
                setSelectedDay(startOfDay(today));
              }}
              className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-900"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate((prev) => shiftAnchor(view, prev, -1))}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              aria-label="Previous"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate((prev) => shiftAnchor(view, prev, 1))}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              aria-label="Next"
            >
              ›
            </button>
            <span className="min-w-[140px] text-sm font-semibold text-neutral-900 dark:text-white">
              {rangeLabel}
            </span>
          </div>
        </div>
        {statusMessage && (
          <p
            className={`mt-2 text-xs ${
              statusMessage.type === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {statusMessage.text}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[220px] shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800 lg:flex">
          <MiniMonth
            anchor={anchorDate}
            selected={selectedDay}
            onSelectDay={(day) => {
              setSelectedDay(startOfDay(day));
              setAnchorDate(day);
            }}
            onPrevMonth={() =>
              setAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
            }
            onNextMonth={() =>
              setAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
            }
          />

          <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setImportOpen((open) => !open)}
              className="flex w-full items-center gap-1 text-left text-xs font-medium text-[#0078d4]"
            >
              <span className="text-base leading-none">+</span> Add calendar
            </button>
            {importOpen && (
              <div className="mt-2 space-y-2">
                <label className="block text-[11px] text-neutral-500">
                  Import file (.ics, .csv, .xml)
                  <input
                    type="file"
                    accept=".ics,.csv,.xml,text/calendar,text/csv,text/xml,application/xml"
                    onChange={(e) => void handleFileUpload(e.target.files?.[0])}
                    className="mt-1 block w-full text-[11px]"
                  />
                </label>
                <div>
                  <span className="text-[11px] text-neutral-500">Subscribe via URL</span>
                  <div className="mt-1 flex gap-1">
                    <input
                      type="url"
                      value={calendarUrl}
                      onChange={(e) => setCalendarUrl(e.target.value)}
                      placeholder="https://…/basic.ics"
                      className="min-w-0 flex-1 rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] dark:border-neutral-700 dark:bg-neutral-900"
                    />
                    <button
                      type="button"
                      disabled={isFetchingUrl}
                      onClick={() => void handleAddUrlFeed()}
                      className="shrink-0 rounded bg-[#0078d4] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-60"
                    >
                      {isFetchingUrl ? '…' : 'Add'}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-neutral-500">
                    Secret Google iCal and webcal:// links load via the server. Outlook invitation
                    pages and browser calendar links will not work.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              My calendars
            </p>
            <div className="space-y-1.5">
              {sources.map((source) => (
                <div key={source.id} className="group flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-neutral-800 dark:text-neutral-200">
                    <input
                      type="checkbox"
                      checked={source.visible}
                      onChange={() =>
                        setSources((prev) =>
                          prev.map((row) =>
                            row.id === source.id ? { ...row, visible: !row.visible } : row
                          )
                        )
                      }
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: source.color }}
                    />
                    <span className="truncate">{source.name}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSource(source.id)}
                    className="hidden text-[10px] text-neutral-400 group-hover:inline"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {sources.length === 0 && (
                <p className="text-xs text-neutral-500">No calendars yet. Add a file or URL.</p>
              )}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800 lg:hidden">
            <label className="block">
              Import (.ics / .csv / .xml)
              <input
                type="file"
                accept=".ics,.csv,.xml,text/calendar"
                onChange={(e) => void handleFileUpload(e.target.files?.[0])}
                className="mt-1 block w-full"
              />
            </label>
          </div>

          {view === 'month' && (
            <MonthGrid
              anchor={anchorDate}
              selectedDay={selectedDay}
              events={visibleEvents}
              onSelectDay={(day) => {
                setSelectedDay(startOfDay(day));
                setAnchorDate(day);
              }}
              onSelectEvent={setSelectedEventId}
            />
          )}
          {(view === 'week' || view === 'work-week') && (
            <WeekGrid
              anchor={anchorDate}
              view={view}
              events={rangeEvents}
              onSelectEvent={setSelectedEventId}
            />
          )}
          {view === 'day' && (
            <WeekGrid
              anchor={anchorDate}
              view="day"
              events={rangeEvents}
              onSelectEvent={setSelectedEventId}
            />
          )}
        </main>

        <aside className="hidden w-[300px] shrink-0 flex-col border-l border-neutral-200 dark:border-neutral-800 xl:flex">
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Event</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 text-sm text-neutral-700 dark:text-neutral-300">
            {selectedEvent ? (
              <div className="space-y-2">
                <p
                  className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: selectedEvent.sourceColor }}
                >
                  {selectedEvent.sourceName}
                </p>
                <p className="text-base font-semibold text-neutral-900 dark:text-white">
                  {selectedEvent.title}
                </p>
                <p>
                  {new Date(selectedEvent.start).toLocaleString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    hour: selectedEvent.allDay ? undefined : 'numeric',
                    minute: selectedEvent.allDay ? undefined : '2-digit',
                  })}
                </p>
                {selectedEvent.end && (
                  <p className="text-neutral-500">
                    Ends{' '}
                    {new Date(selectedEvent.end).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: selectedEvent.allDay ? undefined : 'numeric',
                      minute: selectedEvent.allDay ? undefined : '2-digit',
                    })}
                  </p>
                )}
                {selectedEvent.location && <p>Location: {selectedEvent.location}</p>}
                {selectedEvent.notes && (
                  <p className="whitespace-pre-wrap text-neutral-500">{selectedEvent.notes}</p>
                )}
              </div>
            ) : (
              <p className="text-neutral-500">Select an event to see details.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
