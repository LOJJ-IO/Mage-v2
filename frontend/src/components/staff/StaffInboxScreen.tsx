'use client';

import { motion } from 'framer-motion';
import { StaffAction } from '@/types';
import {
  actionTypeBadgeClass,
  actionTypeLabel,
  escalationBadgeClass,
  escalationLabel,
  formatRelativeTime,
  statusDotClass,
} from './actionBadges';

interface StaffInboxScreenProps {
  actions: StaffAction[];
  isLoading: boolean;
  pendingCount: number;
  onSelect: (id: string) => void;
  onLogout: () => void;
}

export function StaffInboxScreen({
  actions,
  isLoading,
  pendingCount,
  onSelect,
  onLogout,
}: StaffInboxScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col min-h-screen bg-white dark:bg-mage-gray-900 max-w-md mx-auto"
    >
      <header className="sticky top-0 z-10 bg-white dark:bg-mage-gray-900 border-b border-mage-gray-200 dark:border-mage-gray-700 px-4 py-4 safe-area-top">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex items-center justify-between"
        >
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <h1 className="text-xl font-semibold text-mage-black dark:text-white">Staff inbox</h1>
            <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400">
              {pendingCount} pending
            </p>
          </motion.div>
          <motion.button
            type="button"
            onClick={onLogout}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            whileTap={{ scale: 0.96 }}
            className="text-sm text-mage-gray-500 dark:text-mage-gray-400 px-3 py-1.5 rounded-uber-lg border border-mage-gray-200 dark:border-mage-gray-700"
          >
            Log out
          </motion.button>
        </motion.div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-8">
        {isLoading && actions.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-uber-xl bg-mage-gray-100 dark:bg-mage-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : actions.length === 0 ? (
          <p className="text-center text-mage-gray-500 dark:text-mage-gray-400 py-12 text-sm">
            No flagged actions yet. Guest requests will appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {actions.map((action, index) => (
              <motion.li
                key={action.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(action.id)}
                  className="w-full text-left flex items-start gap-3 p-4 rounded-uber-xl border border-mage-gray-200 dark:border-mage-gray-700 bg-white dark:bg-mage-gray-900 hover:bg-mage-gray-50 dark:hover:bg-mage-gray-800 transition-colors"
                >
                  <span
                    className={`mt-1.5 w-4 h-4 rounded-full flex-shrink-0 ${statusDotClass(action.status)}`}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-medium text-mage-black dark:text-white truncate ${
                        action.status === 'resolved' ? 'line-through opacity-60' : ''
                      }`}
                    >
                      {action.summary}
                    </p>
                    <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400 mt-0.5 truncate">
                      Room {action.roomNumber ?? '—'} · {action.guestName ?? action.guestId}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full ${actionTypeBadgeClass(action.actionType)}`}
                      >
                        {actionTypeLabel(action.actionType)}
                      </span>
                      {action.escalationType && action.escalationType !== 'normal' && (
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full ${escalationBadgeClass(action.escalationType)}`}
                        >
                          {escalationLabel(action.escalationType)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-mage-gray-400 flex-shrink-0">
                    {formatRelativeTime(action.createdAt)}
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </main>
    </motion.div>
  );
}
