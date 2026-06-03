'use client';

import { useEffect, useState } from 'react';

function parseTime(value: unknown): { hour: number; minute: number; meridiem: 'AM' | 'PM' } {
  const str = String(value || '').trim();
  const match = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return { hour: 3, minute: 0, meridiem: 'PM' };
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || '0', 10);
  let meridiem: 'AM' | 'PM' = (match[3]?.toUpperCase() as 'AM' | 'PM') || 'PM';
  if (!match[3]) {
    if (hour >= 12) {
      meridiem = 'PM';
      if (hour > 12) hour -= 12;
    } else {
      meridiem = hour === 0 ? 'AM' : hour < 8 ? 'AM' : 'PM';
      if (hour === 0) hour = 12;
    }
  } else if (hour === 12) {
    /* keep */
  } else if (meridiem === 'PM' && hour < 12) {
    /* keep */
  }
  return { hour: Math.min(12, Math.max(1, hour)), minute: Math.min(59, minute), meridiem };
}

function formatTime(hour: number, minute: number, meridiem: 'AM' | 'PM'): string {
  return `${hour}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

interface TimeFieldProps {
  value: unknown;
  presets: string[];
  onChange: (value: string) => void;
}

export function TimeField({ value, presets, onChange }: TimeFieldProps) {
  const parsed = parseTime(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>(parsed.meridiem);

  useEffect(() => {
    const p = parseTime(value);
    setHour(p.hour);
    setMinute(p.minute);
    setMeridiem(p.meridiem);
  }, [value]);

  const emit = (h: number, m: number, ampm: 'AM' | 'PM') => {
    onChange(formatTime(h, m, ampm));
  };

  const setPreset = (preset: string) => {
    const p = parseTime(preset);
    setHour(p.hour);
    setMinute(p.minute);
    setMeridiem(p.meridiem);
    onChange(preset);
  };

  return (
    <div>
      <div className="preset-row">
        {presets.map((p) => (
          <button key={p} type="button" className="preset" onClick={() => setPreset(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="time-row">
        <input
          type="number"
          min={1}
          max={12}
          value={hour}
          onChange={(e) => {
            const h = Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1));
            setHour(h);
            emit(h, minute, meridiem);
          }}
          className="time-input"
        />
        <span>:</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={String(minute).padStart(2, '0')}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
            const m =
              raw === '' ? 0 : Math.min(59, Math.max(0, parseInt(raw, 10) || 0));
            setMinute(m);
            emit(hour, m, meridiem);
          }}
          className="time-input"
          aria-label="Minutes"
        />
        <button
          type="button"
          onClick={() => {
            setMeridiem('AM');
            emit(hour, minute, 'AM');
          }}
          className={meridiem === 'AM' ? 'ampm active' : 'ampm'}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => {
            setMeridiem('PM');
            emit(hour, minute, 'PM');
          }}
          className={meridiem === 'PM' ? 'ampm active' : 'ampm'}
        >
          PM
        </button>
      </div>
    </div>
  );
}
