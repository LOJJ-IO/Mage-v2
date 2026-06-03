'use client';

import { useMemo, useState } from 'react';
import { ToggleField } from './ToggleField';
import { MultipleChoiceField } from './MultipleChoiceField';

const NOT_AVAILABLE = 'Not available';

interface ToggleThenChoiceFieldProps {
  question?: string;
  options: string[];
  currentValue?: string;
  onSave: (value: string) => void;
}

function isNoValue(value?: string): boolean {
  if (!value) return true;
  return (
    value === NOT_AVAILABLE ||
    value === 'false' ||
    value === 'no' ||
    value === 'No'
  );
}

export function ToggleThenChoiceField({
  question,
  options,
  currentValue,
  onSave,
}: ToggleThenChoiceFieldProps) {
  const hasYesAnswer = useMemo(
    () => Boolean(currentValue && !isNoValue(currentValue)),
    [currentValue]
  );

  const [showChoices, setShowChoices] = useState(hasYesAnswer);

  return (
    <div>
      <ToggleField
        value={hasYesAnswer ? true : isNoValue(currentValue) && currentValue ? false : undefined}
        onChange={(yes) => {
          if (yes) {
            setShowChoices(true);
          } else {
            setShowChoices(false);
            onSave(NOT_AVAILABLE);
          }
        }}
      />
      {(showChoices || hasYesAnswer) && (
        <div style={{ marginTop: '0.75rem' }}>
          <MultipleChoiceField
            question={question || 'Select an option...'}
            options={options}
            currentValue={hasYesAnswer ? currentValue : undefined}
            onSelect={onSave}
          />
        </div>
      )}
    </div>
  );
}
