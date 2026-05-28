export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  notes?: string;
  allDay?: boolean;
}

export type CalendarFileFormat = 'ics' | 'csv' | 'xml';

export function unfoldIcsLines(content: string): string[] {
  const raw = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsProperty(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = head.indexOf(';');
  if (semi < 0) return { name: head.toUpperCase(), params: '', value };
  return {
    name: head.slice(0, semi).toUpperCase(),
    params: head.slice(semi + 1).toUpperCase(),
    value,
  };
}

export function parseIcsDateValue(value: string, params = ''): { iso: string; allDay: boolean } | null {
  const input = value.trim();
  if (!input) return null;
  const allDay = params.includes('VALUE=DATE') || /^\d{8}$/.test(input);

  if (/^\d{8}$/.test(input)) {
    const year = input.slice(0, 4);
    const month = input.slice(4, 6);
    const day = input.slice(6, 8);
    return { iso: `${year}-${month}-${day}T00:00:00.000Z`, allDay: true };
  }

  const compact = input.replace(/[^0-9TZ]/gi, '');
  if (compact.length < 8) return null;

  const year = compact.slice(0, 4);
  const month = compact.slice(4, 6);
  const day = compact.slice(6, 8);
  const hour = compact.length >= 11 ? compact.slice(9, 11) : '00';
  const minute = compact.length >= 13 ? compact.slice(11, 13) : '00';
  const second = compact.length >= 15 ? compact.slice(13, 15) : '00';
  const isUtc = input.endsWith('Z') || compact.endsWith('Z');
  const iso = isUtc
    ? `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
    : `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), allDay };
}

export function parseIcs(content: string): CalendarEvent[] {
  const lines = unfoldIcsLines(content);
  const events: CalendarEvent[] = [];
  let current: Partial<CalendarEvent> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.start && current?.title) {
        events.push({
          id: current.id ?? `${current.start}-${events.length}`,
          title: current.title,
          start: current.start,
          end: current.end,
          location: current.location,
          notes: current.notes,
          allDay: current.allDay,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const prop = parseIcsProperty(line);
    if (!prop) continue;

    if (prop.name === 'UID') current.id = prop.value.trim();
    if (prop.name === 'SUMMARY') current.title = prop.value.trim();
    if (prop.name === 'LOCATION') current.location = prop.value.trim();
    if (prop.name === 'DESCRIPTION') current.notes = prop.value.replace(/\\n/g, '\n').trim();
    if (prop.name === 'DTSTART') {
      const parsed = parseIcsDateValue(prop.value, prop.params);
      if (parsed) {
        current.start = parsed.iso;
        current.allDay = parsed.allDay;
      }
    }
    if (prop.name === 'DTEND') {
      const parsed = parseIcsDateValue(prop.value, prop.params);
      if (parsed) current.end = parsed.iso;
    }
  }
  return events;
}

function parseFlexibleDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{8}$/.test(value)) {
    const parsed = parseIcsDateValue(value);
    return parsed?.iso ?? null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function parseCsv(content: string): CalendarEvent[] {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const titleIdx = headers.findIndex((h) =>
    ['title', 'summary', 'subject', 'name', 'event'].includes(h)
  );
  const startIdx = headers.findIndex((h) =>
    ['start', 'start date', 'start_time', 'starttime', 'begin', 'dtstart', 'date'].includes(h)
  );
  const endIdx = headers.findIndex((h) =>
    ['end', 'end date', 'end_time', 'endtime', 'finish', 'dtend'].includes(h)
  );
  const locationIdx = headers.findIndex((h) => ['location', 'room', 'place'].includes(h));
  const notesIdx = headers.findIndex((h) =>
    ['description', 'notes', 'details', 'body'].includes(h)
  );

  if (titleIdx < 0 || startIdx < 0) return [];

  const events: CalendarEvent[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const row = splitCsvLine(lines[i]);
    const title = row[titleIdx]?.trim();
    const start = parseFlexibleDate(row[startIdx] ?? '');
    if (!title || !start) continue;
    events.push({
      id: `csv-${i}-${start}`,
      title,
      start,
      end: endIdx >= 0 ? parseFlexibleDate(row[endIdx] ?? '') ?? undefined : undefined,
      location: locationIdx >= 0 ? row[locationIdx]?.trim() : undefined,
      notes: notesIdx >= 0 ? row[notesIdx]?.trim() : undefined,
    });
  }
  return events;
}

function xmlText(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? '';
}

export function parseXml(content: string): CalendarEvent[] {
  const trimmed = content.trim();
  if (trimmed.includes('BEGIN:VCALENDAR')) return parseIcs(trimmed);

  const doc = new DOMParser().parseFromString(trimmed, 'text/xml');
  if (doc.querySelector('parsererror')) return [];

  const candidates = Array.from(
    doc.querySelectorAll('event, Event, VEVENT, item, Item, appointment, Appointment')
  );
  const events: CalendarEvent[] = [];

  candidates.forEach((node, index) => {
    const title =
      xmlText(node.querySelector('title, Title, summary, Summary, subject, Subject')) ||
      node.getAttribute('title') ||
      node.getAttribute('summary');
    const startRaw =
      xmlText(
        node.querySelector(
          'start, Start, startDate, StartDate, dtstart, DtStart, begin, Begin, when'
        )
      ) ||
      node.getAttribute('start') ||
      node.getAttribute('startDate') ||
      '';
    const start = parseFlexibleDate(startRaw);
    if (!title || !start) return;

    const endRaw =
      xmlText(node.querySelector('end, End, endDate, EndDate, dtend, DtEnd, until')) ||
      node.getAttribute('end') ||
      node.getAttribute('endDate');
    const location =
      xmlText(node.querySelector('location, Location, place, Place')) ||
      node.getAttribute('location') ||
      undefined;
    const notes =
      xmlText(node.querySelector('description, Description, notes, Notes, body, Body')) ||
      undefined;

    events.push({
      id: node.getAttribute('id') || `xml-${index}-${start}`,
      title,
      start,
      end: endRaw ? parseFlexibleDate(endRaw) ?? undefined : undefined,
      location,
      notes,
    });
  });

  return events;
}

export function detectCalendarFormat(filename: string, content: string): CalendarFileFormat {
  const trimmed = content.trim();
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith('.ics') || trimmed.startsWith('BEGIN:VCALENDAR')) return 'ics';
  if (lowerName.endsWith('.csv')) return 'csv';
  if (lowerName.endsWith('.xml') || trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
    if (trimmed.includes('BEGIN:VCALENDAR')) return 'ics';
    return 'xml';
  }
  if (trimmed.startsWith('BEGIN:VCALENDAR') || trimmed.includes('BEGIN:VEVENT')) return 'ics';
  const firstLine = trimmed.split('\n')[0]?.toLowerCase() ?? '';
  if (
    firstLine.includes(',') &&
    (firstLine.includes('title') || firstLine.includes('start') || firstLine.includes('date'))
  ) {
    return 'csv';
  }
  return 'ics';
}

export function parseCalendarContent(
  filename: string,
  content: string
): { events: CalendarEvent[]; format: CalendarFileFormat } {
  const format = detectCalendarFormat(filename, content);
  const events =
    format === 'csv' ? parseCsv(content) : format === 'xml' ? parseXml(content) : parseIcs(content);
  return { events, format };
}

export function normalizeCalendarUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('webcal://')) return `https://${trimmed.slice('webcal://'.length)}`;
  if (trimmed.startsWith('webcals://')) return `https://${trimmed.slice('webcals://'.length)}`;
  return trimmed;
}

export function validateCalendarUrl(url: string): string | null {
  const normalized = normalizeCalendarUrl(url);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return 'Enter a valid URL (https://… or webcal://…).';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Calendar URLs must use http or https (or webcal://).';
  }
  const lower = normalized.toLowerCase();
  if (lower.includes('processinvitation') || lower.includes('outlook.live.com/mail/process')) {
    return 'Outlook invitation links are not calendar feeds. Export an .ics file or use a subscription URL that ends in .ics.';
  }
  if (lower.includes('calendar.google.com/calendar/u/') && lower.includes('cid=')) {
    return 'Use the secret iCal link (ends with basic.ics), not the browser calendar page.';
  }
  return null;
}

export function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfWeekSunday(date: Date): Date {
  const value = startOfDay(date);
  value.setDate(value.getDate() - value.getDay());
  return value;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function getMonthGridDays(anchor: Date): Date[] {
  const firstOfMonth = startOfMonth(anchor);
  const gridStart = startOfWeekSunday(firstOfMonth);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function eventEndDate(event: CalendarEvent): Date {
  if (event.end) return new Date(event.end);
  const start = new Date(event.start);
  if (event.allDay) {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return end;
  }
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return end;
}

export function eventOverlapsDay(event: CalendarEvent, day: Date): boolean {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const eventStart = new Date(event.start);
  const eventEnd = eventEndDate(event);
  return eventStart < dayEnd && eventEnd > dayStart;
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

export function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  return new Date(event.start).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type CalendarViewMode = 'day' | 'work-week' | 'week' | 'month';

export function getViewRange(view: CalendarViewMode, anchor: Date): { start: Date; end: Date } {
  const start = startOfDay(anchor);
  const end = new Date(start);
  if (view === 'day') {
    end.setDate(end.getDate() + 1);
  } else if (view === 'work-week') {
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 5);
  } else if (view === 'week') {
    const weekStart = startOfWeekSunday(anchor);
    start.setTime(weekStart.getTime());
    end.setTime(weekStart.getTime());
    end.setDate(end.getDate() + 7);
  } else {
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    start.setTime(monthStart.getTime());
    end.setTime(addDays(monthEnd, 1).getTime());
  }
  return { start, end };
}

export function isInViewRange(
  eventStartIso: string,
  view: CalendarViewMode,
  anchor: Date
): boolean {
  const eventDate = new Date(eventStartIso);
  const { start, end } = getViewRange(view, anchor);
  return eventDate >= start && eventDate < end;
}
