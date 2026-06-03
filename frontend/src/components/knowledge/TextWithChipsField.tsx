'use client';

interface TextWithChipsFieldProps {
  value: string;
  placeholder?: string;
  suggestions?: string[];
  onChange: (value: string) => void;
}

export function TextWithChipsField({
  value,
  placeholder,
  suggestions = [],
  onChange,
}: TextWithChipsFieldProps) {
  return (
    <div>
      {suggestions.length > 0 && (
        <div className="preset-row">
          {suggestions.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`preset ${value === chip ? 'mc-selected' : ''}`}
              onClick={() => onChange(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        className="text-input"
        style={{ width: '100%' }}
        placeholder={placeholder || 'Enter location…'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
