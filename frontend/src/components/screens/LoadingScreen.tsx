'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';

export function LoadingScreen() {
  const { transition, setContext, context } = useMageStore();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Returning user: skip loading and go straight to chat
    if (context.hasSeenWelcome) {
      useMageStore.setState({ currentState: 'S-G-003' });
      return;
    }

    // Simulate loading progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    // Complete loading after animation
    const timeout = setTimeout(() => {
      setContext({ hasSeenWelcome: false });
      transition('LOAD_COMPLETE');
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [transition, setContext, context.hasSeenWelcome]);

  return (
    <div className="min-h-screen bg-mage-black flex flex-col items-center justify-center p-8">
      {/* Logo */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="mb-12"
      >
        <div className="relative">
          {/* Glow effect */}
          <motion.div
            animate={{
              opacity: [0.5, 0.8, 0.5],
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 bg-white/20 rounded-full blur-xl"
          />
          
          {/* Logo icon */}
          <div className="relative w-24 h-24 bg-white rounded-[28px] flex items-center justify-center">
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              className="text-mage-black"
            >
              <path
                d="M24 4L4 14v20l20 10 20-10V14L24 4z"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 14l20 10M24 44V24M44 14l-20 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="24" cy="24" r="4" fill="currentColor" />
            </svg>
          </div>
        </div>
      </motion.div>

      {/* Brand name */}
      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-white text-4xl font-semibold tracking-tight mb-4"
      >
        mage
      </motion.h1>

      {/* Tagline */}
      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-white/60 text-lg mb-12"
      >
        Your hotel assistant
      </motion.p>

      {/* Progress bar */}
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: '200px', opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="h-1 bg-white/20 rounded-full overflow-hidden"
      >
        <motion.div
          className="h-full bg-white rounded-full"
          style={{ width: `${Math.min(progress, 100)}%` }}
          transition={{ duration: 0.2 }}
        />
      </motion.div>

      {/* Loading text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-white/40 text-sm mt-4"
      >
        Setting up your experience...
      </motion.p>
    </div>
  );
}
