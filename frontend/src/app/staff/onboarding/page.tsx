'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_PROPERTY_ID = process.env.NEXT_PUBLIC_PROPERTY_ID || 'grand-horizon';

type Slot = {
  key: string;
  domain: string;
  tier: string;
  label: string;
};

type Fact = {
  value?: unknown;
  status: string;
  source_url?: string;
};

type Completeness = {
  A: { filled: number; total: number; percent: number };
  B: { filled: number; total: number; percent: number };
};

type CrawlJob = {
  id: string;
  property_id?: string;
  seed_url: string;
  status: string;
  pages_discovered?: number;
  pages_extracted?: number;
  facts_merged?: number;
  error_message?: string;
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
      return (combined.slice(0, 64) || 'pilot-hotel');
    }
    return (hostSlug.slice(0, 64) || 'pilot-hotel');
  } catch {
    return 'pilot-hotel';
  }
}

function normalizeSeedUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  return raw.includes('://') ? raw : `https://${raw}`;
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

function statusBadgeClass(status: string): string {
  if (status === 'verified' || status === 'filled') {
    return 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
  }
  if (status === 'conflict') {
    return 'bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800';
  }
  if (status === 'not_applicable') {
    return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700';
  }
  return 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800';
}

function CompletenessBar({
  label,
  filled,
  total,
  percent,
}: {
  label: string;
  filled: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="min-w-[180px] flex-1">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
        <span className="tabular-nums text-neutral-600 dark:text-neutral-400">
          {percent}% · {filled}/{total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-neutral-900 dark:bg-neutral-200 transition-all"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

export default function StaffOnboardingPage() {
  const [staffKey, setStaffKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [propertyId, setPropertyId] = useState(DEFAULT_PROPERTY_ID);
  const [propertyIdLocked, setPropertyIdLocked] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null);
  const [crawling, setCrawling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [facts, setFacts] = useState<Record<string, Fact>>({});
  const [completeness, setCompleteness] = useState<Completeness | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [message, setMessage] = useState('');

  const loadFacts = useCallback(async (key: string, pid: string) => {
    const res = await staffFetch(`/api/staff/knowledge/facts/${encodeURIComponent(pid)}`, key);
    if (!res.ok) return;
    const data = await res.json();
    setFacts(data.facts || {});
    setCompleteness(data.completeness || null);
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
    })();
  }, [unlocked, staffKey, propertyId, loadFacts]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const domains = useMemo(() => [...new Set(slots.map((s) => s.domain))], [slots]);

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
        const merged = job.facts_merged ?? 0;
        const pages = job.pages_discovered ?? 0;
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

  const patchFact = async (slotKey: string, status: string, value?: string) => {
    const res = await staffFetch(
      `/api/staff/knowledge/facts/${encodeURIComponent(propertyId)}/${encodeURIComponent(slotKey)}`,
      staffKey,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, value: value ?? facts[slotKey]?.value }),
      }
    );
    if (res.ok) {
      await loadFacts(staffKey, propertyId);
      setMessage(`Updated ${slotKey}`);
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
    const seedUrl = normalizeSeedUrl(crawlUrl);
    if (!seedUrl) {
      setMessage('Enter a hotel website URL to crawl.');
      return;
    }
    const suggestedPid = propertyIdFromUrl(seedUrl);
    const pid = propertyIdLocked ? (propertyId.trim() || suggestedPid) : suggestedPid;
    setPropertyId(pid);
    setCrawling(true);
    setCrawlJob(null);
    setMessage('Crawl started — discovering pages…');

    const res = await staffFetch('/api/staff/knowledge/crawl', staffKey, {
      method: 'POST',
      body: JSON.stringify({ seed_url: seedUrl, property_id: pid }),
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
    pollCrawlJob(job.id, job.property_id || pid);
  };

  const applySuggestedPropertyId = () => {
    if (!propertyIdLocked && crawlUrl.trim()) {
      setPropertyId(propertyIdFromUrl(crawlUrl));
    }
  };

  if (!unlocked) {
    return (
      <main className="staff-ui flex min-h-screen items-center justify-center bg-neutral-100 px-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
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
    <main className="staff-ui min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-neutral-900 dark:text-white">
                Knowledge onboarding
              </h1>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Property:{' '}
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{propertyId}</span>
              </p>
            </div>

            {completeness && (
              <div className="flex w-full flex-col gap-3 sm:flex-row xl:max-w-xl">
                <CompletenessBar
                  label="Tier A"
                  filled={completeness.A.filled}
                  total={completeness.A.total}
                  percent={completeness.A.percent}
                />
                <CompletenessBar
                  label="Tier B"
                  filled={completeness.B.filled}
                  total={completeness.B.total}
                  percent={completeness.B.percent}
                />
              </div>
            )}
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
              Crawl hotel website
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Paste the hotel&apos;s homepage URL — including brand sub-routes like{' '}
              <span className="font-mono">marriott.com/hotels/your-hotel</span> when the property
              shares a domain. Discovers amenity, FAQ, and policy pages under that path only.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px_auto]">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Website URL
                </span>
                <input
                  type="url"
                  value={crawlUrl}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCrawlUrl(next);
                    if (!propertyIdLocked) {
                      setPropertyId(propertyIdFromUrl(next));
                    }
                  }}
                  onBlur={applySuggestedPropertyId}
                  placeholder="https://www.example-hotel.com"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                />
              </label>
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
                    setPropertyId(propertyIdFromUrl(crawlUrl));
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
                  className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 lg:w-auto lg:whitespace-nowrap"
                >
                  {crawling ? 'Crawling…' : 'Start crawl'}
                </button>
              </div>
            </div>
            {crawlJob && (
              <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                <span className="font-medium capitalize">{crawlJob.status.replace(/_/g, ' ')}</span>
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
          <nav
            className="hidden xl:block"
            aria-label="Knowledge domains"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Domains
            </p>
            <ul className="space-y-1">
              {domains.map((domain) => (
                <li key={domain}>
                  <a
                    href={`#domain-${domain}`}
                    className="block rounded-lg px-3 py-2 text-sm capitalize text-neutral-700 hover:bg-white hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
                  >
                    {domain.replace(/_/g, ' ')}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-10">
            {domains.map((domain) => (
              <section key={domain} id={`domain-${domain}`}>
                <h2 className="mb-4 font-heading text-lg font-semibold capitalize text-neutral-900 dark:text-white">
                  {domain.replace(/_/g, ' ')}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                  {slots
                    .filter((s) => s.domain === domain)
                    .map((slot) => {
                      const fact = facts[slot.key] || { status: 'unknown' };
                      return (
                        <li
                          key={slot.key}
                          className="flex flex-col justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                        >
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                                {slot.label}
                              </p>
                              <span
                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusBadgeClass(fact.status)}`}
                              >
                                {fact.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                              {slot.key}
                            </p>
                            {slot.tier && (
                              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                                Tier {slot.tier}
                              </p>
                            )}
                            {fact.value != null && (
                              <p className="mt-2 line-clamp-3 text-sm text-neutral-700 dark:text-neutral-300">
                                {String(fact.value)}
                              </p>
                            )}
                            {fact.source_url && (
                              <p className="mt-1 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                                Source: {fact.source_url}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            className="self-start text-sm font-medium text-neutral-800 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-600 dark:text-neutral-200 dark:decoration-neutral-600"
                            onClick={() => {
                              setSelectedKey(slot.key);
                              setEditValue(fact.value != null ? String(fact.value) : '');
                            }}
                          >
                            Edit
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>

      {selectedKey && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div
            className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-fact-title"
          >
            <h3
              id="edit-fact-title"
              className="font-medium text-neutral-900 dark:text-white"
            >
              {selectedKey}
            </h3>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="mt-3 min-h-[100px] w-full rounded-lg border border-neutral-300 bg-white p-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              placeholder="Enter value for this field…"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
                onClick={() => {
                  patchFact(selectedKey, 'verified', editValue);
                  setSelectedKey(null);
                }}
              >
                Save & verify
              </button>
              <button
                type="button"
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                onClick={() => {
                  patchFact(selectedKey, 'not_applicable');
                  setSelectedKey(null);
                }}
              >
                Mark N/A
              </button>
              <button
                type="button"
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                onClick={() => setSelectedKey(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
