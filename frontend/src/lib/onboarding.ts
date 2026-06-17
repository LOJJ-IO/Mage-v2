/**
 * Session bootstrap helpers shared across onboarding entry points.
 *
 * Deliberately thin: no UI, no side-effects beyond reading storage/API.
 * Import from page-level components only (client-side).
 */
import { apiClient } from '@/lib/api';
import { getStoredStaffKey } from '@/lib/stateMachineStaff';

/**
 * True when NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN=true.
 * Evaluated at build time — zero runtime cost.
 * When true, the guest app root shows the legacy inline SignInScreen
 * (email-based dev sign-in). In production leave this unset or false.
 */
export const ALLOW_DEV_LOGIN =
  process.env.NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN === 'true';

/**
 * Returns true if the current browser session has an authenticated guest.
 * Checks sessionStorage first (fast, synchronous), then falls back to an
 * API session probe (one round-trip).
 *
 * Safe to call before the Zustand store has hydrated — reads raw storage.
 */
export async function checkGuestSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (sessionStorage.getItem('mage-guest-id')) return true;

  try {
    const res = await apiClient.getAuthSession();
    return Boolean(res.success && res.data?.authenticated);
  } catch {
    return false;
  }
}

/**
 * Returns true if the browser session has a stored staff access key in sessionStorage.
 * Synchronous — safe to call in useEffect without await.
 */
export function hasStoredStaffKey(): boolean {
  return Boolean(getStoredStaffKey());
}
