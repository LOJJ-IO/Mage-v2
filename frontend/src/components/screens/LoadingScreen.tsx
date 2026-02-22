'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';

const LOADING_TIPS = [
  'Setting up your experience...',
  'First time running the backend? The transcription model can take ~15 minutes to download.',
  'If the app is stuck, try refreshing the page.',
  'Hold the mic to record; tap Cancel or Send when you’re done.',
  'Swipe left to open your profile and room details.',
  'You can attach photos before sending a message.',
  'Contact Front Desk from your profile when you need help.',
  'Voice messages are transcribed into text automatically.',
];

const TIP_ROTATE_MS = 4000;
const LOAD_COMPLETE_MS = 2000;
const SAFETY_TIMEOUT_MS = 25000; // Force-complete so we never hang forever

export function LoadingScreen() {
  const { transition, setContext, context } = useMageStore();
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    // Returning user: skip loading and go straight to chat
    if (context.hasSeenWelcome) {
      useMageStore.setState({ currentState: 'S-G-003' });
      return;
    }

    const complete = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setContext({ hasSeenWelcome: false });
      transition('LOAD_COMPLETE');
    };

    // Simulate loading progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 100;
        return prev + Math.random() * 15;
      });
    }, 200);

    // Normal completion after animation
    const timeout = setTimeout(complete, LOAD_COMPLETE_MS);

    // Safety: force completion so we never wait forever (e.g. slow network, chunk timeout)
    const safetyTimeout = setTimeout(complete, SAFETY_TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      clearTimeout(safetyTimeout);
    };
  }, [transition, setContext, context.hasSeenWelcome]);

  // Rotate tips while loading
  useEffect(() => {
    const tipInterval = setInterval(() => {
      setTipIndex((i) => (i + 1) % LOADING_TIPS.length);
    }, TIP_ROTATE_MS);
    return () => clearInterval(tipInterval);
  }, []);

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

      {/* Rotating tip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-white/40 text-sm mt-4 max-w-[280px] text-center min-h-[2.5rem] flex items-center justify-center"
      >
        <AnimatePresence mode="wait">
          <motion.p
            key={tipIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
          >
            {LOADING_TIPS[tipIndex]}
          </motion.p>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
