'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type IntroSplashLoaderProps = {
  className?: string;
  title?: string;
  description?: string;
  tagline?: string;
};

export function IntroSplashLoader({
  className,
  title = 'Lojj',
  description = 'Getting your stay ready.',
  tagline = 'Your hotel companion, one tap away.',
}: IntroSplashLoaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center bg-[#ECEAE6] dark:bg-mage-gray-900 px-8 text-center',
        className
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="max-w-xs"
      >
        <motion.div
          animate={{ opacity: [0.72, 1, 0.72] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/70 dark:bg-mage-gray-800 shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-none"
        >
          <span className="font-heading text-2xl font-semibold text-mage-black dark:text-white">
            L
          </span>
        </motion.div>

        <h1 className="font-heading text-5xl font-semibold tracking-tight text-mage-black dark:text-white mb-3">
          {title}
        </h1>
        <p className="text-base text-mage-gray-600 dark:text-mage-gray-300 mb-2">
          {description}
        </p>
        <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400">{tagline}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="mt-10 flex items-center gap-2"
        aria-hidden
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-mage-gray-400 dark:bg-mage-gray-500"
            animate={{ opacity: [0.35, 1, 0.35], y: [0, -3, 0] }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.18,
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}
