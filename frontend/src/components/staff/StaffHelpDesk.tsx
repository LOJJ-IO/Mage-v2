'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatFactValue,
  type PropertyFact,
  type Slot,
} from '@/components/knowledge';
import '@/components/staff/helpDesk.css';
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

interface StaffHelpDeskProps {
  staffKey: string;
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

export function StaffHelpDesk({ staffKey }: StaffHelpDeskProps) {
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
