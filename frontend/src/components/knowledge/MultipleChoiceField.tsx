'use client';

import { useEffect, useMemo, useState } from 'react';

export const OTHER_OPTION_PATTERN = /(other|custom).*(specify)/i;

export function isOtherOption(option: string): boolean {
  return OTHER_OPTION_PATTERN.test(option);
}

interface MultipleChoiceFieldProps {
  slotKey?: string;
  question: string;
  options: string[];
  currentValue?: string;
  onSelect: (value: string) => void;
  /** If true, selecting a standard option saves immediately. Default true. */
  autoSave?: boolean;
}

export function MultipleChoiceField({
  question,
  options,
  currentValue,
  onSelect,
  autoSave = true,
}: MultipleChoiceFieldProps) {
  const otherOption = useMemo(() => options.find(isOtherOption), [options]);

  const resolveSelected = (value?: string): string => {
    if (!value) return '';
    if (options.includes(value)) return value;
    if (otherOption) return otherOption;
    return '';
  };

  const [selected, setSelected] = useState(() => resolveSelected(currentValue));
  const [customText, setCustomText] = useState(() => {
    if (!currentValue) return '';
    if (options.includes(currentValue)) return '';
    return currentValue;
  });

  useEffect(() => {
    setSelected(resolveSelected(currentValue));
    if (currentValue && !options.includes(currentValue)) {
      setCustomText(currentValue);
    } else if (!currentValue) {
      setCustomText('');
    }
  }, [currentValue, options, otherOption]);

  const handleOptionClick = (option: string) => {
    setSelected(option);
    if (isOtherOption(option)) {
      return;
    }
    setCustomText('');
    if (autoSave) {
      onSelect(option);
    }
  };

  const handleCustomSave = () => {
    const trimmed = customText.trim();
    if (trimmed) {
      onSelect(trimmed);
    }
  };

  return (
    <div className="staff-knowledge-field">
      <div className="field-question">{question}</div>
      <div className="mc-options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`mc-option ${selected === option ? 'mc-selected' : ''}`}
            onClick={() => handleOptionClick(option)}
          >
            {option}
          </button>
        ))}
      </div>
      {otherOption && selected === otherOption && (
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
          <input
            className="text-input"
            placeholder="Describe your policy..."
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            className="btn-confirm"
            onClick={handleCustomSave}
            disabled={!customText.trim()}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
