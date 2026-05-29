'use client';

import { useEffect, useMemo, useState } from 'react';
import { StaffAction } from '@/types';
import { StaffCard, StaffTag } from './StaffLayoutPrimitives';
import { ResizableSplit } from './ResizablePanel';

const SETTINGS_KEY = 'mage-review-platform-settings';
const REVIEW_STATUS_KEY = 'mage-review-status';

interface StaffReviewDashboardProps {
  actions: StaffAction[];
}

interface GuestReviewRow {
  guestId: string;
  guestName: string;
  roomNumber: string;
  checkoutDate: string;
  happinessScore: number;
  requestCount: number;
  reviewRequestsSent: string;
  reviewPosted: string;
  platform: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inferHappiness(rows: StaffAction[]): number {
  let score = 88;
  score -= rows.filter((row) => row.escalationType === 'escalated').length * 18;
  score -= rows.filter((row) => row.status === 'pending').length * 7;
  score += rows.filter((row) => row.status === 'resolved').length * 4;
  return clamp(score, 25, 99);
}

export function StaffReviewDashboard({ actions }: StaffReviewDashboardProps) {
  const [platformSettings, setPlatformSettings] = useState<string[]>([
    'Google',
    'Tripadvisor',
    'Booking.com',
    'Expedia',
  ]);
  const [reviewStatus, setReviewStatus] = useState<Record<string, { posted: boolean; platform: string }>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const settingsRaw = localStorage.getItem(SETTINGS_KEY);
    const statusRaw = localStorage.getItem(REVIEW_STATUS_KEY);
    if (settingsRaw) {
      try {
        setPlatformSettings(JSON.parse(settingsRaw));
      } catch {
        // ignore
      }
    }
    if (statusRaw) {
      try {
        setReviewStatus(JSON.parse(statusRaw));
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(platformSettings));
  }, [platformSettings]);

  useEffect(() => {
    localStorage.setItem(REVIEW_STATUS_KEY, JSON.stringify(reviewStatus));
  }, [reviewStatus]);

  const rows = useMemo<GuestReviewRow[]>(() => {
    const map = new Map<string, StaffAction[]>();
    for (const action of actions) {
      const collection = map.get(action.guestId) ?? [];
      collection.push(action);
      map.set(action.guestId, collection);
    }

    const out: GuestReviewRow[] = [];
    map.forEach((rowsByGuest, guestId) => {
      const latest = [...rowsByGuest].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      const status = reviewStatus[guestId];
      out.push({
        guestId,
        guestName: latest.guestName ?? guestId,
        roomNumber: latest.roomNumber ?? '—',
        checkoutDate: new Date(
          new Date(latest.createdAt).getTime() + 2 * 24 * 60 * 60 * 1000
        ).toLocaleDateString(),
        happinessScore: inferHappiness(rowsByGuest),
        requestCount: rowsByGuest.length,
        reviewRequestsSent: '—',
        reviewPosted: status?.posted ? 'Yes' : 'No',
        platform: status?.platform || '—',
      });
    });
    return out.sort((a, b) => b.happinessScore - a.happinessScore);
  }, [actions, reviewStatus]);

  const filteredRows = rows.filter((row) => {
    const match = `${row.guestName} ${row.roomNumber} ${row.platform}`.toLowerCase();
    return match.includes(query.toLowerCase());
  });

  const allPlatforms = ['Google', 'Tripadvisor', 'Booking.com', 'Expedia', 'Yelp'];

  const tableCard = (
      <StaffCard className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Review specialist
            </h2>
            <StaffTag>{filteredRows.length} guests</StaffTag>
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className="ml-auto rounded-md border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs text-neutral-700 dark:text-neutral-300"
            >
              Platform settings
            </button>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter guests..."
            className="mt-2 w-full max-w-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm"
          />
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Room</th>
                <th className="px-3 py-2">Checkout</th>
                <th className="px-3 py-2">Happiness</th>
                <th className="px-3 py-2">Requests</th>
                <th className="px-3 py-2">Review Requests</th>
                <th className="px-3 py-2">Posted</th>
                <th className="px-3 py-2">Platform</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.guestId}
                  className="border-t border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300"
                >
                  <td className="px-3 py-2 font-medium text-neutral-900 dark:text-white">
                    {row.guestName}
                  </td>
                  <td className="px-3 py-2">{row.roomNumber}</td>
                  <td className="px-3 py-2">{row.checkoutDate}</td>
                  <td className="px-3 py-2">{row.happinessScore}</td>
                  <td className="px-3 py-2">{row.requestCount}</td>
                  <td className="px-3 py-2">{row.reviewRequestsSent}</td>
                  <td className="px-3 py-2">
                    <select
                      value={reviewStatus[row.guestId]?.posted ? 'yes' : 'no'}
                      onChange={(e) =>
                        setReviewStatus((prev) => ({
                          ...prev,
                          [row.guestId]: {
                            posted: e.target.value === 'yes',
                            platform: prev[row.guestId]?.platform ?? platformSettings[0] ?? 'Google',
                          },
                        }))
                      }
                      className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={reviewStatus[row.guestId]?.platform || ''}
                      onChange={(e) =>
                        setReviewStatus((prev) => ({
                          ...prev,
                          [row.guestId]: {
                            posted: prev[row.guestId]?.posted ?? false,
                            platform: e.target.value,
                          },
                        }))
                      }
                      className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
                    >
                      <option value="">—</option>
                      {platformSettings.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StaffCard>
  );

  const settingsCard = (
    <StaffCard className="h-full min-h-0 overflow-hidden p-4 space-y-2">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
        Encouraged platforms
      </h3>
      {allPlatforms.map((platform) => (
        <label
          key={platform}
          className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
        >
          <input
            type="checkbox"
            checked={platformSettings.includes(platform)}
            onChange={() =>
              setPlatformSettings((prev) =>
                prev.includes(platform)
                  ? prev.filter((item) => item !== platform)
                  : [...prev, platform]
              )
            }
          />
          {platform}
        </label>
      ))}
    </StaffCard>
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden p-4 md:p-5">
      {showSettings ? (
        <ResizableSplit
          storageKey="staff-review-settings"
          defaultLeftWidth={720}
          minLeft={400}
          maxLeft={1200}
          className="min-h-0 flex-1"
          left={tableCard}
          right={settingsCard}
        />
      ) : (
        tableCard
      )}
    </div>
  );
}

