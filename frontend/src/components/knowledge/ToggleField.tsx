'use client';

interface ToggleFieldProps {
  value: unknown;
  onChange: (value: boolean) => void;
}

function parseToggleValue(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 'yes' || value === 'Yes') {
    return true;
  }
  if (value === false || value === 'false' || value === 'no' || value === 'No') {
    return false;
  }
  const text = String(value ?? '')
    .replace(/\[[^\]]*\]\([^)]+\)/g, '$1')
    .replace(/\]\([^)]+\)/g, '')
    .trim()
    .toLowerCase();
  if (!text) return null;
  if (/\bno pets\b|\bnot pet[- ]?friendly\b|\bpets?\s+(?:are\s+)?not allowed\b/.test(text)) {
    return false;
  }
  if (/\bpet[- ]?friendly\b|\bpets?\s+(?:are\s+)?allowed\b/.test(text)) {
    return true;
  }
  return null;
}

export function ToggleField({ value, onChange }: ToggleFieldProps) {
  const parsed = parseToggleValue(value);
  const boolValue = parsed === true;
  const isNo = parsed === false;

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={boolValue ? 'tog active-yes' : 'tog'}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={isNo ? 'tog active-no' : 'tog'}
      >
        No
      </button>
    </div>
  );
}
