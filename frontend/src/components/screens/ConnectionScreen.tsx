'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { CONNECTION_COUNTDOWN } from '@/lib/stateMachine';
import { useCreateTicket } from '@/hooks/useApi';

export function ConnectionScreen() {
  const {
    transition,
    setContext,
    context,
    addToast,
    addMessage,
  } = useMageStore();

  const [countdown, setCountdown] = useState(CONNECTION_COUNTDOWN);
  const [isConnecting, setIsConnecting] = useState(false);
  const createTicketMutation = useCreateTicket();

  // Handle cancel
  const handleCancel = useCallback(() => {
    transition('CANCEL_CONNECTION');
  }, [transition]);

  // Handle connection after countdown
  const handleConnect = useCallback(async () => {
    setIsConnecting(true);

    try {
      // Create ticket
      await createTicketMutation.mutateAsync('Front desk connection request');

      // Determine routing: human available → front desk; else → deferred (state machine sets BOT)
      if (context.humanAgentAvailable) {
        setContext({ conversationContext: 'FRONT_DESK_AGENT' });
        addMessage({
          role: 'system',
          content: 'Connected to Front Desk',
        });
        addMessage({
          role: 'assistant',
          content: 'Hello! This is the front desk. How can I assist you today?',
        });
        transition('CONNECTION_TIMEOUT');
      } else {
        transition('CONNECTION_TIMEOUT');
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Connection failed. Please try again.',
      });
      transition('CANCEL_CONNECTION');
    }
  }, [
    context,
    setContext,
    addMessage,
    addToast,
    transition,
    createTicketMutation,
  ]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleConnect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [handleConnect]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-white flex flex-col items-center justify-center p-6"
    >
      {/* Loading animation */}
      <div className="relative mb-8">
        {/* Outer ring */}
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="#F6F6F6"
            strokeWidth="8"
          />
          <motion.circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="#000"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={339.292}
            strokeDashoffset={339.292 * (1 - (CONNECTION_COUNTDOWN - countdown) / CONNECTION_COUNTDOWN)}
            transform="rotate(-90 60 60)"
            transition={{ duration: 0.5, ease: 'linear' }}
          />
        </svg>

        {/* Countdown number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            key={countdown}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-4xl font-bold text-mage-black"
          >
            {countdown}
          </motion.span>
        </div>
      </div>

      {/* Status text */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-center mb-8"
      >
        <h2 className="text-2xl font-semibold text-mage-black mb-2">
          {isConnecting ? 'Connecting...' : 'Preparing connection'}
        </h2>
        <p className="text-mage-gray-500">
          {context.humanAgentAvailable
            ? 'Connecting you to the front desk'
            : context.aiAgentAvailable && context.isPaidUser
            ? 'Connecting you to AI assistance'
            : 'Finding the best way to help you'}
        </p>
      </motion.div>

      {/* Connection status indicators */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="space-y-3 w-full max-w-xs mb-8"
      >
        <StatusIndicator
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
          label="Human agent"
          status={context.humanAgentAvailable ? 'available' : 'unavailable'}
        />
        <StatusIndicator
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
          label="AI assistant"
          status={context.aiAgentAvailable ? 'available' : 'unavailable'}
        />
      </motion.div>

      {/* Cancel button */}
      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        onClick={handleCancel}
        className="
          px-8 py-3
          bg-mage-gray-100 text-mage-black
          rounded-uber-full font-semibold
          hover:bg-mage-gray-200 active:scale-[0.98]
          transition-all
        "
      >
        Cancel
      </motion.button>
    </motion.div>
  );
}

// Status indicator component
interface StatusIndicatorProps {
  icon: React.ReactNode;
  label: string;
  status: 'available' | 'unavailable' | 'connecting';
}

function StatusIndicator({ icon, label, status }: StatusIndicatorProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'available':
        return 'bg-mage-green';
      case 'connecting':
        return 'bg-mage-yellow';
      default:
        return 'bg-mage-gray-300';
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-mage-gray-50 rounded-uber-lg">
      <div className="text-mage-gray-600">{icon}</div>
      <span className="flex-1 text-mage-black font-medium">{label}</span>
      <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
    </div>
  );
}
