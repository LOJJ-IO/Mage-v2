'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { useCreateTicket } from '@/hooks/useApi';

export function ConnectionScreen() {
  const { transition, setContext, addMessage, addToast } = useMageStore();
  const createTicketMutation = useCreateTicket();
  const [frontDeskPhone, setFrontDeskPhone] = useState(
    () => process.env.NEXT_PUBLIC_HOTEL_FRONT_DESK_PHONE?.trim() || ''
  );
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (frontDeskPhone) return;
    let cancelled = false;
    (async () => {
      const { apiClient } = await import('@/lib/api');
      const res = await apiClient.getPublicConfig();
      if (!cancelled && res.success && res.data?.frontDeskPhone) {
        setFrontDeskPhone(res.data.frontDeskPhone);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frontDeskPhone]);

  const ensureTicket = useCallback(async () => {
    try {
      await createTicketMutation.mutateAsync('Front desk connection request');
    } catch {
      addToast({
        type: 'error',
        message: 'Could not log your request. You can still connect below.',
      });
    }
  }, [createTicketMutation, addToast]);

  const handleCall = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    await ensureTicket();
    if (frontDeskPhone) {
      window.location.href = `tel:${frontDeskPhone.replace(/\s/g, '')}`;
    }
    setContext({ conversationContext: 'FRONT_DESK_AGENT' });
    transition('CONNECTION_CALL');
    setIsBusy(false);
  }, [isBusy, ensureTicket, frontDeskPhone, setContext, transition]);

  const handleChat = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    await ensureTicket();
    setContext({ conversationContext: 'FRONT_DESK_AGENT' });
    addMessage({
      role: 'system',
      content: 'A team member may reply here.',
    });
    transition('CONNECTION_CHAT');
    setIsBusy(false);
  }, [isBusy, ensureTicket, setContext, addMessage, transition]);

  const handleCancel = useCallback(() => {
    transition('CANCEL_CONNECTION');
  }, [transition]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-white dark:bg-mage-gray-900 flex flex-col items-center justify-center p-6"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-10 max-w-sm"
      >
        <h2 className="text-2xl font-semibold text-mage-black dark:text-white mb-2">
          Connect with the front desk
        </h2>
        <p className="text-mage-gray-500 dark:text-mage-gray-400">
          Call the desk directly or continue in chat — a team member can reply when available.
        </p>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col gap-3 w-full max-w-xs mb-8"
      >
        <button
          type="button"
          disabled={isBusy}
          onClick={handleCall}
          className="
            w-full py-3.5 rounded-uber-full
            bg-mage-black dark:bg-white text-white dark:text-mage-black
            font-semibold disabled:opacity-50
            hover:opacity-90 active:scale-[0.98] transition-all
          "
        >
          {frontDeskPhone ? 'Call front desk' : 'Call front desk (number unavailable)'}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={handleChat}
          className="
            w-full py-3.5 rounded-uber-full
            bg-mage-gray-200 dark:bg-mage-gray-600 text-mage-black dark:text-white
            font-semibold disabled:opacity-50
            hover:bg-mage-gray-300 dark:hover:bg-mage-gray-500 active:scale-[0.98] transition-all
          "
        >
          Chat with front desk
        </button>
      </motion.div>

      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        onClick={handleCancel}
        className="
          px-8 py-3
          bg-mage-gray-100 dark:bg-mage-gray-700 text-mage-black dark:text-white
          rounded-uber-full font-semibold
          hover:bg-mage-gray-200 dark:hover:bg-mage-gray-600 active:scale-[0.98]
          transition-all
        "
      >
        Cancel
      </motion.button>
    </motion.div>
  );
}
