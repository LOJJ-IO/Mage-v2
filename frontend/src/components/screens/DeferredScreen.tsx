'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { useCreateTicket } from '@/hooks/useApi';

export function DeferredScreen() {
  const {
    transition,
    addToast,
    addMessage,
    setContext,
  } = useMageStore();

  const [issueText, setIssueText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createTicketMutation = useCreateTicket();

  // Handle submit
  const handleSubmit = async () => {
    if (!issueText.trim()) {
      addToast({
        type: 'warning',
        message: 'Please describe your issue',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await createTicketMutation.mutateAsync(issueText.trim());
      
      addToast({
        type: 'success',
        message: 'Request submitted! We\'ll notify you when an agent is available.',
      });

      // Add system message
      addMessage({
        role: 'system',
        content: 'Your request has been submitted to the front desk.',
      });

      // Reset context to BOT
      setContext({ conversationContext: 'BOT' });
      
      transition('CONTINUE');
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to submit request. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle skip
  const handleSkip = () => {
    addMessage({
      role: 'system',
      content: 'You can always contact the front desk from your profile.',
    });
    setContext({ conversationContext: 'BOT' });
    transition('CONTINUE');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-white flex flex-col"
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-mage-gray-200 safe-area-top">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-mage-black">
            Leave a Message
          </h1>
          <button
            onClick={handleSkip}
            className="text-mage-gray-500 font-medium"
          >
            Skip
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 flex flex-col">
        {/* Status message */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="w-16 h-16 bg-mage-yellow/20 rounded-2xl flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 10.667v5.333M16 21.333h.013M28 16a12 12 0 11-24 0 12 12 0 0124 0z"
                stroke="#996F00"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-mage-black mb-2">
            No agents available right now
          </h2>
          <p className="text-mage-gray-500 leading-relaxed">
            Leave us a message about your issue and we'll notify you as soon as
            an agent becomes available to help.
          </p>
        </motion.div>

        {/* Issue input */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex-1 flex flex-col"
        >
          <label className="text-sm font-medium text-mage-gray-600 mb-2">
            What do you need help with?
          </label>
          <textarea
            value={issueText}
            onChange={(e) => setIssueText(e.target.value)}
            placeholder="Describe your issue or request..."
            className="
              flex-1 min-h-[200px] p-4
              bg-mage-gray-50 rounded-uber-xl
              text-base font-medium resize-none
              placeholder:text-mage-gray-400
              focus:outline-none focus:ring-2 focus:ring-mage-black/10
              transition-all
            "
          />
          <p className="text-xs text-mage-gray-400 mt-2 text-right">
            {issueText.length} / 500 characters
          </p>
        </motion.div>

        {/* Submit button */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6"
        >
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !issueText.trim()}
            className={`
              w-full py-4 rounded-uber-full font-semibold text-lg
              transition-all active:scale-[0.98]
              ${
                issueText.trim()
                  ? 'bg-mage-black text-white'
                  : 'bg-mage-gray-200 text-mage-gray-400'
              }
            `}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M10 2v3M10 15v3M18 10h-3M5 10H2M15.66 15.66l-2.12-2.12M6.46 6.46L4.34 4.34M15.66 4.34l-2.12 2.12M6.46 13.54l-2.12 2.12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.span>
                Submitting...
              </span>
            ) : (
              'Submit Request'
            )}
          </button>
        </motion.div>

        {/* Notification info */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-4 flex items-center justify-center gap-2 text-mage-gray-500"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M12 5.333a4 4 0 00-8 0c0 4.667-2 6-2 6h12s-2-1.333-2-6zM9.153 14a1.333 1.333 0 01-2.306 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-sm">
            We'll notify you when an agent is ready
          </span>
        </motion.div>
      </main>
    </motion.div>
  );
}
