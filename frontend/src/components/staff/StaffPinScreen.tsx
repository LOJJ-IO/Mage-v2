'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AppNavLink } from '@/components/AppNavLink';
import { getNavigationCopy } from '@/lib/navigationLoaderCopy';
import { IconMageLogo } from './StaffIcons';

interface StaffPinScreenProps {
  onSubmit: (key: string) => void;
  error?: string;
}

export function StaffPinScreen({ onSubmit, error }: StaffPinScreenProps) {
  const [pin, setPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim()) onSubmit(pin.trim());
  };

  return (
    <div className="staff-ui font-sans flex min-h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <IconMageLogo className="w-10 h-10" />
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Staff sign in
            </h1>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="sr-only" htmlFor="staff-access-key">
            Access key
          </label>
          <input
            id="staff-access-key"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Access key"
            className="w-full px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
            autoComplete="off"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Continue
          </button>
        </form>
        <AppNavLink
          href="/"
          copy={getNavigationCopy('/')}
          className="mt-6 block text-center text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white underline"
        >
          Back
        </AppNavLink>
      </motion.div>
    </div>
  );
}
