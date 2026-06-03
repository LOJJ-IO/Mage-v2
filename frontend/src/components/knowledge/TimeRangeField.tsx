'use client';

interface TimeRangeFieldProps {
  value: unknown;
  presets: string[];
  onChange: (value: string) => void;
  /** Presets that save directly without showing the free-text input */
  appointmentOnlyPresets?: string[];
}

export function TimeRangeField({
  value,
  presets,
  onChange,
  appointmentOnlyPresets = ['By appointment only'],
}: TimeRangeFieldProps) {
  const strValue = value != null ? String(value) : '';
  const isAppointmentOnly = appointmentOnlyPresets.some(
    (p) => strValue.toLowerCase() === p.toLowerCase()
  );

  return (
    <div>
      <div className="preset-row">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`preset ${strValue === p ? 'mc-selected' : ''}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
      </div>
      {!isAppointmentOnly && (
        <input
          type="text"
          className="text-input"
          style={{ marginTop: '0.5rem', width: '100%' }}
          placeholder="e.g. 6AM–9PM or 24hrs"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
