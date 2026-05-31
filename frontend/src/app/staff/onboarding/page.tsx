'use client';

import { useCallback, useEffect, useState } from 'react';

const PROPERTY_ID = process.env.NEXT_PUBLIC_PROPERTY_ID || 'grand-horizon';

type Slot = {
  key: string;
  domain: string;
  tier: string;
  label: string;
};

type Fact = {
  value?: unknown;
  status: string;
};

type Completeness = {
  A: { filled: number; total: number; percent: number };
  B: { filled: number; total: number; percent: number };
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
  const [slots, setSlots] = useState<Slot[]>([]);
  const [facts, setFacts] = useState<Record<string, Fact>>({});
  const [completeness, setCompleteness] = useState<Completeness | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [message, setMessage] = useState('');

  const loadFacts = useCallback(async (key: string) => {
    const res = await staffFetch(`/api/staff/knowledge/facts/${PROPERTY_ID}`, key);
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
      await loadFacts(staffKey);
    })();
  }, [unlocked, staffKey, loadFacts]);

  const unlock = () => {
    sessionStorage.setItem('mage-staff-key', staffKey);
    setUnlocked(true);
  };

  const patchFact = async (slotKey: string, status: string, value?: string) => {
    const res = await staffFetch(
      `/api/staff/knowledge/facts/${PROPERTY_ID}/${encodeURIComponent(slotKey)}`,
      staffKey,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, value: value ?? facts[slotKey]?.value }),
      }
    );
    if (res.ok) {
      await loadFacts(staffKey);
      setMessage(`Updated ${slotKey}`);
    }
  };

  const publish = async () => {
    const res = await staffFetch(
      `/api/staff/knowledge/publish/${PROPERTY_ID}`,
      staffKey,
      { method: 'POST' }
    );
    if (res.ok) {
      setMessage('Published knowledge snapshot — runtime will use it when knowledge_mode is set.');
    } else {
      setMessage('Publish failed — seed facts first.');
    }
  };

  const seed = async () => {
    const res = await staffFetch(
      `/api/staff/knowledge/seed/${PROPERTY_ID}`,
      staffKey,
      { method: 'POST' }
    );
    if (res.ok) {
      await loadFacts(staffKey);
      setMessage('Seeded Grand Horizon demo facts.');
    }
  };

  const statusColor = (status: string) => {
    if (status === 'verified' || status === 'filled') return 'bg-green-100 text-green-800';
    if (status === 'conflict') return 'bg-orange-100 text-orange-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  if (!unlocked) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold mb-4">Staff knowledge onboarding</h1>
          <input
            type="password"
            value={staffKey}
            onChange={(e) => setStaffKey(e.target.value)}
            placeholder="Staff key"
            className="w-full border rounded-lg px-3 py-2 mb-3"
          />
          <button
            type="button"
            onClick={unlock}
            className="w-full py-2 bg-black text-white rounded-lg"
          >
            Continue
          </button>
        </div>
      </main>
    );
  }

  const domains = [...new Set(slots.map((s) => s.domain))];

  return (
    <main className="min-h-screen bg-mage-gray-50 px-4 py-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Knowledge onboarding</h1>
      <p className="text-sm text-mage-gray-600 mb-4">Property: {PROPERTY_ID}</p>

      {completeness && (
        <div className="flex gap-4 mb-6 text-sm">
          <span className="px-3 py-1 bg-white rounded-lg border">
            Tier A: {completeness.A.percent}% ({completeness.A.filled}/{completeness.A.total})
          </span>
          <span className="px-3 py-1 bg-white rounded-lg border">
            Tier B: {completeness.B.percent}% ({completeness.B.filled}/{completeness.B.total})
          </span>
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        <button type="button" onClick={seed} className="px-4 py-2 border rounded-lg bg-white text-sm">
          Seed demo facts
        </button>
        <button type="button" onClick={publish} className="px-4 py-2 rounded-lg bg-black text-white text-sm">
          Publish snapshot
        </button>
        <a href="/staff" className="px-4 py-2 border rounded-lg bg-white text-sm inline-flex items-center">
          Staff inbox
        </a>
      </div>

      {message && <p className="text-sm text-green-700 mb-4">{message}</p>}

      {domains.map((domain) => (
        <section key={domain} className="mb-8">
          <h2 className="text-lg font-medium capitalize mb-3">{domain}</h2>
          <ul className="space-y-2">
            {slots
              .filter((s) => s.domain === domain)
              .map((slot) => {
                const fact = facts[slot.key] || { status: 'unknown' };
                return (
                  <li
                    key={slot.key}
                    className="flex items-center justify-between gap-3 p-3 bg-white rounded-lg border"
                  >
                    <div>
                      <p className="font-medium text-sm">{slot.label}</p>
                      <p className="text-xs text-mage-gray-500">{slot.key}</p>
                      {fact.value != null && (
                        <p className="text-xs mt-1 text-mage-gray-700">{String(fact.value)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(fact.status)}`}>
                        {fact.status}
                      </span>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => {
                          setSelectedKey(slot.key);
                          setEditValue(fact.value != null ? String(fact.value) : '');
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      {selectedKey && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-md">
            <h3 className="font-medium mb-2">{selectedKey}</h3>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm mb-3 min-h-[80px]"
            />
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className="px-3 py-1.5 bg-black text-white rounded-lg text-sm"
                onClick={() => {
                  patchFact(selectedKey, 'verified', editValue);
                  setSelectedKey(null);
                }}
              >
                Save & verify
              </button>
              <button
                type="button"
                className="px-3 py-1.5 border rounded-lg text-sm"
                onClick={() => {
                  patchFact(selectedKey, 'not_applicable');
                  setSelectedKey(null);
                }}
              >
                Mark N/A
              </button>
              <button
                type="button"
                className="px-3 py-1.5 border rounded-lg text-sm"
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
