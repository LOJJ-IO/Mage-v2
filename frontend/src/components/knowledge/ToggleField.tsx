'use client';

interface ToggleFieldProps {
  value: unknown;
  onChange: (value: boolean) => void;
}

export function ToggleField({ value, onChange }: ToggleFieldProps) {
  const boolValue =
    value === true || value === 'true' || value === 'yes' || value === 'Yes';
  const isNo =
    value === false || value === 'false' || value === 'no' || value === 'No';

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
