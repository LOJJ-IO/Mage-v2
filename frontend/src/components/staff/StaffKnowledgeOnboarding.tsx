'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconUpload } from '@tabler/icons-react';
import {
  AnimatedNumber,
  BRANCH_CHILDREN,
  CrawlStatusFloat,
  FieldCard,
  getFieldState,
  isBranchHidden,
  isCoreSlot,
  isFieldComplete,
  OnboardingCrawlPanel,
  OnboardingThemeToggle,
  ProgressBar,
  sortSlotsForDisplay,
  StaffKnowledgeSection,
  type KnowledgeGap,
  type PropertyFact,
  type Slot,
  type UrlField,
} from '@/components/knowledge';
import type { BookingSuggest } from '@/components/knowledge/onboardingTypes';
import '@/components/knowledge/onboarding.css';
import { StaffModuleBody, StaffPageHeader } from './StaffPageHeader';
import { StaffNavIcon } from './StaffNavIcon';

const DEFAULT_PROPERTY_ID = process.env.NEXT_PUBLIC_PROPERTY_ID || 'grand-horizon';

interface StaffKnowledgeOnboardingProps {
  staffKey: string;
  embedded?: boolean;
}

type Completeness = {
  A: { filled: number; total: number; percent: number };
  B: { filled: number; total: number; percent: number };
};

type CrawlJob = {
  id: string;
  property_id?: string;
  seed_url: string;
  seed_urls?: string[];
  status: string;
  pages_discovered?: number;
  pages_extracted?: number;
  facts_merged?: number;
  error_message?: string;
  booking_augment?: {
    added?: string | null;
    search_url?: string | null;
    search_query?: string | null;
    source?: string | null;
    verified?: boolean;
  };
  gap_report?: {
    tier_a_missing?: string[];
    tier_b_missing?: string[];
    conflicts?: string[];
  };
};

function pathPrefixFromUrl(input: string): string {
  const pageSegments = new Set([
    'amenities', 'about-amenities', 'dining', 'restaurant', 'breakfast', 'faq', 'faqs',
    'pool', 'fitness', 'gym', 'parking', 'policies', 'contact', 'contact-us',
    'contact-location', 'location', 'directions', 'overview', 'gallery', 'photos',
    'rooms', 'suites', 'rates', 'offers', 'specials', 'accessibility', 'events',
    'meetings', 'weddings', 'spa', 'bar', 'lounge',
  ]);
  try {
    const url = input.includes('://') ? input : `https://${input}`;
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    if (!segments.length) return '';
    if (pageSegments.has(segments[segments.length - 1].toLowerCase())) {
      segments.pop();
    }
    return segments.length ? `/${segments.join('/')}` : '';
  } catch {
    return '';
  }
}

function propertyIdFromUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return 'pilot-hotel';
  try {
    const url = raw.includes('://') ? raw : `https://${raw}`;
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    const hostSlug = host.replace(/\./g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const prefix = pathPrefixFromUrl(url);
    if (prefix) {
      const pathSlug = prefix
        .split('/')
        .filter(Boolean)
        .map((s) => s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
        .filter(Boolean)
        .join('-');
      const combined = [hostSlug, pathSlug].filter(Boolean).join('-');
      return combined.slice(0, 64) || 'pilot-hotel';
    }
    return hostSlug.slice(0, 64) || 'pilot-hotel';
  } catch {
    return 'pilot-hotel';
  }
}

function normalizeSeedUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  return raw.includes('://') ? raw : `https://${raw}`;
}

function parseSeedUrls(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of input.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    const url = normalizeSeedUrl(raw);
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function newUrlField(value = ''): UrlField {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `url-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return { id, value };
}

function collectSeedUrlsFromFields(fields: UrlField[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of fields) {
    const url = normalizeSeedUrl(field.value);
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function staffFetch(path: string, staffKey: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Key': staffKey,
      ...(init?.headers as Record<string, string>),
    },
  });
}

export function StaffKnowledgeOnboarding({
  staffKey,
  embedded = false,
}: StaffKnowledgeOnboardingProps) {
  const [propertyId, setPropertyId] = useState(DEFAULT_PROPERTY_ID);
  const [propertyIdLocked, setPropertyIdLocked] = useState(false);
  const [crawlUrlFields, setCrawlUrlFields] = useState<UrlField[]>(() => [
    newUrlField(),
    newUrlField(),
  ]);
  const [bookingHint, setBookingHint] = useState<BookingSuggest | null>(null);
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [facts, setFacts] = useState<Record<string, PropertyFact>>({});
  const [completeness, setCompleteness] = useState<Completeness | null>(null);
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([]);
  const [message, setMessage] = useState('');
  const [crawlJustCompleted, setCrawlJustCompleted] = useState(false);
  const [lastCrawlFactsMerged, setLastCrawlFactsMerged] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staffKnowledgeRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const scrollToSection = (key: string) => {
    const el =
      key === 'staff'
        ? staffKnowledgeRef.current
        : key === 'details'
          ? sectionRefs.current.details
          : sectionRefs.current[key];
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderFieldGrid = (sectionSlots: Slot[]) => (
    <ul className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
      {sectionSlots.map((slot) => (
        <li key={slot.key}>
          <FieldCard
            slot={slot}
            fact={facts[slot.key]}
            isBranchChild={isBranchChild(slot.key)}
            onPatch={patchFact}
            onToggleParent={BRANCH_CHILDREN[slot.key] ? handleToggleParent : undefined}
          />
        </li>
      ))}
    </ul>
  );

  const structuredSlots = useMemo(
    () => slots.filter((s) => s.domain !== 'staff'),
    [slots]
  );

  const visibleStructuredSlots = useMemo(
    () => structuredSlots.filter((s) => !isBranchHidden(s.key, facts)),
    [structuredSlots, facts]
  );

  const coreSlotsByDomain = useMemo(() => {
    const core = structuredSlots.filter(isCoreSlot);
    const order = ['property', 'amenities', 'dining'] as const;
    return order
      .map((domain) => ({
        domain,
        slots: sortSlotsForDisplay(
          core.filter((s) => s.domain === domain && !isBranchHidden(s.key, facts))
        ),
      }))
      .filter((section) => section.slots.length > 0);
  }, [structuredSlots, facts]);

  const detailSlots = useMemo(
    () =>
      sortSlotsForDisplay(
        structuredSlots.filter(
          (s) => !isCoreSlot(s) && !isBranchHidden(s.key, facts)
        )
      ),
    [structuredSlots, facts]
  );

  const navSections = useMemo(
    () => [
      ...coreSlotsByDomain.map((s) => ({ id: s.domain, label: s.domain.replace(/_/g, ' ') })),
      ...(detailSlots.length
        ? [{ id: 'details', label: 'Additional details' }]
        : []),
      { id: 'staff', label: 'Staff knowledge' },
    ],
    [coreSlotsByDomain, detailSlots.length]
  );

  const progressStats = useMemo(() => {
    let tierAConfirmed = 0;
    let tierATotal = 0;
    let tierBConfirmed = 0;
    let tierBTotal = 0;
    let autoFilledCount = 0;
    let needsVerifyCount = 0;

    for (const slot of visibleStructuredSlots) {
      const fact = facts[slot.key];
      const complete = isFieldComplete(fact);
      if (slot.tier === 'A') {
        tierATotal += 1;
        if (complete) tierAConfirmed += 1;
      } else if (slot.tier === 'B') {
        tierBTotal += 1;
        if (complete) tierBConfirmed += 1;
      }
      const state = getFieldState(fact);
      if (state === 'confirmed' && fact?.status !== 'verified') {
        autoFilledCount += 1;
      } else if (state === 'verify' && fact?.status !== 'verified') {
        needsVerifyCount += 1;
      }
    }

    return {
      tierAConfirmed,
      tierATotal,
      tierBConfirmed,
      tierBTotal,
      autoFilledCount,
      needsVerifyCount,
    };
  }, [visibleStructuredSlots, facts]);

  const hasCrawlRun = useMemo(
    () =>
      crawling ||
      crawlJob != null ||
      crawlJustCompleted ||
      lastCrawlFactsMerged > 0,
    [crawling, crawlJob, crawlJustCompleted, lastCrawlFactsMerged]
  );

  const loadFacts = useCallback(async (key: string, pid: string) => {
    const res = await staffFetch(`/api/staff/knowledge/facts/${encodeURIComponent(pid)}`, key);
    if (!res.ok) return;
    const data = await res.json();
    setFacts(data.facts || {});
    setCompleteness(data.completeness || null);
  }, []);

  const loadKnowledgeGaps = useCallback(async (key: string, pid: string) => {
    const res = await staffFetch(
      `/api/staff/knowledge/gaps/${encodeURIComponent(pid)}`,
      key
    );
    if (!res.ok) {
      setKnowledgeGaps([]);
      return;
    }
    const data = await res.json();
    setKnowledgeGaps(data.gaps || []);
  }, []);

  const loadOnboardingData = useCallback(
    async (key: string, pid: string) => {
      const schemaRes = await staffFetch('/api/staff/knowledge/schema', key);
      if (schemaRes.ok) {
        const schema = await schemaRes.json();
        setSlots(schema.slots || []);
      } else {
        setSlots([]);
      }
      await loadFacts(key, pid);
      await loadKnowledgeGaps(key, pid);
    },
    [loadFacts, loadKnowledgeGaps]
  );

  useEffect(() => {
    const key = staffKey.trim();
    if (!key) return;
    void loadOnboardingData(key, propertyId);
  }, [staffKey, propertyId, loadOnboardingData]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollCrawlJob = (jobId: string, pid: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const res = await staffFetch(`/api/staff/knowledge/crawl/${jobId}`, staffKey);
      if (!res.ok) return;
      const job: CrawlJob = await res.json();
      setCrawlJob(job);
      if (job.status === 'completed') {
        stopPolling();
        setCrawling(false);
        if (job.property_id) setPropertyId(job.property_id);
        await loadFacts(staffKey, job.property_id || pid);
        await loadKnowledgeGaps(staffKey, job.property_id || pid);
        const merged = job.facts_merged ?? 0;
        const pages = job.pages_discovered ?? 0;
        setLastCrawlFactsMerged(merged);
        setCrawlJustCompleted(true);
        setMessage(
          `Finished — ${pages} pages read, ${merged} fields filled. Review below, then tap Update info.`
        );
      } else if (job.status === 'failed') {
        stopPolling();
        setCrawling(false);
        setMessage(job.error_message || 'Could not load website(s) info.');
      }
    }, 2000);
  };

  const patchFact = async (slotKey: string, status: string, value?: unknown) => {
    const res = await staffFetch(
      `/api/staff/knowledge/facts/${encodeURIComponent(propertyId)}/${encodeURIComponent(slotKey)}`,
      staffKey,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          value: value !== undefined ? value : facts[slotKey]?.value,
        }),
      }
    );
    if (res.ok) {
      await loadFacts(staffKey, propertyId);
    }
  };

  const handleToggleParent = async (slotKey: string, value: boolean) => {
    await patchFact(slotKey, 'verified', value);
    if (!value) {
      const children = BRANCH_CHILDREN[slotKey] || [];
      await Promise.all(
        children.map((child) => patchFact(child, 'not_applicable'))
      );
    }
  };

  const confirmAllInSection = async (sectionSlots: Slot[]) => {
    const greenFacts = sectionSlots
      .filter((s) => getFieldState(facts[s.key]) === 'confirmed')
      .filter((s) => facts[s.key]?.status !== 'verified');

    await Promise.all(
      greenFacts.map((s) =>
        patchFact(s.key, 'verified', facts[s.key]?.value)
      )
    );
    if (greenFacts.length) {
      setMessage(`Confirmed ${greenFacts.length} auto-filled fields.`);
    }
  };

  const saveKnowledgeGapAnswer = async (
    gapId: string,
    question: string,
    answer: string
  ) => {
    const res = await staffFetch(
      `/api/staff/knowledge/gaps/${encodeURIComponent(propertyId)}/answer`,
      staffKey,
      {
        method: 'POST',
        body: JSON.stringify({ gap_id: gapId, question, answer }),
      }
    );
    if (res.ok) {
      setMessage('Saved answer for guest question.');
    }
  };

  const publish = async () => {
    const res = await staffFetch(
      `/api/staff/knowledge/publish/${encodeURIComponent(propertyId)}`,
      staffKey,
      { method: 'POST' }
    );
    if (res.ok) {
      setMessage('Info updated — guest chat will use this property knowledge.');
    } else {
      setMessage('Update failed — add hotel info or use demo info first.');
    }
  };

  const seed = async () => {
    const res = await staffFetch(
      `/api/staff/knowledge/seed/${encodeURIComponent(propertyId)}`,
      staffKey,
      { method: 'POST' }
    );
    if (res.ok) {
      await loadFacts(staffKey, propertyId);
      setMessage('Loaded Grand Horizon demo info.');
    }
  };

  const startCrawl = async () => {
    const seedUrls = collectSeedUrlsFromFields(crawlUrlFields);
    if (!seedUrls.length) {
      setMessage('Enter at least one hotel website(s).');
      return;
    }
    const primarySeed = seedUrls[0];
    const suggestedPid = propertyIdFromUrl(primarySeed);
    const pid = propertyIdLocked ? propertyId.trim() || suggestedPid : suggestedPid;
    setPropertyId(pid);
    setCrawling(true);
    setCrawlJob(null);
    setCrawlJustCompleted(false);
    setMessage(
      seedUrls.length > 1
        ? `Loading website(s) info — ${seedUrls.length} sources…`
        : 'Loading website(s) info…'
    );

    setTimeout(() => {
      staffKnowledgeRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 150);

    const res = await staffFetch('/api/staff/knowledge/crawl', staffKey, {
      method: 'POST',
      body: JSON.stringify({ seed_urls: seedUrls, property_id: pid }),
    });

    if (!res.ok) {
      setCrawling(false);
      const err = await res.json().catch(() => ({}));
      setMessage(String((err as { detail?: string }).detail || 'Could not load website(s) info.'));
      return;
    }

    const job: CrawlJob = await res.json();
    if (job.property_id) setPropertyId(job.property_id);
    setCrawlJob(job);
    if (job.booking_augment?.added) {
      setMessage(
        `Added Booking.com listing automatically (${job.booking_augment.added}).`
      );
    }
    pollCrawlJob(job.id, job.property_id || pid);
  };

  const refreshBookingHint = useCallback(
    async (primaryRaw: string) => {
      const primary = normalizeSeedUrl(primaryRaw);
      if (!staffKey || !primary) {
        setBookingHint(null);
        return;
      }
      if (primary.includes('booking.com')) {
        setBookingHint(null);
        return;
      }
      try {
        const res = await staffFetch(
          `/api/staff/knowledge/booking-suggest?seed_url=${encodeURIComponent(primary)}`,
          staffKey
        );
        if (res.ok) {
          setBookingHint(await res.json());
        }
      } catch {
        setBookingHint(null);
      }
    },
    [staffKey]
  );

  const addUrlField = () => {
    setCrawlUrlFields((prev) => [...prev, newUrlField()]);
  };

  const removeUrlField = (id: string) => {
    setCrawlUrlFields((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((field) => field.id !== id);
    });
  };

  const updateUrlField = (id: string, value: string) => {
    setCrawlUrlFields((prev) => {
      const next = prev.map((field) => (field.id === id ? { ...field, value } : field));
      const first = next[0];
      if (first?.id === id) {
        if (!propertyIdLocked && value.trim()) {
          setPropertyId(propertyIdFromUrl(value));
        }
        void refreshBookingHint(value);
      }
      return next;
    });
  };

  const applySuggestedPropertyId = () => {
    const seedUrls = collectSeedUrlsFromFields(crawlUrlFields);
    if (!propertyIdLocked && seedUrls.length) {
      setPropertyId(propertyIdFromUrl(seedUrls[0]));
    }
  };

  const handleAutoPropertyId = () => {
    setPropertyIdLocked(false);
    const first = collectSeedUrlsFromFields(crawlUrlFields)[0];
    if (first) setPropertyId(propertyIdFromUrl(first));
  };

  const isBranchChild = (slotKey: string) => {
    return Object.values(BRANCH_CHILDREN).some((children) => children.includes(slotKey));
  };

  const contentWidthClass = embedded
    ? 'w-full px-4 sm:px-6'
    : 'mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10';

  const rootClassName = embedded
    ? `staff-ui knowledge-onboarding flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100${
        crawling || crawlJustCompleted ? ' has-crawl-float' : ''
      }`
    : `staff-ui knowledge-onboarding min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100${
        crawling || crawlJustCompleted ? ' has-crawl-float' : ''
      }`;

  const knowledgeActions = (
    <>
      {!embedded && <OnboardingThemeToggle />}
      {!embedded && (
        <a href="/staff?nav=knowledge" className="btn-ghost">
          Staff workspace
        </a>
      )}
      <button type="button" className="btn-ghost" onClick={seed}>
        Use demo info
      </button>
      <button type="button" className="btn-primary" onClick={publish}>
        <IconUpload size={15} stroke={2} aria-hidden />
        Update info
      </button>
    </>
  );

  const onboardingScroll = (
    <>
      <div className={`onboarding-top ${contentWidthClass} ${embedded ? 'pt-4' : 'pt-6'}`}>
        {!embedded ? (
          <div className="page-hdr">
            <div>
              <h1 className="font-heading page-title">Knowledge onboarding</h1>
              <p className="page-sub">
                Property: <strong>{propertyId}</strong>
              </p>
            </div>
            <div className="hdr-actions">{knowledgeActions}</div>
          </div>
        ) : null}

        <ProgressBar {...progressStats} hasCrawlRun={hasCrawlRun} />
        {completeness && (
          <p className="server-completeness">
            Server completeness: Tier A{' '}
            <AnimatedNumber value={completeness.A.percent} duration={900} />% · Tier B{' '}
            <AnimatedNumber value={completeness.B.percent} duration={900} />%
          </p>
        )}

        <OnboardingCrawlPanel
          crawlUrlFields={crawlUrlFields}
          propertyId={propertyId}
          crawling={crawling}
          crawlJob={crawlJob}
          bookingHint={bookingHint}
          onUpdateUrlField={updateUrlField}
          onApplySuggestedPropertyId={applySuggestedPropertyId}
          onAddUrlField={addUrlField}
          onRemoveUrlField={removeUrlField}
          onPropertyIdChange={(value) => {
            setPropertyIdLocked(true);
            setPropertyId(value);
          }}
          onAutoPropertyId={handleAutoPropertyId}
          onStartCrawl={startCrawl}
        />

        {message && (
          <p className="onboarding-status-msg" role="status">
            {message}
          </p>
        )}
      </div>

      <div className={`onboarding-main ${contentWidthClass} pb-8`}>
        <div className="grid gap-8 xl:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="hidden xl:block" aria-label="Knowledge domains">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Domains
            </p>
            <ul className="space-y-1">
              {navSections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => scrollToSection(section.id)}
                    className="nav-link capitalize"
                  >
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-10">
            {coreSlotsByDomain.map(({ domain, slots: domainSlots }) => {
              const greenCount = domainSlots.filter(
                (s) =>
                  getFieldState(facts[s.key]) === 'confirmed' &&
                  facts[s.key]?.status !== 'verified'
              ).length;

              return (
                <section
                  key={domain}
                  id={`domain-${domain}`}
                  ref={(el) => {
                    sectionRefs.current[domain] = el;
                  }}
                >
                  <div className="section-header">
                    <h2 className="font-heading text-lg font-semibold capitalize text-neutral-900 dark:text-white">
                      {domain.replace(/_/g, ' ')}
                    </h2>
                    {greenCount >= 2 && (
                      <button
                        type="button"
                        className="confirm-all-btn"
                        onClick={() => confirmAllInSection(domainSlots)}
                      >
                        Confirm all auto-filled
                      </button>
                    )}
                  </div>
                  {renderFieldGrid(domainSlots)}
                </section>
              );
            })}

            {detailSlots.length > 0 && (
              <section
                id="domain-details"
                ref={(el) => {
                  sectionRefs.current.details = el;
                }}
              >
                <div className="section-header">
                  <h2 className="font-heading text-lg font-semibold text-neutral-900 dark:text-white">
                    Additional details
                  </h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Room policies, services, and other fields that usually need a quick staff
                    confirmation — grouped here so auto-filled essentials stay up top.
                  </p>
                </div>
                {renderFieldGrid(detailSlots)}
              </section>
            )}

            <div ref={staffKnowledgeRef} id="staff-knowledge">
              <StaffKnowledgeSection
                slots={slots}
                facts={facts}
                knowledgeGaps={knowledgeGaps}
                onPatch={patchFact}
                onSaveGapAnswer={saveKnowledgeGapAnswer}
              />
            </div>
          </div>
        </div>
      </div>

      <CrawlStatusFloat
        crawling={crawling}
        crawlComplete={crawlJustCompleted}
        pagesDiscovered={crawlJob?.pages_discovered ?? 0}
        pagesWithFacts={crawlJob?.pages_extracted ?? 0}
        factsMerged={crawlJob?.facts_merged ?? lastCrawlFactsMerged}
        onReviewFields={() => scrollToSection(coreSlotsByDomain[0]?.domain ?? 'property')}
      />
    </>
  );

  return (
    <div className={rootClassName}>
      {embedded ? (
        <>
          <StaffPageHeader
            icon={<StaffNavIcon nav="knowledge" />}
            title="Knowledge"
            actions={knowledgeActions}
            actionsAlign="end"
          />
          <StaffModuleBody className="w-full min-w-0 overflow-y-auto">{onboardingScroll}</StaffModuleBody>
        </>
      ) : (
        onboardingScroll
      )}
    </div>
  );
}
