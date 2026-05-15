'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col min-h-screen px-6 py-12 max-w-md mx-auto"
    >
      <h1 className="text-2xl font-semibold text-mage-black dark:text-white mb-2">Staff inbox</h1>
      <p className="text-mage-gray-500 dark:text-mage-gray-400 mb-8 text-sm">
        Enter your staff access key to view flagged guest requests.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Staff access key"
          className="w-full px-4 py-3 rounded-uber-xl border border-mage-gray-200 dark:border-mage-gray-700 bg-white dark:bg-mage-gray-900 text-mage-black dark:text-white focus:outline-none focus:ring-2 focus:ring-mage-blue"
          autoComplete="off"
        />
        {error && (
          <p className="text-sm text-mage-red">{error}</p>
        )}
        <button
          type="submit"
          className="w-full py-3.5 rounded-uber-full bg-mage-black dark:bg-white text-white dark:text-mage-black font-medium"
        >
          Continue
        </button>
      </form>
      <a
        href="/welcome"
        className="mt-8 text-center text-sm text-mage-gray-500 dark:text-mage-gray-400 underline"
      >
        Back to welcome
      </a>
    </motion.div>
  );
}
