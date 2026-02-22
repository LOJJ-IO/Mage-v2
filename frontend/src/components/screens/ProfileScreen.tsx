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
  } = useMageStore();

  // Swipe gesture for navigation
  const { handlers: swipeHandlers } = useSwipeGesture({
    onSwipeRight: () => {
      transition('BACK');
    },
    threshold: 80,
  });

  const handleBack = () => {
    transition('BACK');
  };

  const handleContactFrontDesk = () => {
    transition('CONTACT_FRONT_DESK');
  };

  // Format date
  const formatDate = (date: Date | string): string => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

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
      className="min-h-screen bg-mage-gray-50 flex flex-col"
      {...swipeHandlers}
    >
      {/* Recording toast */}
      <RecordingToast isVisible={recording.isRecording} />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-mage-gray-200 safe-area-top">
        <div className="px-4 py-3 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-full hover:bg-mage-gray-100 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M19 12H5M12 19l-7-7 7-7"
                stroke="#000"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h1 className="text-xl font-semibold">Profile</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 space-y-4">
        {/* Guest info card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-uber-xl p-6 shadow-uber"
        >
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-mage-black rounded-2xl flex items-center justify-center text-white text-2xl font-semibold">
              {guestProfile?.name
                ? guestProfile.name.charAt(0).toUpperCase()
                : 'G'}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-mage-black">
                {guestProfile?.name || 'Guest'}
              </h2>
              <p className="text-mage-gray-500">
                Room {guestProfile?.roomNumber || '---'}
              </p>
            </div>
          </div>

          {/* Stay details */}
          <div className="space-y-3">
            <div className="flex justify-between items-center py-3 border-t border-mage-gray-100">
              <span className="text-mage-gray-500">Check-in</span>
              <span className="font-medium">
                {guestProfile?.checkIn
                  ? formatDate(guestProfile.checkIn)
                  : '---'}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-t border-mage-gray-100">
              <span className="text-mage-gray-500">Check-out</span>
              <span className="font-medium">
                {guestProfile?.checkOut
                  ? formatDate(guestProfile.checkOut)
                  : '---'}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-t border-mage-gray-100">
              <span className="text-mage-gray-500">Booking ID</span>
              <span className="font-mono text-sm text-mage-gray-600">
                {guestProfile?.bookingId || '---'}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Active ticket card */}
        {activeTicket && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="bg-mage-blue/10 rounded-uber-xl p-4 border border-mage-blue/20"
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
                <p className="font-medium text-mage-black">Active Request</p>
                <p className="text-sm text-mage-gray-600 mt-1">
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
          className="bg-white rounded-uber-xl p-4 shadow-uber"
        >
          <h3 className="font-semibold text-mage-black mb-4">Quick Actions</h3>
          <div className="space-y-2">
            {/* Contact Front Desk button */}
            <button
              onClick={handleContactFrontDesk}
              className="
                w-full flex items-center gap-4 p-4
                bg-mage-gray-50 rounded-uber-lg
                hover:bg-mage-gray-100 active:scale-[0.99]
                transition-all
              "
            >
              <div className="relative">
                <div className="w-12 h-12 bg-mage-black rounded-xl flex items-center justify-center text-white">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                {/* Notification dot for agent available */}
                {context.agentNotificationPending && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-mage-blue rounded-full border-2 border-white"
                  />
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-mage-black">
                  Contact Front Desk
                </p>
                <p className="text-sm text-mage-gray-500">
                  {context.humanAgentAvailable
                    ? 'Agent available now'
                    : 'AI assistance available'}
                </p>
              </div>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M7.5 15l5-5-5-5"
                  stroke="#757575"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Check Out */}
            <button
              className="
                w-full flex items-center justify-center gap-2 p-4
                bg-mage-black text-white rounded-uber-lg
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
      </main>
    </motion.div>
  );
}
