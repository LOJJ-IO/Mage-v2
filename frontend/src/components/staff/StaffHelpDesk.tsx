'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatFactValue,
  type PropertyFact,
  type Slot,
} from '@/components/knowledge';
import '@/components/staff/helpDesk.css';
import { apiClient, type TaskAssistMessage } from '@/lib/api';
import type { StaffAction } from '@/types';
import {
  buildCategoryCards,
  buildHelpDeskNav,
  findSlotSection,
  findSlotSubsection,
  getTrendingSlots,
  slotSearchText,
  type HelpDeskNavSection,
  type HelpDeskSelection,
} from '@/components/staff/helpDeskNav';
import { useMediaQuery } from '@/hooks/useResizableWidth';

const DEFAULT_PROPERTY_ID = process.env.NEXT_PUBLIC_PROPERTY_ID || 'grand-horizon';

function buildPrefill(action: StaffAction): string {
  const type = action.actionType.toUpperCase();
  const guest = action.guestName ?? 'Guest';
  const room = action.roomNumber ? `· Room ${action.roomNumber} ` : '';
  return `[${type}] ${guest} ${room}· ${action.status}\n"${action.sourceMessage}"\n\nNotes: `;
}

function TaskAssistMode({
  staffKey,
  actionId,
  onBack,
}: {
  staffKey: string;
  actionId: string;
  onBack?: () => void;
}) {
  const [action, setAction] = useState<StaffAction | null>(null);
  const [messages, setMessages] = useState<TaskAssistMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError(null);
      const [actionRes, threadRes] = await Promise.all([
        fetch(`/api/staff/actions/${encodeURIComponent(actionId)}`, {
          headers: { 'X-Staff-Key': staffKey },
        }),
        apiClient.getTaskAssistThread(staffKey, actionId),
      ]);
      if (cancelled) return;
      if (actionRes.ok) {
        const raw = (await actionRes.json()) as Record<string, unknown>;
        setAction({
          id: String(raw.id),
          guestId: String(raw.guest_id),
          actionType: String(raw.action_type) as StaffAction['actionType'],
          summary: String(raw.summary),
          sourceMessage: String(raw.source_message),
          status: String(raw.status) as StaffAction['status'],
          createdAt: String(raw.created_at),
          guestName: raw.guest_name ? String(raw.guest_name) : undefined,
          roomNumber: raw.room_number ? String(raw.room_number) : undefined,
          escalationType: String(raw.escalation_type ?? 'normal') as StaffAction['escalationType'],
          allowStaffJumpIn: Boolean(raw.allow_staff_jump_in ?? true),
          guestConversationThreadId: raw.guest_conversation_thread_id
            ? String(raw.guest_conversation_thread_id)
            : undefined,
        } satisfies StaffAction);

        if (threadRes.success && threadRes.data && threadRes.data.messages.length > 0) {
          setMessages(threadRes.data.messages);
          setDraft('');
        } else {
          const prefill = buildPrefill({
            id: String(raw.id),
            guestId: String(raw.guest_id),
            actionType: String(raw.action_type) as StaffAction['actionType'],
            summary: String(raw.summary),
            sourceMessage: String(raw.source_message),
            status: String(raw.status) as StaffAction['status'],
            createdAt: String(raw.created_at),
            guestName: raw.guest_name ? String(raw.guest_name) : undefined,
            roomNumber: raw.room_number ? String(raw.room_number) : undefined,
            escalationType: String(raw.escalation_type ?? 'normal') as StaffAction['escalationType'],
            allowStaffJumpIn: Boolean(raw.allow_staff_jump_in ?? true),
          } satisfies StaffAction);
          setDraft(prefill);
        }
      } else {
        setLoadError('Could not load task details.');
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [staffKey, actionId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const result = await apiClient.sendTaskAssistMessage(staffKey, actionId, text);
    setSending(false);
    if (result.success && result.data) {
      setMessages(result.data.messages);
      setDraft('');
    }
  };

  return (
    <div className="help-desk staff-ui" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="help-desk-topbar" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: 'var(--neutral-500, #737373)',
              whiteSpace: 'nowrap',
            }}
          >
            ← Back
          </button>
        )}
        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
          <span aria-hidden style={{ marginRight: '0.25rem' }}>✦</span>Help desk — Task assist
        </span>
      </header>

      {loadError ? (
        <div style={{ padding: '2rem', color: '#ef4444' }}>{loadError}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {action && (
            <div
              style={{
                padding: '0.75rem 1.25rem',
                borderBottom: '1px solid var(--neutral-200, #e5e5e5)',
                background: 'var(--neutral-50, #fafafa)',
                fontSize: '0.8125rem',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  background: '#dbeafe',
                  color: '#1e40af',
                  borderRadius: '9999px',
                  padding: '0.125rem 0.625rem',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  marginRight: '0.5rem',
                }}
              >
                {action.actionType}
              </span>
              {action.guestName && <span style={{ fontWeight: 500 }}>{action.guestName}</span>}
              {action.roomNumber && <span style={{ color: '#737373' }}> · Room {action.roomNumber}</span>}
              <span
                style={{
                  marginLeft: '0.5rem',
                  color: '#737373',
                  fontSize: '0.75rem',
                  textTransform: 'capitalize',
                }}
              >
                {action.status}
              </span>
              <p
                style={{
                  marginTop: '0.375rem',
                  color: '#525252',
                  fontStyle: 'italic',
                  borderLeft: '2px solid #e5e7eb',
                  paddingLeft: '0.625rem',
                }}
              >
                &ldquo;{action.sourceMessage}&rdquo;
              </p>
            </div>
          )}

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {messages.length === 0 && !action && (
              <p style={{ color: '#737373', fontSize: '0.875rem' }}>Loading…</p>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '78%',
                    borderRadius: '0.75rem',
                    padding: '0.625rem 0.875rem',
                    fontSize: '0.875rem',
                    lineHeight: 1.55,
                    background: msg.role === 'user' ? '#1d4ed8' : '#f3f4f6',
                    color: msg.role === 'user' ? '#fff' : '#171717',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.role === 'assistant' && (
                    <p style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.25rem' }}>
                      ✦ Assistant
                    </p>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={threadEndRef} />
          </div>

          <div className="help-desk-assistant-footer" style={{ padding: '0.875rem 1.25rem' }}>
            <div className="help-desk-assistant-input-wrap">
              <textarea
                className="help-desk-assistant-input"
                rows={3}
                placeholder="Describe the task or add notes…"
                value={draft}
                disabled={sending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type="button"
                className="help-desk-assistant-send"
                disabled={!draft.trim() || sending}
                onClick={() => void handleSend()}
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StaffHelpDeskProps {
  staffKey: string;
  taskActionId?: string;
  onBackToTask?: () => void;
}

function staffFetch(path: string, staffKey: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Key': staffKey,
      ...(init?.headers || {}),
    },
  });
}

function getSlotAnswer(fact: PropertyFact | undefined): string | null {
  if (!fact || fact.status === 'unknown') return null;
  if (fact.value == null || fact.value === '') return null;
  return formatFactValue(fact.value);
}

export function StaffHelpDesk({ staffKey, taskActionId, onBackToTask }: StaffHelpDeskProps) {
  if (taskActionId) {
    return <TaskAssistMode staffKey={staffKey} actionId={taskActionId} onBack={onBackToTask} />;
  }
  return <StaffHelpDeskBrowse staffKey={staffKey} />;
}

function StaffHelpDeskBrowse({ staffKey }: { staffKey: string }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [facts, setFacts] = useState<Record<string, PropertyFact>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<HelpDeskSelection>({ type: 'home' });
  const [expandedSubsections, setExpandedSubsections] = useState<Set<string>>(new Set());
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [assistantDraft, setAssistantDraft] = useState('');

  const isWide = useMediaQuery('(min-width: 1101px)');

  const loadData = useCallback(async () => {
    if (!staffKey.trim()) return;
    setLoading(true);
    try {
      const [schemaRes, factsRes] = await Promise.all([
        staffFetch('/api/staff/knowledge/schema', staffKey),
        staffFetch(
          `/api/staff/knowledge/facts/${encodeURIComponent(DEFAULT_PROPERTY_ID)}`,
          staffKey
        ),
      ]);
      if (schemaRes.ok) {
        const schema = await schemaRes.json();
        setSlots(schema.slots || []);
      }
      if (factsRes.ok) {
        const data = await factsRes.json();
        setFacts(data.facts || {});
      }
    } finally {
      setLoading(false);
    }
  }, [staffKey]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const nav = useMemo(() => buildHelpDeskNav(slots, facts), [slots, facts]);
  const slotByKey = useMemo(() => new Map(slots.map((slot) => [slot.key, slot])), [slots]);
  const categoryCards = useMemo(() => buildCategoryCards(nav, facts), [nav, facts]);
  const trendingSlots = useMemo(
    () => getTrendingSlots(slots, facts),
    [slots, facts]
  );

  const propertyName =
    formatFactValue(facts['property.name']?.value) || 'Property help desk';

  useEffect(() => {
    const defaults = new Set<string>();
    for (const section of nav) {
      section.subsections.slice(0, 2).forEach((sub) => defaults.add(sub.id));
    }
    setExpandedSubsections(defaults);
  }, [nav]);

  const searchMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return slots
      .map((slot) => {
        const section = findSlotSection(nav, slot.key);
        return { slot, section };
      })
      .filter(({ slot, section }) => {
        const fact = facts[slot.key];
        return slotSearchText(slot, fact, section?.label).includes(q);
      })
      .slice(0, 12);
  }, [query, slots, facts, nav]);

  const activeSlotKey =
    selection.type === 'slot' ? selection.slotKey : null;

  const activeSection =
    selection.type === 'section'
      ? nav.find((s) => s.id === selection.sectionId)
      : selection.type === 'subsection'
        ? nav.find((s) => s.id === selection.sectionId)
        : activeSlotKey
          ? findSlotSection(nav, activeSlotKey)
          : undefined;

  const activeSubsection =
    selection.type === 'subsection' && activeSection
      ? activeSection.subsections.find((s) => s.id === selection.subsectionId)
      : activeSlotKey && activeSection
        ? findSlotSubsection(activeSection, activeSlotKey)
        : undefined;

  const activeSlot = activeSlotKey ? slotByKey.get(activeSlotKey) : undefined;

  const toggleSubsection = (id: string) => {
    setExpandedSubsections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op
    }
  };

  const renderNav = () => (
    <aside className="help-desk-sidebar" aria-label="Help desk navigation">
      <div className="help-desk-sidebar-section">
        <button
          type="button"
          className={`help-desk-nav-item home-link${selection.type === 'home' ? ' active' : ''}`}
          onClick={() => setSelection({ type: 'home' })}
        >
          Overview
        </button>
      </div>

      {nav.map((section) => (
        <div key={section.id} className="help-desk-sidebar-section">
          <button
            type="button"
            className={`help-desk-sidebar-heading help-desk-sidebar-heading-btn${
              selection.type === 'section' && selection.sectionId === section.id ? ' active' : ''
            }`}
            onClick={() => setSelection({ type: 'section', sectionId: section.id })}
          >
            {section.label}
          </button>

          {section.subsections.map((subsection) => {
            const expanded = expandedSubsections.has(subsection.id);
            return (
              <div key={subsection.id}>
                <button
                  type="button"
                  className="help-desk-nav-subsection-label"
                  onClick={() => {
                    toggleSubsection(subsection.id);
                    setSelection({
                      type: 'subsection',
                      sectionId: section.id,
                      subsectionId: subsection.id,
                    });
                  }}
                >
                  {expanded ? '▾' : '▸'} {subsection.label}
                </button>
                {expanded &&
                  subsection.slotKeys.map((slotKey) => {
                    const slot = slotByKey.get(slotKey);
                    if (!slot) return null;
                    return (
                      <button
                        key={slotKey}
                        type="button"
                        className={`help-desk-nav-subitem${
                          activeSlotKey === slotKey ? ' active' : ''
                        }`}
                        onClick={() => setSelection({ type: 'slot', slotKey })}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );

  const renderHome = () => (
    <div className="help-desk-main-inner">
      <h1 className="help-desk-home-title">How can we help 👋</h1>
      <p className="help-desk-home-subtitle">
        Browse {propertyName} knowledge — the same sections and fields from knowledge onboarding,
        ready for front desk.
      </p>

      <div className="help-desk-category-grid">
        {categoryCards.map((card) => (
          <button
            key={card.sectionId}
            type="button"
            className="help-desk-category-card"
            onClick={() => setSelection({ type: 'section', sectionId: card.sectionId })}
          >
            <h3>{card.label}</h3>
            <p>{card.description}</p>
            <span className="help-desk-category-meta">
              {card.filledCount} of {card.totalCount} answers filled
            </span>
          </button>
        ))}
      </div>

      {trendingSlots.length > 0 && (
        <div className="help-desk-trending">
          <h2>Trending answers</h2>
          <div className="help-desk-trending-list">
            {trendingSlots.map((slot) => (
              <button
                key={slot.key}
                type="button"
                className="help-desk-trending-item"
                onClick={() => setSelection({ type: 'slot', slotKey: slot.key })}
              >
                <span>{slot.label}</span>
                <span className="help-desk-nav-chevron">›</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderSlotArticle = (slot: Slot, section?: HelpDeskNavSection) => {
    const answer = getSlotAnswer(facts[slot.key]);
    const kicker = section?.label || slot.domain.replace(/_/g, ' ');

    return (
      <div className="help-desk-main-inner">
        <p className="help-desk-article-kicker">{kicker}</p>
        <h1 className="help-desk-article-title">{slot.label}</h1>
        {answer ? (
          <>
            <p className="help-desk-article-body">{answer}</p>
            <button
              type="button"
              className="help-desk-copy-btn"
              onClick={() => void handleCopy(answer)}
            >
              Copy answer
            </button>
          </>
        ) : (
          <>
            <div className="help-desk-info-callout">
              <span aria-hidden>ℹ</span>
              <span>
                This field has not been filled yet. Add it in Knowledge onboarding so guests and
                staff get a consistent answer.
              </span>
            </div>
            <p className="help-desk-article-empty">No answer published for this topic yet.</p>
          </>
        )}
      </div>
    );
  };

  const renderSectionOverview = (section: HelpDeskNavSection) => {
    const slotsToShow =
      selection.type === 'subsection' && activeSubsection
        ? activeSubsection.slotKeys
            .map((key) => slotByKey.get(key))
            .filter((slot): slot is Slot => !!slot)
        : section.slotKeys
            .map((key) => slotByKey.get(key))
            .filter((slot): slot is Slot => !!slot);

    return (
      <div className="help-desk-main-inner">
        <div className="help-desk-section-overview">
          <p className="help-desk-article-kicker">{section.label}</p>
          <h2>
            {activeSubsection ? activeSubsection.label : section.label}
          </h2>
          <p>{section.description}</p>
        </div>

        <div className="help-desk-answer-list">
          {slotsToShow.map((slot) => {
            const answer = getSlotAnswer(facts[slot.key]);
            return (
              <button
                key={slot.key}
                type="button"
                className="help-desk-answer-block"
                onClick={() => setSelection({ type: 'slot', slotKey: slot.key })}
                style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <h3>{slot.label}</h3>
                <p>{answer || 'Not configured yet'}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMain = () => {
    if (loading) {
      return <div className="help-desk-loading">Loading property knowledge…</div>;
    }

    if (query.trim() && searchMatches.length > 0) {
      return (
        <div className="help-desk-main-inner">
          <h2 className="help-desk-home-title" style={{ fontSize: '1.25rem' }}>
            Search results
          </h2>
          <div className="help-desk-trending-list" style={{ marginTop: '1rem' }}>
            {searchMatches.map(({ slot, section }) => {
              const answer = getSlotAnswer(facts[slot.key]);
              return (
                <button
                  key={slot.key}
                  type="button"
                  className="help-desk-answer-block"
                  onClick={() => {
                    setQuery('');
                    setSelection({ type: 'slot', slotKey: slot.key });
                  }}
                  style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  <p className="help-desk-article-kicker" style={{ marginBottom: '0.25rem' }}>
                    {section?.label}
                  </p>
                  <h3>{slot.label}</h3>
                  <p>{answer || 'Not configured yet'}</p>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (query.trim() && searchMatches.length === 0) {
      return (
        <div className="help-desk-search-empty">
          No matches for &ldquo;{query}&rdquo;. Try Wi-Fi, check-in, or pool.
        </div>
      );
    }

    if (selection.type === 'home') return renderHome();
    if (activeSlot) return renderSlotArticle(activeSlot, activeSection);
    if (activeSection) return renderSectionOverview(activeSection);
    return renderHome();
  };

  const renderAssistant = () => {
    if (!isWide) return null;

    if (!assistantOpen) {
      return (
        <div className="help-desk-assistant-collapsed">
          <button
            type="button"
            className="help-desk-assistant-open-btn"
            aria-label="Open assistant"
            onClick={() => setAssistantOpen(true)}
          >
            ✦
          </button>
        </div>
      );
    }

    return (
      <aside className="help-desk-assistant" aria-label="Assistant">
        <div className="help-desk-assistant-header">
          <span>Assistant</span>
          <button
            type="button"
            className="help-desk-assistant-close"
            aria-label="Close assistant"
            onClick={() => setAssistantOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="help-desk-assistant-body">
          <div className="help-desk-assistant-sparkle" aria-hidden>
            ✦
          </div>
          <p>
            Good morning — I&apos;m here to help. Ask me anything about {propertyName}.
          </p>
        </div>
        <div className="help-desk-assistant-footer">
          <div className="help-desk-assistant-input-wrap">
            <textarea
              className="help-desk-assistant-input"
              rows={2}
              placeholder="Ask, search, or explain…"
              value={assistantDraft}
              onChange={(e) => setAssistantDraft(e.target.value)}
            />
            <button type="button" className="help-desk-assistant-send" disabled>
              Send
            </button>
          </div>
        </div>
      </aside>
    );
  };

  return (
    <div className="help-desk staff-ui">
      <header className="help-desk-topbar">
        <div className="help-desk-search-wrap">
          <input
            type="search"
            className="help-desk-search"
            placeholder="Search or ask AI"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search help desk"
          />
          <span className="help-desk-search-kbd" aria-hidden>
            ⌘ K
          </span>
        </div>
        <button
          type="button"
          className="help-desk-ask-ai"
          onClick={() => isWide && setAssistantOpen(true)}
        >
          <span aria-hidden>✦</span> Ask AI
        </button>
      </header>

      <div className="help-desk-body">
        {renderNav()}
        <main className="help-desk-main">{renderMain()}</main>
        {renderAssistant()}
      </div>
    </div>
  );
}
