'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconMinus,
  IconMoodConfuzed,
  IconMoodEmpty,
  IconMoodHappy,
  IconMoodSad,
  IconMoodSmile,
  IconSend,
  IconStar,
} from '@tabler/icons-react';
import { StaffAction } from '@/types';
import { apiClient } from '@/lib/api';
import {
  checkoutClass,
  defaultPlatform,
  formatCheckout,
  guestAvatarClass,
  guestInitials,
  GuestReviewStatus,
  hasEscalatedPending,
  hasPendingRequests,
  isCheckedOut,
  isReviewReady,
  matchesSegment,
  moodPillClass,
  MoodInfo,
  needsAttention,
  platformIcon,
  ReviewSegment,
  scoreToMood,
} from './reviewSpecialistUtils';
import { StaffModuleBody, StaffPageHeader } from './StaffPageHeader';
import { StaffNavIcon } from './StaffNavIcon';
import { StaffEmptyState } from './StaffLayoutPrimitives';

const REVIEW_STATUS_KEY = 'mage-review-status';
const PLATFORMS = ['Google', 'TripAdvisor', 'Booking.com', 'Expedia'];

const SEGMENTS: { id: ReviewSegment; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'ready', label: 'Review ready' },
  { id: 'checked-out', label: 'Checked out' },
];

interface StaffReviewDashboardProps {
  actions: StaffAction[];
  staffKey: string;
}

interface GuestSummary {
  guestId: string;
  name: string;
  roomNumber: string;
  checkOut: Date;
  score: number | null;
}

interface GuestReviewRow {
  guestId: string;
  guestName: string;
  roomNumber: string;
  checkOut: Date;
  checkoutLabel: string;
  checkoutUrgency: 'urgent' | 'soon' | 'ok';
  mood: MoodInfo;
  vaderScore: number;
  requestCount: number;
  reviewStatus: GuestReviewStatus;
  guestActions: StaffAction[];
  rowAccent: 'urgent' | 'warn' | null;
}

function moodIcon(kind: MoodInfo['kind']) {
  const cls = 'w-3.5 h-3.5';
  switch (kind) {
    case 'great':
      return <IconMoodHappy className={cls} aria-hidden />;
    case 'good':
      return <IconMoodSmile className={cls} aria-hidden />;
    case 'neutral':
      return <IconMoodEmpty className={cls} aria-hidden />;
    case 'frustrated':
      return <IconMoodConfuzed className={cls} aria-hidden />;
    case 'upset':
      return <IconMoodSad className={cls} aria-hidden />;
  }
}

function normalizeReviewStatus(raw: unknown): GuestReviewStatus {
  if (!raw || typeof raw !== 'object') {
    return { posted: false, sent: false, platform: '' };
  }
  const value = raw as Record<string, unknown>;
  return {
    posted: Boolean(value.posted),
    sent: Boolean(value.sent),
    platform: typeof value.platform === 'string' ? value.platform : '',
  };
}

function groupActionsByGuest(actions: StaffAction[]): Map<string, StaffAction[]> {
  const map = new Map<string, StaffAction[]>();
  for (const action of actions) {
    const list = map.get(action.guestId) ?? [];
    list.push(action);
    map.set(action.guestId, list);
  }
  return map;
}

export function StaffReviewDashboard({ actions, staffKey }: StaffReviewDashboardProps) {
  const router = useRouter();
  const [summaries, setSummaries] = useState<GuestSummary[]>([]);
  const [reviewStatus, setReviewStatus] = useState<Record<string, GuestReviewStatus>>({});
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<ReviewSegment>('all');

  const loadSummaries = useCallback(() => {
    apiClient.listGuestReviewSummaries(staffKey).then((res) => {
      if (res.success && res.data) {
        setSummaries(res.data);
      }
    });
  }, [staffKey]);

  useEffect(() => {
    loadSummaries();
    const timer = window.setInterval(loadSummaries, 15000);
    return () => window.clearInterval(timer);
  }, [loadSummaries, actions.length]);

  useEffect(() => {
    const raw = localStorage.getItem(REVIEW_STATUS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next: Record<string, GuestReviewStatus> = {};
      for (const [guestId, value] of Object.entries(parsed)) {
        next[guestId] = normalizeReviewStatus(value);
      }
      setReviewStatus(next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(REVIEW_STATUS_KEY, JSON.stringify(reviewStatus));
  }, [reviewStatus]);

  const actionsByGuest = useMemo(() => groupActionsByGuest(actions), [actions]);

  const rows = useMemo<GuestReviewRow[]>(() => {
    const messagedGuests = summaries.filter((g) => g.score != null);
    const out: GuestReviewRow[] = [];

    messagedGuests.forEach((summary) => {
      const guestId = summary.guestId;
      const guestActions = actionsByGuest.get(guestId) ?? [];
      const vaderScore = summary.score as number;
      const mood = scoreToMood(vaderScore);
      const checkout = formatCheckout(summary.checkOut);
      const stored = reviewStatus[guestId];
      const platform =
        stored?.platform ||
        defaultPlatform(guestId, PLATFORMS);

      let rowAccent: GuestReviewRow['rowAccent'] = null;
      if (mood.kind === 'upset' || hasEscalatedPending(guestActions)) {
        rowAccent = 'urgent';
      } else if (
        mood.kind === 'frustrated' ||
        (checkout.urgency === 'urgent' && hasPendingRequests(guestActions))
      ) {
        rowAccent = 'warn';
      }

      out.push({
        guestId,
        guestName: summary.name,
        roomNumber: summary.roomNumber,
        checkOut: summary.checkOut,
        checkoutLabel: checkout.label,
        checkoutUrgency: checkout.urgency,
        mood,
        vaderScore,
        requestCount: guestActions.length,
        reviewStatus: {
          posted: stored?.posted ?? false,
          sent: stored?.sent ?? false,
          platform,
        },
        guestActions,
        rowAccent,
      });
    });

    return out.sort((a, b) => b.vaderScore - a.vaderScore);
  }, [summaries, actionsByGuest, reviewStatus]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const haystack = `${row.guestName} ${row.roomNumber} ${row.reviewStatus.platform}`.toLowerCase();
      if (!haystack.includes(query.toLowerCase())) return false;
      return matchesSegment(
        segment,
        row.mood,
        row.reviewStatus,
        row.guestActions,
        row.checkOut
      );
    });
  }, [rows, query, segment]);

  const stats = useMemo(() => {
    const checkingOutToday = rows.filter(
      (r) => r.checkoutUrgency === 'urgent' && !isCheckedOut(r.checkOut)
    ).length;
    const attention = rows.filter((r) =>
      needsAttention(r.mood, r.guestActions)
    ).length;
    const reviewReady = rows.filter((r) =>
      isReviewReady(r.mood, r.reviewStatus, r.guestActions)
    ).length;
    const posted = rows.filter((r) => r.reviewStatus.posted).length;
    return {
      total: rows.length,
      checkingOutToday,
      attention,
      reviewReady,
      posted,
    };
  }, [rows]);

  const updateReviewStatus = (
    guestId: string,
    patch: Partial<GuestReviewStatus>
  ) => {
    setReviewStatus((prev) => ({
      ...prev,
      [guestId]: {
        posted: prev[guestId]?.posted ?? false,
        sent: prev[guestId]?.sent ?? false,
        platform:
          prev[guestId]?.platform || defaultPlatform(guestId, PLATFORMS),
        ...patch,
      },
    }));
  };

  const openGuestChat = (guestId: string) => {
    router.push(`/staff?nav=guest-chat&guestId=${encodeURIComponent(guestId)}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StaffPageHeader
        icon={<StaffNavIcon nav="review" />}
        title="Review specialist"
        subtitle={
          stats.total === 0
            ? 'No guest conversations yet'
            : `${stats.total} guest${stats.total === 1 ? '' : 's'} · ${stats.reviewReady} review ready`
        }
        toolbar={
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter guests…"
              className="min-w-[180px] rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600"
            />
            <div className="ml-auto flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              {SEGMENTS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSegment(item.id)}
                  className={`border-neutral-200 px-3 py-1.5 text-xs dark:border-neutral-800 ${
                    index < SEGMENTS.length - 1 ? 'border-r' : ''
                  } ${
                    segment === item.id
                      ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
                      : 'bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:bg-transparent dark:text-neutral-500 dark:hover:bg-neutral-900/80 dark:hover:text-neutral-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      <StaffModuleBody className="overflow-y-auto p-4 md:p-5">
      {rows.length === 0 ? (
        <StaffEmptyState
          title="No guest conversations yet"
          description="Guests appear here after they send their first message to Mage. Sentiment scores are based on their chat."
        />
      ) : (
      <div className="mx-auto flex w-full max-w-[1100px] flex-col">
        <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-[11px] text-neutral-500 dark:text-neutral-500">Active guests</div>
            <div className="text-xl font-medium text-neutral-900 dark:text-neutral-100">{stats.total}</div>
            <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-600">
              {stats.checkingOutToday} checking out today
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-[11px] text-neutral-500">Need attention</div>
            <div className="text-xl font-medium text-red-600 dark:text-[#E24B4A]">{stats.attention}</div>
            <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-600">frustrated or upset</div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-[11px] text-neutral-500">Review ready</div>
            <div className="text-xl font-medium text-emerald-700 dark:text-[#1D9E75]">{stats.reviewReady}</div>
            <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-600">happy, not yet asked</div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-[11px] text-neutral-500">Reviews posted</div>
            <div className="text-xl font-medium text-neutral-900 dark:text-neutral-100">{stats.posted}</div>
            <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-600">tracked locally</div>
          </div>
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full min-w-[920px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[24%]" />
            </colgroup>
            <thead>
              <tr className="bg-neutral-50 text-left dark:bg-neutral-950">
                {['Guest', 'Sentiment', 'Checkout', 'Requests', 'Review', 'Platform', ''].map(
                  (label) => (
                    <th
                      key={label || 'actions'}
                      className="border-b border-neutral-200 px-3 py-2 text-[11px] font-normal uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-600"
                    >
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-10 text-center text-sm text-neutral-500"
                  >
                    No guests match this filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const reviewReady = isReviewReady(
                    row.mood,
                    row.reviewStatus,
                    row.guestActions
                  );
                  const showResolve =
                    row.mood.kind === 'upset' || hasEscalatedPending(row.guestActions);
                  const showCheckIn =
                    !showResolve &&
                    (row.mood.kind === 'frustrated' ||
                      (row.checkoutUrgency === 'urgent' &&
                        hasPendingRequests(row.guestActions)));

                  return (
                    <tr
                      key={row.guestId}
                      className={`group border-b border-neutral-200 last:border-b-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-950/80 ${
                        row.rowAccent === 'urgent'
                          ? '[&>td:first-child]:border-l-[3px] [&>td:first-child]:border-l-red-500 dark:[&>td:first-child]:border-l-[#E24B4A]'
                          : row.rowAccent === 'warn'
                            ? '[&>td:first-child]:border-l-[3px] [&>td:first-child]:border-l-amber-500 dark:[&>td:first-child]:border-l-[#EF9F27]'
                            : ''
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${guestAvatarClass(row.guestId)}`}
                          >
                            {guestInitials(row.guestName)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                              {row.guestName}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              Room {row.roomNumber}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${moodPillClass(row.mood.kind)}`}
                          title={`VADER score: ${row.vaderScore}`}
                        >
                          {moodIcon(row.mood.kind)}
                          {row.mood.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={checkoutClass(row.checkoutUrgency)}>
                          {row.checkoutLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-neutral-600 dark:text-neutral-500">
                        {row.requestCount}{' '}
                        {row.requestCount === 1 ? 'request' : 'requests'}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.reviewStatus.posted ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800 dark:bg-[#0a2e1f] dark:text-[#1D9E75]">
                            <IconCircleCheck className="w-3 h-3" aria-hidden />
                            Posted
                          </span>
                        ) : row.reviewStatus.sent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-[#0f2940] dark:text-[#5ba0d8]">
                            <IconSend className="w-3 h-3" aria-hidden />
                            Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500">
                            <IconMinus className="w-3 h-3" aria-hidden />
                            Not sent
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-500">
                          {platformIcon(row.reviewStatus.platform, 'w-3.5 h-3.5')}
                          {row.reviewStatus.platform}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {showResolve && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700 dark:bg-[#2e0a0a] dark:text-[#E24B4A]">
                              <IconAlertTriangle className="w-3 h-3" aria-hidden />
                              Resolve first
                            </span>
                          )}
                          {showCheckIn && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-[#2a1f08] dark:text-[#BA7517]">
                              <IconClock className="w-3 h-3" aria-hidden />
                              Check in
                            </span>
                          )}
                          {reviewReady && (
                            <button
                              type="button"
                              onClick={() =>
                                updateReviewStatus(row.guestId, { sent: true })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-50 dark:border-[#1D9E75] dark:text-[#1D9E75] dark:hover:bg-[#0a2e1f]"
                            >
                              <IconStar className="w-3 h-3" aria-hidden />
                              Ask for review
                            </button>
                          )}
                          {!reviewReady &&
                            !row.reviewStatus.sent &&
                            !row.reviewStatus.posted && (
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-2 py-0.5 text-[11px] text-emerald-700 opacity-40 dark:border-[#1D9E75] dark:text-[#1D9E75]"
                              >
                                <IconStar className="w-3 h-3" aria-hidden />
                                Ask for review
                              </button>
                            )}
                          {row.reviewStatus.sent && !row.reviewStatus.posted && (
                            <button
                              type="button"
                              onClick={() =>
                                updateReviewStatus(row.guestId, { posted: true })
                              }
                              className="rounded-lg border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
                            >
                              Mark posted
                            </button>
                          )}
                          {row.reviewStatus.posted && (
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
                            >
                              View review
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openGuestChat(row.guestId)}
                            className="rounded-lg border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
                          >
                            View chat
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
      </StaffModuleBody>
    </div>
  );
}
