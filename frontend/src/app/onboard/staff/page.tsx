'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppNavLink } from '@/components/AppNavLink';
import { IconMageLogo } from '@/components/staff/StaffIcons';
import { useAppNavigation } from '@/components/providers/NavigationLoaderProvider';
import { useNavigationReady } from '@/hooks/useNavigationReady';
import { apiClient } from '@/lib/api';
import { getNavigationCopy } from '@/lib/navigationLoaderCopy';
import { setStoredStaffKey } from '@/lib/stateMachineStaff';

type Tab = 'request' | 'sign-in';

type RequestState =
  | { phase: 'form' }
  | { phase: 'pending'; staffCode: string };

const ROLES = [
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'room_service', label: 'Room Service' },
  { value: 'manager', label: 'Manager' },
] as const;

export default function OnboardStaffPage() {
  const { navigate } = useAppNavigation();
  const [tab, setTab] = useState<Tab>('sign-in');

  useNavigationReady(true, '/onboard/staff');

  // --- Request access state ---
  const [requestState, setRequestState] = useState<RequestState>({ phase: 'form' });
  const [displayName, setDisplayName] = useState('');
  const [requestedRole, setRequestedRole] = useState('front_desk');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | undefined>();

  // --- Sign-in state ---
  const [accessKey, setAccessKey] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | undefined>();

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setRequestError(undefined);
    setRequestLoading(true);
    try {
      const res = await apiClient.requestStaffAccess(displayName, requestedRole);
      if (!res.success || !res.data) {
        setRequestError(res.error ?? 'Request failed. Please try again.');
        return;
      }
      setRequestState({ phase: 'pending', staffCode: res.data.staffCode });
    } finally {
      setRequestLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSignInError(undefined);
    setSignInLoading(true);
    try {
      const res = await apiClient.staffSignIn(accessKey.trim());
      if (!res.success || !res.data) {
        setSignInError(res.error ?? 'Sign in failed. Check your access key.');
        return;
      }
      setStoredStaffKey(accessKey.trim());
      navigate('/staff');
    } finally {
      setSignInLoading(false);
    }
  }

  return (
    <div className="staff-ui font-sans flex min-h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <IconMageLogo className="w-10 h-10" />
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Staff access
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Request access or sign in with your key
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 mb-4 gap-1">
          {(['sign-in', 'request'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                tab === t
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white',
              ].join(' ')}
            >
              {t === 'sign-in' ? 'Sign in' : 'Request access'}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm">
          <AnimatePresence mode="wait">
            {tab === 'sign-in' ? (
              <motion.form
                key="sign-in"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleSignIn}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="staff-access-key"
                    className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
                  >
                    Access key
                  </label>
                  <input
                    id="staff-access-key"
                    type="password"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    placeholder="Paste your access key"
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                  />
                </div>
                {signInError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{signInError}</p>
                )}
                <button
                  type="submit"
                  disabled={signInLoading || !accessKey.trim()}
                  className="w-full py-3 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {signInLoading ? 'Signing in…' : 'Continue'}
                </button>
                <p className="text-xs text-center text-neutral-400 dark:text-neutral-500">
                  Don&apos;t have a key?{' '}
                  <button
                    type="button"
                    onClick={() => setTab('request')}
                    className="underline hover:text-neutral-700 dark:hover:text-neutral-300"
                  >
                    Request access
                  </button>
                </p>
              </motion.form>
            ) : requestState.phase === 'pending' ? (
              <motion.div
                key="confirmation"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-center space-y-4"
              >
                <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto">
                  <svg
                    className="w-6 h-6 text-neutral-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">
                    Your Staff ID
                  </p>
                  <p className="text-3xl font-mono font-bold tracking-widest text-neutral-900 dark:text-white">
                    {requestState.staffCode}
                  </p>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Your request is <strong>pending approval</strong>. Share your Staff ID
                  with your manager. Once approved, you&apos;ll receive an access key to
                  sign in.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('sign-in')}
                  className="text-sm text-neutral-500 underline hover:text-neutral-900 dark:hover:text-white"
                >
                  Sign in with access key
                </button>
              </motion.div>
            ) : (
              <motion.form
                key="request"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleRequest}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="display-name"
                    className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
                  >
                    Your name
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Jordan Smith"
                    autoComplete="name"
                    className="w-full px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="requested-role"
                    className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
                  >
                    Role
                  </label>
                  <select
                    id="requested-role"
                    value={requestedRole}
                    onChange={(e) => setRequestedRole(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {requestError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{requestError}</p>
                )}
                <button
                  type="submit"
                  disabled={requestLoading || !displayName.trim()}
                  className="w-full py-3 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {requestLoading ? 'Submitting…' : 'Request access'}
                </button>
                <p className="text-xs text-center text-neutral-400 dark:text-neutral-500">
                  Already have a key?{' '}
                  <button
                    type="button"
                    onClick={() => setTab('sign-in')}
                    className="underline hover:text-neutral-700 dark:hover:text-neutral-300"
                  >
                    Sign in
                  </button>
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <AppNavLink
          href="/onboard"
          copy={getNavigationCopy('/onboard')}
          className="mt-6 block text-center text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white underline"
        >
          Change role
        </AppNavLink>
      </motion.div>
    </div>
  );
}
