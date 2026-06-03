'use client';

import { useEffect, useState } from 'react';
import { ToggleField } from './ToggleField';
import { TimeField } from './TimeField';
import { TimeRangeField } from './TimeRangeField';
import { CurrencyField } from './CurrencyField';
import { MultipleChoiceField } from './MultipleChoiceField';
import { TextWithChipsField } from './TextWithChipsField';
import { ToggleThenChoiceField } from './ToggleThenChoiceField';
import {
  formatFactValue,
  getFieldState,
  getTimePresets,
  getTimeRangePresets,
  getWidgetType,
  type PropertyFact,
  type Slot,
} from './types';

const INTERACTIVE_WIDGETS = new Set([
  'multiple_choice',
  'toggle_then_choice',
  'text_with_chips',
]);

interface FieldCardProps {
  slot: Slot;
  fact?: PropertyFact;
  isBranchChild?: boolean;
  onPatch: (slotKey: string, status: string, value?: unknown) => Promise<void>;
  onToggleParent?: (slotKey: string, value: boolean) => Promise<void>;
}

export function FieldCard({
  slot,
  fact,
  isBranchChild,
  onPatch,
  onToggleParent,
}: FieldCardProps) {
  const fieldState = getFieldState(fact);
  const isVerified = fact?.status === 'verified';
  const widgetType = getWidgetType(slot.key, slot);
  const isInteractiveWidget = INTERACTIVE_WIDGETS.has(widgetType);
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(formatFactValue(fact?.value));

  useEffect(() => {
    setDraftValue(formatFactValue(fact?.value));
  }, [fact?.value, slot.key]);

  const visualClass =
    isVerified || fieldState === 'confirmed'
      ? 'green'
      : fieldState === 'verify'
        ? 'yellow'
        : 'empty';

  const badge = isVerified ? (
    <span className="badge confirmed">Confirmed</span>
  ) : fieldState === 'confirmed' ? (
    <span className="badge confirmed">Auto-filled</span>
  ) : fieldState === 'verify' ? (
    <span className="badge verify">Please verify</span>
  ) : (
    <span className="badge unknown">Not found</span>
  );

  const handleConfirm = async (value?: unknown) => {
    await onPatch(slot.key, 'verified', value ?? fact?.value ?? draftValue);
    setEditing(false);
  };

  const handleSkip = async () => {
    await onPatch(slot.key, 'not_applicable');
  };

  const handleChoiceSave = async (value: string) => {
    await onPatch(slot.key, 'verified', value);
    setDraftValue(value);
    setEditing(false);
  };

  const renderWidget = () => {
    const val = draftValue;

    switch (widgetType) {
      case 'multiple_choice':
        return (
          <MultipleChoiceField
            slotKey={slot.key}
            question={slot.question || slot.label}
            options={slot.options || []}
            currentValue={fact?.value != null ? String(fact.value) : undefined}
            onSelect={(v) => void handleChoiceSave(v)}
          />
        );
      case 'toggle_then_choice':
        return (
          <ToggleThenChoiceField
            question={slot.question || slot.label}
            options={slot.options || []}
            currentValue={fact?.value != null ? String(fact.value) : undefined}
            onSave={(v) => void handleChoiceSave(v)}
          />
        );
      case 'text_with_chips':
        return (
          <TextWithChipsField
            value={val}
            placeholder={slot.placeholder}
            suggestions={slot.suggestions}
            onChange={(v) => {
              setDraftValue(v);
              if (fieldState === 'verify' || fieldState === 'empty') {
                void onPatch(slot.key, 'filled', v);
              }
            }}
          />
        );
      case 'toggle':
        return (
          <ToggleField
            value={val}
            onChange={async (v) => {
              if (onToggleParent) {
                await onToggleParent(slot.key, v);
              } else {
                await onPatch(slot.key, 'verified', v);
              }
            }}
          />
        );
      case 'time':
        return (
          <TimeField
            value={val}
            presets={getTimePresets(slot.key)}
            onChange={(v) => {
              setDraftValue(v);
              if (fieldState === 'verify' || fieldState === 'empty') {
                void onPatch(slot.key, 'filled', v);
              }
            }}
          />
        );
      case 'time_range':
        return (
          <TimeRangeField
            value={val}
            presets={getTimeRangePresets(slot.key)}
            onChange={(v) => {
              setDraftValue(v);
              if (fieldState === 'verify' || fieldState === 'empty') {
                void onPatch(slot.key, 'filled', v);
              }
            }}
          />
        );
      case 'currency':
        return (
          <CurrencyField
            value={val}
            onChange={(v) => {
              setDraftValue(String(v));
              if (fieldState === 'verify' || fieldState === 'empty') {
                void onPatch(slot.key, 'filled', v);
              }
            }}
          />
        );
      case 'textarea':
        return (
          <textarea
            className="text-input"
            style={{ minHeight: '72px', width: '100%' }}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            placeholder={`Enter ${slot.label.toLowerCase()}…`}
          />
        );
      case 'phone':
        return (
          <input
            type="tel"
            className="text-input"
            style={{ width: '100%' }}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            placeholder="(555) 123-4567"
          />
        );
      default:
        return (
          <input
            type="text"
            className="text-input"
            style={{ width: '100%' }}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            placeholder={slot.placeholder || `Enter ${slot.label.toLowerCase()}…`}
          />
        );
    }
  };

  const showInlineWidget =
    fieldState === 'empty' || fieldState === 'verify' || editing;

  const showStandardActions = !isInteractiveWidget || widgetType === 'text_with_chips';

  return (
    <div className={`field-card ${visualClass}${isBranchChild ? ' branch-child' : ''}`}>
      <div className="field-top">
        <div className="field-label">
          {slot.label}
          {slot.tier && <span className="tier-pill">Tier {slot.tier}</span>}
        </div>
        {badge}
      </div>

      {fieldState === 'confirmed' && !showInlineWidget && (
        <div className="field-value">{formatFactValue(fact?.value)}</div>
      )}

      {fact?.source_url && (
        <a
          href={fact.source_url}
          target="_blank"
          rel="noreferrer"
          className="field-source"
          title={fact.source_url}
        >
          Source: {fact.source_url}
        </a>
      )}

      {showInlineWidget && renderWidget()}

      {showStandardActions && (
        <div className="field-actions">
          {fieldState === 'confirmed' && !isVerified && !isInteractiveWidget && (
            <>
              <button type="button" className="btn-confirm" onClick={() => handleConfirm()}>
                Confirm
              </button>
              <button type="button" className="btn-edit" onClick={() => setEditing(true)}>
                Edit
              </button>
            </>
          )}
          {fieldState === 'confirmed' && !isVerified && isInteractiveWidget && !showInlineWidget && (
            <>
              <button type="button" className="btn-confirm" onClick={() => handleConfirm()}>
                Confirm
              </button>
              <button type="button" className="btn-edit" onClick={() => setEditing(true)}>
                Edit
              </button>
            </>
          )}
          {isVerified && !showInlineWidget && (
            <button type="button" className="btn-edit" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {fieldState === 'verify' && !isInteractiveWidget && (
            <button
              type="button"
              className="btn-confirm"
              onClick={() => handleConfirm(draftValue)}
            >
              Confirm
            </button>
          )}
          {fieldState === 'empty' && (
            <>
              <button
                type="button"
                className="btn-confirm"
                onClick={() => handleConfirm(draftValue)}
              >
                Save
              </button>
              <button type="button" className="skip-link" onClick={handleSkip}>
                Skip
              </button>
            </>
          )}
          {showInlineWidget && fieldState === 'confirmed' && !isInteractiveWidget && (
            <>
              <button
                type="button"
                className="btn-confirm"
                onClick={() => handleConfirm(draftValue)}
              >
                Save & verify
              </button>
              <button type="button" className="btn-edit" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          )}
          {widgetType === 'text_with_chips' && fieldState !== 'empty' && !isVerified && (
            <button
              type="button"
              className="btn-confirm"
              onClick={() => handleConfirm(draftValue)}
            >
              Confirm
            </button>
          )}
        </div>
      )}

      {isInteractiveWidget && isVerified && showInlineWidget && (
        <div className="field-actions">
          <button type="button" className="btn-edit" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
