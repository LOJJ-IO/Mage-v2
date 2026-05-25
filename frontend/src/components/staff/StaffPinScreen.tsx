'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
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
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950 px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <IconMageLogo className="w-10 h-10" />
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Staff workspace
            </h1>
            <p className="text-sm text-neutral-500">Mage Hotel</p>
          </div>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 mb-6 text-sm">
          Enter your staff access key to open the task board and manage guest requests.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Access key
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Staff access key"
            className="w-full px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
            autoComplete="off"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Continue to board
          </button>
        </form>
        <a
          href="/welcome"
          className="mt-6 block text-center text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white underline"
        >
          Back to welcome
        </a>
      </motion.div>
    </div>
  );
}
