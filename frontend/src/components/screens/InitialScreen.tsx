'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';

/** Skeleton that matches InitialScreen layout; shown briefly after the loader. */
function InitialScreenSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-mage-gray-900 flex flex-col">
      <div className="h-[45vh] bg-mage-gray-200 dark:bg-mage-gray-700 animate-pulse" />
      <div className="flex-1 px-6 py-8 space-y-4">
        <div className="h-8 bg-mage-gray-200 dark:bg-mage-gray-700 rounded-lg w-3/4 animate-pulse" />
        <div className="h-4 bg-mage-gray-100 dark:bg-mage-gray-800 rounded-lg w-full animate-pulse" />
        <div className="h-4 bg-mage-gray-100 dark:bg-mage-gray-800 rounded-lg w-full animate-pulse" />
        <div className="h-4 bg-mage-gray-100 dark:bg-mage-gray-800 rounded-lg w-5/6 animate-pulse" />
        <div className="pt-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="w-12 h-12 bg-mage-gray-200 dark:bg-mage-gray-700 rounded-uber-lg flex-shrink-0 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-mage-gray-200 dark:bg-mage-gray-700 rounded-lg w-1/3 animate-pulse" />
                <div className="h-3 bg-mage-gray-100 dark:bg-mage-gray-800 rounded-lg w-2/3 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto pt-6">
          <div className="h-14 bg-mage-gray-200 dark:bg-mage-gray-700 rounded-uber-full w-full animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function InitialScreen() {
  const { transition, setContext, guestProfile } = useMageStore();
  const [showSkeleton, setShowSkeleton] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSkeleton(false), 200);
    return () => clearTimeout(t);
  }, []);

  const handleContinue = () => {
    setContext({ hasSeenWelcome: true });
    transition('CONTINUE');
  };

  if (showSkeleton) {
    return <InitialScreenSkeleton />;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-mage-gray-900 flex flex-col">
      {/* Header illustration */}
      <div className="relative h-[45vh] bg-mage-black overflow-hidden">
        {/* Abstract pattern */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#276EF1" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.circle
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            cx="300"
            cy="100"
            r="200"
            fill="url(#grad1)"
          />
          <motion.circle
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
            cx="100"
            cy="250"
            r="150"
            fill="url(#grad1)"
          />
        </svg>

        {/* Welcome icon */}
        <motion.div
          initial={{ scale: 0, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-uber-xl">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path
                d="M20 3.333L3.333 11.667v16.666L20 36.667l16.667-8.334V11.667L20 3.333z"
                stroke="#000"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3.333 11.667L20 20m0 16.667V20m16.667-8.333L20 20"
                stroke="#000"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="20" cy="20" r="3" fill="#000" />
            </svg>
          </div>
        </motion.div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-8 flex flex-col">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <h1 className="text-3xl font-semibold text-mage-black dark:text-white mb-3">
            Welcome{guestProfile?.name ? `, ${guestProfile.name.split(' ')[0]}` : ''}!
          </h1>
          <p className="text-lg text-mage-gray-500 dark:text-mage-gray-400 leading-relaxed">
            I&apos;m your personal hotel assistant. Ask me anything about your stay,
            request services, or get help with any issue.
          </p>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-8 space-y-4"
        >
          <FeatureItem
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            title="Chat anytime"
            description="Text or voice messages, 24/7"
          />
          <FeatureItem
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            title="Instant help"
            description="Connect with front desk when needed"
          />
          <FeatureItem
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            }
            title="Smart assistance"
            description="AI-powered responses for quick answers"
          />
        </motion.div>

        {/* CTA Button */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-auto pt-6"
        >
          <button
            onClick={handleContinue}
            className="
              w-full py-4 px-6
              bg-mage-black dark:bg-mage-gray-100 text-white dark:text-mage-black
              rounded-uber-full font-semibold text-lg
              active:scale-[0.98] transition-transform
              shadow-uber-lg
            "
          >
            Get Started
          </button>
        </motion.div>
      </div>
    </div>
  );
}

interface FeatureItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-12 h-12 bg-mage-gray-100 dark:bg-mage-gray-700 rounded-uber-lg flex items-center justify-center flex-shrink-0 text-mage-black dark:text-white">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-mage-black dark:text-white">{title}</h3>
        <p className="text-mage-gray-500 dark:text-mage-gray-400 text-sm">{description}</p>
      </div>
    </div>
  );
}
