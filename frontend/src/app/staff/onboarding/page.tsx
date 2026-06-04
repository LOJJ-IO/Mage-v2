'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BRANCH_CHILDREN,
  FieldCard,
  getFieldState,
  isBranchHidden,
  isCoreSlot,
  isFieldComplete,
  ProgressBar,
  sortSlotsForDisplay,
  StaffKnowledgeSection,
  type KnowledgeGap,
  type PropertyFact,
  type Slot,
} from '@/components/knowledge';
import '@/components/knowledge/onboarding.css';

const DEFAULT_PROPERTY_ID = process.env.NEXT_PUBLIC_PROPERTY_ID || 'grand-horizon';

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

type UrlField = { id: string; value: string };

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

type BookingSuggest = {
  search_query?: string;
  search_url?: string;
  hotel_url?: string | null;
  source?: string | null;
};

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

export default function StaffOnboardingPage() {
  const [staffKey, setStaffKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [propertyId, setPropertyId] = useState(DEFAULT_PROPERTY_ID);
  const [propertyIdLocked, setPropertyIdLocked] = useState(false);
  const [crawlUrlFields, setCrawlUrlFields] = useState<UrlField[]>(() => [newUrlField()]);
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

  useEffect(() => {
    const saved = sessionStorage.getItem('mage-staff-key');
    if (saved) {
      setStaffKey(saved);
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!unlocked || !staffKey) return;
    (async () => {
      const schemaRes = await staffFetch('/api/staff/knowledge/schema', staffKey);
      if (schemaRes.ok) {
        const schema = await schemaRes.json();
        setSlots(schema.slots || []);
      }
      await loadFacts(staffKey, propertyId);
      await loadKnowledgeGaps(staffKey, propertyId);
    })();
  }, [unlocked, staffKey, propertyId, loadFacts, loadKnowledgeGaps]);

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
          `Crawl finished — ${pages} pages scanned, ${merged} facts extracted. Review gaps below, then publish.`
        );
      } else if (job.status === 'failed') {
        stopPolling();
        setCrawling(false);
        setMessage(job.error_message || 'Crawl failed.');
      }
    }, 2000);
  };

  const unlock = () => {
    sessionStorage.setItem('mage-staff-key', staffKey);
    setUnlocked(true);
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
      setMessage('Published snapshot — guest chat will use this property knowledge.');
    } else {
      setMessage('Publish failed — add or crawl facts first.');
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
      setMessage('Seeded Grand Horizon demo facts (dev shortcut only).');
    }
  };

  const startCrawl = async () => {
    const seedUrls = collectSeedUrlsFromFields(crawlUrlFields);
    if (!seedUrls.length) {
      setMessage('Enter at least one hotel URL to crawl.');
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
        ? `Crawl started — ${seedUrls.length} sources, discovering pages…`
        : 'Crawl started — discovering pages…'
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
      setMessage(String((err as { detail?: string }).detail || 'Could not start crawl.'));
      return;
    }

    const job: CrawlJob = await res.json();
    if (job.property_id) setPropertyId(job.property_id);
    setCrawlJob(job);
    if (job.booking_augment?.added) {
      setMessage(
        `Crawl started — added Booking.com listing automatically (${job.booking_augment.added}).`
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
      if (prev.length <= 1) return prev;
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

  const isBranchChild = (slotKey: string) => {
    return Object.values(BRANCH_CHILDREN).some((children) => children.includes(slotKey));
  };

  if (!unlocked) {
    return (
      <main className="staff-ui knowledge-onboarding flex min-h-screen items-center justify-center bg-neutral-100 px-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="font-heading text-xl font-semibold text-neutral-900 dark:text-white">
            Staff knowledge onboarding
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Enter your staff key to review and publish property knowledge.
          </p>
          <input
            type="password"
            value={staffKey}
            onChange={(e) => setStaffKey(e.target.value)}
            placeholder="Staff key"
            className="mt-6 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          />
          <button
            type="button"
            onClick={unlock}
            className="mt-4 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Continue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="staff-ui knowledge-onboarding min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-neutral-900 dark:text-white">
                Knowledge onboarding
              </h1>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Property:{' '}
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {propertyId}
                </span>
              </p>
            </div>

            <div className="w-full xl:max-w-2xl">
              <ProgressBar {...progressStats} />
              {completeness && (
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Server completeness: Tier A {completeness.A.percent}% · Tier B{' '}
                  {completeness.B.percent}%
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={seed}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Seed demo facts
            </button>
            <button
              type="button"
              onClick={publish}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Publish snapshot
            </button>
            <a
              href="/staff"
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Staff workspace
            </a>
          </div>

          {message && (
            <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">
              {message}
            </p>
          )}

          <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Crawl hotel sources
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              The first URL is the hotel website (brand sub-routes like{' '}
              <span className="font-mono">marriott.com/hotels/your-hotel</span> work). Add optional
              listing pages with extra fields. If you omit Booking.com, we try to find its listing
              from your hotel URL when the crawl starts.
            </p>
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Source URLs
                </span>
                {crawlUrlFields.map((field, index) => (
                  <div key={field.id} className="flex flex-col gap-1 sm:flex-row sm:items-center">
                    <input
                      type="url"
                      value={field.value}
                      onChange={(e) => updateUrlField(field.id, e.target.value)}
                      onBlur={index === 0 ? applySuggestedPropertyId : undefined}
                      placeholder={
                        index === 0
                          ? 'https://www.example-hotel.com'
                          : 'https://www.booking.com/hotel/… (optional)'
                      }
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                    {crawlUrlFields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUrlField(field.id)}
                        className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addUrlField}
                  className="text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
                >
                  + Add another URL
                </button>
                {bookingHint?.hotel_url && (
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    Likely Booking.com listing:{' '}
                    <span className="font-mono break-all">{bookingHint.hotel_url}</span>
                    {bookingHint.search_url && (
                      <>
                        {' '}
                        · search:{' '}
                        <a
                          href={bookingHint.search_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          open on Booking.com
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
                <div className="hidden sm:block" aria-hidden />
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Property ID
                  </span>
                  <input
                    type="text"
                    value={propertyId}
                    onChange={(e) => {
                      setPropertyIdLocked(true);
                      setPropertyId(e.target.value);
                    }}
                    placeholder="auto-from-domain"
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPropertyIdLocked(false);
                      const first = collectSeedUrlsFromFields(crawlUrlFields)[0];
                      if (first) setPropertyId(propertyIdFromUrl(first));
                    }}
                    className="mt-1 text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  >
                    Auto from URL
                  </button>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={startCrawl}
                    disabled={crawling}
                    className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 sm:w-auto sm:whitespace-nowrap"
                  >
                    {crawling ? 'Crawling…' : 'Start crawl'}
                  </button>
                </div>
              </div>
            </div>
            {crawlJob && (
              <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                <span className="font-medium capitalize">{crawlJob.status.replace(/_/g, ' ')}</span>
                {(crawlJob.seed_urls?.length ?? 0) > 1 && (
                  <span className="ml-2">· {crawlJob.seed_urls!.length} sources</span>
                )}
                {crawlJob.pages_discovered != null && (
                  <span className="ml-2">· {crawlJob.pages_discovered} pages found</span>
                )}
                {crawlJob.pages_extracted != null && (
                  <span className="ml-2">· {crawlJob.pages_extracted} with facts</span>
                )}
                {crawlJob.facts_merged != null && (
                  <span className="ml-2">· {crawlJob.facts_merged} slots filled</span>
                )}
                {crawlJob.gap_report && crawlJob.status === 'completed' && (
                  <span className="ml-2">
                    · Tier A gaps: {crawlJob.gap_report.tier_a_missing?.length ?? 0}
                  </span>
                )}
              </div>
            )}
          </section>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-10">
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
            {crawlJustCompleted && (
              <div className="crawl-complete-banner" role="status">
                <span>
                  ✓ Crawl complete — {lastCrawlFactsMerged} facts extracted. Scroll up to
                  review auto-filled fields when you&apos;re ready.
                </span>
                <button
                  type="button"
                  onClick={() => scrollToSection(coreSlotsByDomain[0]?.domain ?? 'property')}
                >
                  Review fields ↑
                </button>
              </div>
            )}
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
    </main>
  );
}
