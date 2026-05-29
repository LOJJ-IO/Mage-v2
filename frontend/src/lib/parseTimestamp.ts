/**
 * API datetimes are stored in UTC but often serialized without a "Z" suffix.
 * Treat those as UTC so local display stays consistent.
 */
export function parseApiTimestamp(value: string | Date | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const trimmed = String(value).trim();
  if (!trimmed) return new Date(Number.NaN);
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed) &&
    !/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)
  ) {
    return new Date(`${trimmed}Z`);
  }
  return new Date(trimmed);
}

/** Wall-clock time in the user's locale (always from parsed UTC instants). */
export function formatMessageTime(value: string | Date | number): string {
  const date = value instanceof Date ? value : parseApiTimestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
