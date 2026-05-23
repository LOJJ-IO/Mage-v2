'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaqItem } from '@/types';

interface FaqPanelProps {
  intro: string;
  items: FaqItem[];
  resolved?: boolean | null;
  onHelpful: () => void;
  onNeedHelp: () => void;
  disabled?: boolean;
}

export function FaqPanel({
  intro,
  items,
  resolved,
  onHelpful,
  onNeedHelp,
  disabled = false,
}: FaqPanelProps) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);
  const showActions = resolved == null && !disabled;

  return (
    <div className="w-full max-w-[85%] min-w-0">
      <p className="text-sm text-mage-gray-600 dark:text-mage-gray-300 mb-3 leading-relaxed">
        {intro}
      </p>
      <div className="rounded-uber-xl border border-mage-gray-200 dark:border-mage-gray-700 overflow-hidden bg-white dark:bg-mage-gray-800 shadow-sm">
        {items.map((item, index) => {
          const isOpen = openId === item.id;
          return (
            <div
              key={item.id}
              className={
                index > 0
                  ? 'border-t border-mage-gray-100 dark:border-mage-gray-700'
                  : ''
              }
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : item.id)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-mage-gray-50 dark:hover:bg-mage-gray-700/50 transition-colors"
              >
                <span className="font-medium text-sm text-mage-black dark:text-white">
                  {item.title}
                </span>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  className="text-mage-gray-400 shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 6l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-3 text-sm text-mage-gray-600 dark:text-mage-gray-300 leading-relaxed">
                      {item.body}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      {showActions && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs text-mage-gray-500 dark:text-mage-gray-400 text-center">
            Did this answer your question?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onHelpful}
              className="flex-1 px-4 py-2.5 rounded-uber-full text-sm font-medium bg-mage-black dark:bg-mage-gray-100 text-white dark:text-mage-black hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Yes, that helped
            </button>
            <button
              type="button"
              onClick={onNeedHelp}
              className="flex-1 px-4 py-2.5 rounded-uber-full text-sm font-medium bg-mage-gray-100 dark:bg-mage-gray-700 text-mage-black dark:text-white hover:bg-mage-gray-200 dark:hover:bg-mage-gray-600 active:scale-[0.98] transition-all"
            >
              I still need help
            </button>
          </div>
        </div>
      )}
      {resolved === true && (
        <p className="mt-3 text-xs text-mage-gray-500 dark:text-mage-gray-400 text-center">
          Marked as helpful
        </p>
      )}
      {resolved === false && (
        <p className="mt-3 text-xs text-mage-gray-500 dark:text-mage-gray-400 text-center">
          Escalated to Mage for more help
        </p>
      )}
    </div>
  );
}
