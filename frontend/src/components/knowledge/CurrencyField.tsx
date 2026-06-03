'use client';

interface CurrencyFieldProps {
  value: unknown;
  suffix?: string;
  onChange: (value: number) => void;
}

export function CurrencyField({ value, suffix = '/night', onChange }: CurrencyFieldProps) {
  const amount =
    typeof value === 'number'
      ? value
      : parseInt(String(value || '').replace(/[^0-9]/g, ''), 10) || 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span>$</span>
      <input
        type="number"
        min={0}
        step={1}
        value={amount}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="time-input"
        style={{ width: '64px' }}
      />
      <span style={{ color: 'var(--color-text-secondary)' }}>{suffix}</span>
    </div>
  );
}
