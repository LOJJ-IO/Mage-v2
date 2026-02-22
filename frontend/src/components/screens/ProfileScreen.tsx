'use client';

import { motion } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { RecordingToast } from '@/components/Toast';

export function ProfileScreen() {
  const {
    transition,
    guestProfile,
    context,
    recording,
    activeTicket,
    theme,
    setTheme,
  } = useMageStore();

  const { handlers: swipeHandlers } = useSwipeGesture({
    onSwipeRight: () => transition('BACK'),
    threshold: 80,
  });

  const handleBack = () => transition('BACK');
  const handleContactFrontDesk = () => transition('CONTACT_FRONT_DESK');

  const formatShortDate = (date: Date | string): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };
  const formatYear = (date: Date | string): string => {
    return new Date(date).getFullYear().toString();
  };

  const nameParts = (guestProfile?.name || 'Guest').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Guest';
  const lastName = nameParts.slice(1).join(' ') || '';

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{
        type: 'tween',
        duration: 0.32,
        ease: [0.32, 0.72, 0, 1],
      }}
      className="min-h-screen bg-mage-gray-50 dark:bg-mage-gray-900 flex flex-col"
      {...swipeHandlers}
    >
      <RecordingToast isVisible={recording.isRecording} />

      <header className="sticky top-0 z-40 bg-white dark:bg-mage-gray-900 border-b border-mage-gray-200 dark:border-mage-gray-700 safe-area-top">
        <div className="px-4 py-3 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-full hover:bg-mage-gray-100 dark:hover:bg-mage-gray-800 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M19 12H5M12 19l-7-7 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-mage-black dark:text-white">
            Profile
          </h1>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {/* Guest overview card — wide, large top-left curve, light gray, pill badge */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="relative w-full overflow-visible shadow-none border-0 bg-[#D9D9D9] dark:bg-mage-gray-700 rounded-tr-[28px] rounded-bl-[28px] rounded-tl-[48px]"
          style={{ borderBottomRightRadius: '41px' }}
        >
          <div className="flex flex-col gap-6 pr-[calc(183px+1rem)] min-h-[140px] px-6 pt-5 pb-[52px]">
            <div>
              <h2 className="text-[3rem] sm:text-[3.25rem] leading-tight font-bold text-black dark:text-white">
                {firstName}
              </h2>
              {lastName && (
                <h2 className="text-[3rem] sm:text-[3.25rem] leading-tight font-bold text-black dark:text-white">
                  {lastName}
                </h2>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-12">
              <div>
                <p className="text-base font-normal text-black dark:text-mage-gray-300">
                  Check out:
                </p>
                <p className="text-xl font-normal text-black dark:text-white">
                  {guestProfile?.checkOut
                    ? formatShortDate(guestProfile.checkOut)
                    : '---'}
                </p>
                {guestProfile?.checkOut && (
                  <p className="text-xl font-normal text-black dark:text-white">
                    {formatYear(guestProfile.checkOut)}
                  </p>
                )}
              </div>
              <div className="ml-auto">
                <p className="text-base font-normal text-black dark:text-mage-gray-300">
                  Room:
                </p>
                <p className="text-xl font-normal text-black dark:text-white">
                  {guestProfile?.roomNumber || '---'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-base font-normal text-black dark:text-mage-gray-300">
                Booking ID
              </p>
              <p className="font-mono text-xl font-normal text-black dark:text-white">
                {guestProfile?.bookingId || '---'}
              </p>
            </div>
          </div>
          {guestProfile?.membershipTier && (
            <div
              className="absolute bottom-0 right-0 flex items-center justify-center font-bold text-black w-[183px] h-[52px]"
              style={{
                backgroundColor: '#96D0FF',
                borderTopLeftRadius: '38px',
                borderTopRightRadius: 0,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: '41px',
              }}
            >
              <span className="text-[32px] leading-none">
                {guestProfile.membershipTier}
              </span>
            </div>
          )}
        </motion.div>

        {/* Active ticket card (unchanged) */}
        {activeTicket && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="bg-mage-blue/10 dark:bg-mage-blue/20 rounded-uber-xl p-4 border border-mage-blue/20 dark:border-mage-blue/30"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-mage-blue rounded-xl flex items-center justify-center text-white">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M17.5 10a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M10 6.25v3.75l2.5 1.25"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-mage-black dark:text-white">
                  Active Request
                </p>
                <p className="text-sm text-mage-gray-600 dark:text-mage-gray-400 mt-1">
                  {activeTicket.issue || 'Your request is being processed'}
                </p>
                <p className="text-xs text-mage-blue mt-2">
                  Status: {activeTicket.status}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick actions (unchanged) */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-mage-gray-800 rounded-uber-xl p-4 shadow-uber"
        >
          <h3 className="font-semibold text-mage-black dark:text-white mb-4">
            Quick Actions
          </h3>
          <div className="space-y-2">
            <button
              onClick={handleContactFrontDesk}
              className="group w-full flex items-center gap-4 p-4 rounded-uber-lg transition-all
                bg-mage-gray-50 dark:bg-mage-gray-700
                hover:bg-mage-gray-100 dark:hover:bg-[#404040] active:scale-[0.99]"
            >
              <div className="relative md:self-end">
                <div className="w-12 h-12 bg-mage-black dark:bg-mage-gray-600 rounded-xl flex items-center justify-center text-white">
                  <span className="inline-block origin-top group-hover:animate-bell-ring" style={{ transformOrigin: '50% 20%' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
                {context.agentNotificationPending && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-mage-blue rounded-full border-2 border-white dark:border-mage-gray-800"
                  />
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-mage-black dark:text-white">
                  Contact Front Desk
                </p>
                <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400">
                  {context.humanAgentAvailable
                    ? 'Agent available now'
                    : 'AI assistance available'}
                </p>
              </div>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M7.5 15l5-5-5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className="
                w-full flex items-center justify-center gap-2 p-4
                bg-mage-black dark:bg-mage-gray-100 text-white dark:text-mage-black rounded-uber-lg
                hover:opacity-90 active:scale-[0.99]
                transition-all font-semibold
              "
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Check Out
            </button>
          </div>
        </motion.div>

        {/* Light / Dark mode toggle */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="bg-white dark:bg-mage-gray-800 rounded-uber-xl p-4 shadow-uber"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-mage-black dark:text-white">
              Appearance
            </span>
            <button
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="
                relative w-12 h-7 rounded-full
                bg-mage-gray-200 dark:bg-mage-gray-600
                transition-colors duration-200
              "
            >
              <span
                className={`
                  absolute top-1 left-1 w-5 h-5 rounded-full
                  bg-white dark:bg-mage-gray-300 shadow-uber
                  transition-transform duration-200 ease-uber
                  flex items-center justify-center
                  ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}
                `}
              >
                {theme === 'dark' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3a9 9 0 109 9c-.53 0-1.04-.08-1.54-.22A6.5 6.5 0 0112 3.5V3z" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3V1h2v2h-2zm0 18v2h2v-2h-2zM5 12H3v2h2v-2zm16 0h-2v2h2v-2zM6.34 6.34L4.93 4.93l1.41 1.41 1.41-1.41zm12.73 12.73l-1.41-1.41 1.41-1.41 1.41 1.41zM12 7a5 5 0 015 5 5 5 0 01-5 5 5 5 0 01-5-5 5 5 0 015-5z" />
                  </svg>
                )}
              </span>
            </button>
          </div>
          <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400 mt-1">
            {theme === 'dark' ? 'Dark mode' : 'Light mode'}
          </p>
        </motion.div>
      </main>
    </motion.div>
  );
}
