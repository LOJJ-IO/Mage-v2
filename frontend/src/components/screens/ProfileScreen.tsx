'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { useRecording } from '@/components/providers/RecordingProvider';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';

export function ProfileScreen() {
  const {
    transition,
    guestProfile,
    setGuestProfile,
    context,
    recording,
    setRecording,
    activeTicket,
    theme,
    setTheme,
  } = useMageStore();
  const { stopRecording } = useRecording();

  // Modal states
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  const [bookingIdCopied, setBookingIdCopied] = useState(false);

  const { handlers: swipeHandlers } = useSwipeGesture({
    onSwipeRight: () => transition('BACK'),
    threshold: 80,
  });

  const handleBack = () => transition('BACK');

  const handleContactFrontDesk = async () => {
    if (recording.isRecording) {
      const blob = await stopRecording();
      setRecording({ isRecording: false, audioBlob: blob });
      transition('SEND_RECORDING_FROM_PROFILE');
      transition('CONTACT_FRONT_DESK');
    } else {
      transition('CONTACT_FRONT_DESK');
    }
  };

  const handleCheckOut = async () => {
    if (recording.isRecording) {
      const blob = await stopRecording();
      setRecording({ isRecording: false, audioBlob: blob });
      transition('SEND_RECORDING_FROM_PROFILE');
    }
    setShowCheckoutConfirm(true);
  };

  const confirmCheckOut = () => {
    setShowCheckoutConfirm(false);
    setTimeout(() => {
      setShowProfileSwitcher(true);
    }, 300); // Wait for first modal to animate out
  };

  const switchProfile = (profileId: 'alex' | 'sarah') => {
    const now = new Date();
    
    if (profileId === 'alex') {
      setGuestProfile({
        id: 'guest-001',
        name: 'Alex Johnson',
        roomNumber: '412',
        checkIn: new Date(now.getTime() - 86400000), // 1 day ago
        checkOut: new Date(now.getTime() + 86400000 * 4), // 4 days from now
        bookingId: 'BK-2026-0412',
        membershipTier: 'Platinum',
        email: 'alex.johnson@email.com',
        phone: '+1 555-0123',
      });
    } else {
      setGuestProfile({
        id: 'guest-002',
        name: 'Sarah Williams',
        roomNumber: '305',
        checkIn: new Date(now.getTime() - 86400000 * 2), // 2 days ago
        checkOut: new Date(now.getTime() + 86400000 * 1), // 1 day from now
        bookingId: 'BK-2026-0305',
        membershipTier: 'Gold',
        email: 'sarah.w@email.com',
        phone: '+1 555-0456',
      });
    }
    
    setShowProfileSwitcher(false);
    transition('BACK'); // Go back to chat with new profile
  };

  const formatShortDate = (date: Date | string): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };
  
  const formatYear = (date: Date | string): string => {
    return new Date(date).getFullYear().toString();
  };

  // Calculate days remaining for warning modal
  const getDaysRemaining = () => {
    if (!guestProfile?.checkOut) return 0;
    const checkOutDate = new Date(guestProfile.checkOut);
    const today = new Date();
    const diffTime = checkOutDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysLeft = getDaysRemaining();
  const nameParts = (guestProfile?.name || 'Guest').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Guest';
  const lastName = nameParts.slice(1).join(' ') || '';

  const handleCopyBookingId = async () => {
    const bookingId = guestProfile?.bookingId;
    if (!bookingId) return;
    try {
      await navigator.clipboard.writeText(bookingId);
      setBookingIdCopied(true);
      window.setTimeout(() => setBookingIdCopied(false), 2000);
    } catch {
      // no-op
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className="min-h-screen bg-mage-gray-50 dark:bg-mage-gray-900 flex flex-col relative"
      {...swipeHandlers}
    >
      {/* Check Out Warning Modal */}
      <AnimatePresence>
        {showCheckoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCheckoutConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-mage-gray-800 rounded-[28px] p-6 shadow-2xl"
            >
              <div className="w-12 h-12 bg-mage-gray-100 dark:bg-mage-gray-700 rounded-full flex items-center justify-center mb-4">
                <span className="text-xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-mage-black dark:text-white mb-2">
                Leaving so soon?
              </h3>
              <p className="text-mage-gray-600 dark:text-mage-gray-300 mb-6">
                You still have <strong>{daysLeft > 0 ? `${daysLeft} days` : 'less than a day'}</strong> left until your scheduled checkout on {guestProfile?.checkOut ? formatShortDate(guestProfile.checkOut) : 'your checkout date'}. Are you sure you want to check out right now?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCheckoutConfirm(false)}
                  className="flex-1 py-3 px-4 bg-mage-gray-100 dark:bg-mage-gray-700 text-mage-black dark:text-white font-semibold rounded-xl active:scale-[0.98] transition-transform"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCheckOut}
                  className="flex-1 py-3 px-4 bg-mage-black dark:bg-mage-gray-100 text-white dark:text-mage-black font-semibold rounded-xl active:scale-[0.98] transition-transform"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Switch Demo Profile Modal */}
      <AnimatePresence>
        {showProfileSwitcher && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-mage-gray-800 rounded-[28px] p-6 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-mage-black dark:text-white mb-2">
                Checked Out Successfully
              </h3>
              <p className="text-mage-gray-600 dark:text-mage-gray-300 mb-6 text-sm">
                For demo purposes, please select a new guest profile to simulate a new stay.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => switchProfile('alex')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-mage-gray-100 dark:border-mage-gray-700 hover:border-mage-blue transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-[#D9D9D9] rounded-full flex items-center justify-center font-bold text-black">A</div>
                  <div>
                    <p className="font-bold text-mage-black dark:text-white">Alex Johnson</p>
                    <p className="text-xs text-mage-gray-500">Room 412 • Platinum</p>
                  </div>
                </button>
                <button
                  onClick={() => switchProfile('sarah')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-mage-gray-100 dark:border-mage-gray-700 hover:border-mage-blue transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-[#D9D9D9] rounded-full flex items-center justify-center font-bold text-black">S</div>
                  <div>
                    <p className="font-bold text-mage-black dark:text-white">Sarah Williams</p>
                    <p className="text-xs text-mage-gray-500">Room 305 • Gold</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
        {/* Guest overview card */}
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
              <div className="flex items-center gap-2">
                <p className="font-mono text-xl font-normal text-black dark:text-white">
                  {guestProfile?.bookingId || '---'}
                </p>
                {guestProfile?.bookingId && (
                  <button
                    type="button"
                    onClick={() => void handleCopyBookingId()}
                    aria-label={bookingIdCopied ? 'Booking ID copied' : 'Copy booking ID'}
                    title={bookingIdCopied ? 'Copied!' : 'Copy booking ID'}
                    className="p-1.5 rounded-lg text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  >
                    {bookingIdCopied ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                    )}
                  </button>
                )}
              </div>
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

        {/* Active ticket card */}
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

        {/* Quick actions */}
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
              className="group w-full flex items-center gap-4 p-4 rounded-uber-lg transition-all bg-mage-gray-50 dark:bg-mage-gray-700 hover:bg-mage-gray-100 dark:hover:bg-[#404040] active:scale-[0.99]"
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
              onClick={handleCheckOut}
              className="w-full flex items-center justify-center gap-2 p-4 bg-mage-black dark:bg-mage-gray-100 text-white dark:text-mage-black rounded-uber-lg hover:opacity-90 active:scale-[0.99] transition-all font-semibold"
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
              className="relative w-12 h-7 rounded-full bg-mage-gray-200 dark:bg-mage-gray-600 transition-colors duration-200"
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