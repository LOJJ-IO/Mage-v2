'use client';

import { useEffect, useState } from 'react';

type Meridiem = 'AM' | 'PM';
type ParsedTime = { hour: number; minute: number; meridiem: Meridiem };

function parseTime(value: unknown): ParsedTime | null {
  const str = String(value || '').trim();
  if (!str) return null;
  const match = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || '0', 10);
  let meridiem: Meridiem = (match[3]?.toUpperCase() as Meridiem) || 'PM';
  if (!match[3]) {
    if (hour >= 12) {
      meridiem = 'PM';
      if (hour > 12) hour -= 12;
    } else {
      meridiem = hour === 0 ? 'AM' : hour < 8 ? 'AM' : 'PM';
      if (hour === 0) hour = 12;
    }
  }
  return { hour: Math.min(12, Math.max(1, hour)), minute: Math.min(59, minute), meridiem };
}

function formatTime(hour: number, minute: number, meridiem: Meridiem): string {
  return `${hour}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

interface TimeFieldProps {
  value: unknown;
  presets: string[];
  onChange: (value: string) => void;
}

export function TimeField({ value, presets, onChange }: TimeFieldProps) {
  const parsed = parseTime(value);
  const [hour, setHour] = useState<number | ''>(parsed?.hour ?? '');
  const [minute, setMinute] = useState<number | ''>(parsed?.minute ?? '');
  const [meridiem, setMeridiem] = useState<Meridiem | ''>(parsed?.meridiem ?? '');

  useEffect(() => {
    const p = parseTime(value);
    setHour(p?.hour ?? '');
    setMinute(p?.minute ?? '');
    setMeridiem(p?.meridiem ?? '');
  }, [value]);

  const emitIfComplete = (h: number | '', m: number | '', ampm: Meridiem | '') => {
    if (h === '' || m === '' || ampm === '') return;
    onChange(formatTime(h, m, ampm));
  };

  const setPreset = (preset: string) => {
    const p = parseTime(preset);
    if (!p) return;
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
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              setHour('');
              return;
            }
            const h = Math.min(12, Math.max(1, parseInt(raw, 10) || 1));
            setHour(h);
            emitIfComplete(h, minute, meridiem);
          }}
          className="time-input"
          aria-label="Hour"
        />
        <span>:</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={minute === '' ? '' : String(minute).padStart(2, '0')}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
            if (raw === '') {
              setMinute('');
              return;
            }
            const m = Math.min(59, Math.max(0, parseInt(raw, 10) || 0));
            setMinute(m);
            emitIfComplete(hour, m, meridiem);
          }}
          className="time-input"
          aria-label="Minutes"
        />
        <button
          type="button"
          onClick={() => {
            setMeridiem('AM');
            emitIfComplete(hour, minute, 'AM');
          }}
          className={meridiem === 'AM' ? 'ampm active' : 'ampm'}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => {
            setMeridiem('PM');
            emitIfComplete(hour, minute, 'PM');
          }}
          className={meridiem === 'PM' ? 'ampm active' : 'ampm'}
        >
          PM
        </button>
      </div>
    </div>
  );
}
