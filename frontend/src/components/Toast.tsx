'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { ToastType } from '@/types';

// Icons for toast types
const ToastIcon = ({ type }: { type: ToastType }) => {
  switch (type) {
    case 'success':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M16.667 5L7.5 14.167 3.333 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'error':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M15 5L5 15M5 5l10 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'warning':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 6.667v3.334M10 13.333h.008M8.576 3.233L1.51 15.042a1.667 1.667 0 001.424 2.5h14.132a1.667 1.667 0 001.424-2.5L11.424 3.233a1.667 1.667 0 00-2.848 0z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 13.333V10M10 6.667h.008M18.333 10a8.333 8.333 0 11-16.666 0 8.333 8.333 0 0116.666 0z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
};

// Background color for toast types
const getToastBg = (type: ToastType): string => {
  switch (type) {
    case 'success':
      return 'bg-mage-green';
    case 'error':
      return 'bg-mage-red';
    case 'warning':
      return 'bg-mage-yellow text-mage-black';
    case 'info':
    default:
      return 'bg-mage-black';
  }
};

export function ToastContainer() {
  const { toasts, removeToast } = useMageStore();

  return (
    <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
      <AnimatePresence mode="sync">
        {toasts.slice(0, 3).map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`
              ${getToastBg(toast.type)}
              px-4 py-3 rounded-uber-full shadow-uber-lg
              flex items-center gap-3
              text-white font-medium text-sm
              pointer-events-auto
              max-w-sm w-full
            `}
            onClick={() => removeToast(toast.id)}
          >
            <ToastIcon type={toast.type} />
            <span className="flex-1">{toast.message}</span>
            <button
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M12 4L4 12M4 4l8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Recording active toast (persistent while recording)
export function RecordingToast({ isVisible }: { isVisible: boolean }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-mage-red text-white px-4 py-2 rounded-uber-full shadow-uber-lg flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-sm font-medium">Recording active</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
