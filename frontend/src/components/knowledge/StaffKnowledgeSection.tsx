'use client';

import { useState } from 'react';
import { MultipleChoiceField } from './MultipleChoiceField';
import type { KnowledgeGap, PropertyFact, Slot } from './types';

interface StaffKnowledgeSectionProps {
  slots: Slot[];
  facts: Record<string, PropertyFact>;
  knowledgeGaps: KnowledgeGap[];
  onPatch: (slotKey: string, status: string, value?: unknown) => Promise<void>;
  onSaveGapAnswer: (gapId: string, question: string, answer: string) => Promise<void>;
}

export function StaffKnowledgeSection({
  slots,
  facts,
  knowledgeGaps,
  onPatch,
  onSaveGapAnswer,
}: StaffKnowledgeSectionProps) {
  const [gapDrafts, setGapDrafts] = useState<Record<string, string>>({});

  const staffSlots = slots
    .filter((s) => s.domain === 'staff')
    .sort((a, b) => (a.tier === 'A' ? -1 : b.tier === 'A' ? 1 : 0));

  const staffKnowledgeCompleted = staffSlots.filter(
    (s) => facts[s.key]?.value != null && facts[s.key]?.value !== ''
  ).length;
  const staffKnowledgeTotal = staffSlots.length;

  return (
    <div className="staff-knowledge-section">
      <div className="section-header">
        <div>
          <div style={{ fontSize: '16px', fontWeight: 500 }}>Staff knowledge</div>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
              marginTop: '2px',
            }}
          >
            Things only your team knows — takes about 3 minutes
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          {staffKnowledgeCompleted} of {staffKnowledgeTotal} answered
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {staffSlots.map((slot) => {
          const fact = facts[slot.key];
          const answered = fact?.value != null && fact?.value !== '';
          return (
            <div
              key={slot.key}
              className={`field-card ${answered ? 'green' : 'empty'}`}
            >
              <div className="field-top">
                <div className="field-label">
                  {slot.label}
                  <span className="tier-pill">Tier {slot.tier}</span>
                </div>
                {answered ? (
                  <span className="badge confirmed">Answered</span>
                ) : (
                  <span className="badge unknown">Not answered</span>
                )}
              </div>
              <MultipleChoiceField
                slotKey={slot.key}
                question={slot.question || slot.label}
                options={slot.options || []}
                currentValue={
                  fact?.value != null ? String(fact.value) : undefined
                }
                onSelect={(value) => onPatch(slot.key, 'verified', value)}
              />
            </div>
          );
        })}
      </div>

      {knowledgeGaps.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div
            style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.75rem' }}
          >
            Guests asked these recently — we had no answer
          </div>
          {knowledgeGaps.map((gap) => (
            <div
              key={gap.id}
              className="field-card empty"
              style={{ marginBottom: '0.75rem' }}
            >
              <div className="field-top">
                <div className="field-label">&ldquo;{gap.question}&rdquo;</div>
                <span className="badge unknown">Asked {gap.count}×</span>
              </div>
              <textarea
                className="text-input"
                style={{ marginTop: '0.5rem', minHeight: '60px', width: '100%' }}
                placeholder="What should Mage tell guests who ask this?"
                value={gapDrafts[gap.id] ?? ''}
                onChange={(e) =>
                  setGapDrafts((prev) => ({ ...prev, [gap.id]: e.target.value }))
                }
                onBlur={(e) => {
                  const answer = e.target.value.trim();
                  if (answer) {
                    void onSaveGapAnswer(gap.id, gap.question, answer);
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
