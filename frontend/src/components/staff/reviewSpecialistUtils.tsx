import type { ReactNode } from 'react';
import {
  IconBrandBooking,
  IconBrandGoogle,
  IconBrandTripadvisor,
  IconWorld,
} from '@tabler/icons-react';
import { StaffAction } from '@/types';

/** Backend default when a guest has no chat messages yet. */
export const VADER_DEFAULT_SCORE = 72;

export type ReviewSegment = 'all' | 'attention' | 'ready' | 'checked-out';

export type MoodKind = 'great' | 'good' | 'neutral' | 'frustrated' | 'upset';

export interface MoodInfo {
  kind: MoodKind;
  label: string;
  score: number;
}

export interface GuestReviewStatus {
  posted: boolean;
  sent: boolean;
  platform: string;
}

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-[#0f2940] dark:text-[#5ba0d8]',
  'bg-emerald-100 text-emerald-700 dark:bg-[#0a2e1f] dark:text-[#1D9E75]',
  'bg-amber-100 text-amber-800 dark:bg-[#2a1f08] dark:text-[#BA7517]',
  'bg-orange-100 text-orange-700 dark:bg-[#2e1208] dark:text-[#D85A30]',
  'bg-violet-100 text-violet-700 dark:bg-[#1a1840] dark:text-[#7F77DD]',
] as const;

export function guestInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function guestAvatarClass(guestId: string): string {
  let hash = 0;
  for (let i = 0; i < guestId.length; i += 1) {
    hash = (hash + guestId.charCodeAt(i) * (i + 1)) % AVATAR_PALETTE.length;
  }
  return AVATAR_PALETTE[hash];
}

export function resolveVaderScore(
  sentimentScores: Record<string, number>,
  guestId: string
): number {
  const score = sentimentScores[guestId];
  return score != null ? score : VADER_DEFAULT_SCORE;
}

export function scoreToMood(score: number): MoodInfo {
  if (score >= 85) return { kind: 'great', label: 'Happy', score };
  if (score >= 70) return { kind: 'good', label: 'Good', score };
  if (score >= 55) return { kind: 'neutral', label: 'Neutral', score };
  if (score >= 40) return { kind: 'frustrated', label: 'Frustrated', score };
  return { kind: 'upset', label: 'Upset', score };
}

export function moodPillClass(kind: MoodKind): string {
  switch (kind) {
    case 'great':
      return 'bg-emerald-100 text-emerald-800 dark:bg-[#0a2e1f] dark:text-[#1D9E75]';
    case 'good':
      return 'bg-lime-100 text-lime-800 dark:bg-[#152508] dark:text-[#639922]';
    case 'neutral':
      return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
    case 'frustrated':
      return 'bg-amber-100 text-amber-800 dark:bg-[#2a1f08] dark:text-[#BA7517]';
    case 'upset':
      return 'bg-red-100 text-red-700 dark:bg-[#2e0a0a] dark:text-[#E24B4A]';
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatCheckout(checkOut: Date): { label: string; urgency: 'urgent' | 'soon' | 'ok' } {
  const now = new Date();
  const today = startOfDay(now);
  const checkoutDay = startOfDay(checkOut);
  const diffDays = Math.round(
    (checkoutDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (diffDays < 0) {
    return {
      label: checkOut.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      urgency: 'ok',
    };
  }
  if (diffDays === 0) {
    const time = checkOut.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return { label: `Today ${time}`, urgency: 'urgent' };
  }
  if (diffDays === 1) {
    return { label: 'Tomorrow', urgency: 'soon' };
  }
  return {
    label: checkOut.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    urgency: 'ok',
  };
}

export function checkoutClass(urgency: 'urgent' | 'soon' | 'ok'): string {
  switch (urgency) {
    case 'urgent':
      return 'font-medium text-red-600 dark:text-[#E24B4A]';
    case 'soon':
      return 'text-amber-700 dark:text-[#BA7517]';
    default:
      return 'text-neutral-500 dark:text-neutral-500';
  }
}

export function defaultPlatform(guestId: string, platforms: string[]): string {
  if (platforms.length === 0) return 'Google';
  let hash = 0;
  for (let i = 0; i < guestId.length; i += 1) {
    hash = (hash + guestId.charCodeAt(i)) % platforms.length;
  }
  return platforms[hash];
}

export function platformIcon(platform: string, className = 'w-3.5 h-3.5'): ReactNode {
  const key = platform.toLowerCase();
  if (key.includes('google')) return <IconBrandGoogle className={className} aria-hidden />;
  if (key.includes('trip')) return <IconBrandTripadvisor className={className} aria-hidden />;
  if (key.includes('booking')) return <IconBrandBooking className={className} aria-hidden />;
  return <IconWorld className={className} aria-hidden />;
}

export function hasEscalatedPending(actions: StaffAction[]): boolean {
  return actions.some(
    (a) => a.status !== 'resolved' && a.escalationType === 'escalated'
  );
}

export function hasPendingRequests(actions: StaffAction[]): boolean {
  return actions.some((a) => a.status === 'pending');
}

export function needsAttention(mood: MoodInfo, actions: StaffAction[]): boolean {
  return mood.kind === 'upset' || mood.kind === 'frustrated' || hasEscalatedPending(actions);
}

export function isReviewReady(
  mood: MoodInfo,
  status: GuestReviewStatus | undefined,
  actions: StaffAction[]
): boolean {
  if (status?.posted || status?.sent) return false;
  if (needsAttention(mood, actions)) return false;
  return mood.score >= 75;
}

export function isCheckedOut(checkOut: Date): boolean {
  return startOfDay(checkOut).getTime() < startOfDay(new Date()).getTime();
}

export function matchesSegment(
  segment: ReviewSegment,
  mood: MoodInfo,
  status: GuestReviewStatus | undefined,
  actions: StaffAction[],
  checkOut: Date
): boolean {
  switch (segment) {
    case 'attention':
      return needsAttention(mood, actions);
    case 'ready':
      return isReviewReady(mood, status, actions);
    case 'checked-out':
      return isCheckedOut(checkOut);
    default:
      return true;
  }
}
