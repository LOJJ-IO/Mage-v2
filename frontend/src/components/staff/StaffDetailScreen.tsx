'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { StaffAction, StaffActionStatus } from '@/types';
import {
  actionTypeBadgeClass,
  actionTypeLabel,
  escalationBadgeClass,
  escalationLabel,
} from './actionBadges';
import { MessageBubble } from '@/components/MessageBubble';
import {
  useStaffActionConversation,
  useSendStaffMessage,
} from '@/hooks/useStaffApi';

interface StaffDetailScreenProps {
  action: StaffAction;
  staffKey: string;
  isUpdating: boolean;
  onBack: () => void;
  onUpdateStatus: (status: 'acknowledged' | 'resolved') => void;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      className="py-3 border-b border-mage-gray-100 dark:border-mage-gray-800 last:border-0"
    >
      <dt className="text-xs font-medium text-mage-gray-500 dark:text-mage-gray-400 uppercase tracking-wide mb-1">
        {label}
      </dt>
      <dd className="text-mage-black dark:text-white text-sm">{children}</dd>
    </motion.div>
  );
}

export function StaffDetailScreen({
  action,
  staffKey,
  isUpdating,
  onBack,
  onUpdateStatus,
}: StaffDetailScreenProps) {
  const created = new Date(action.createdAt).toLocaleString();
  const [reply, setReply] = useState('');
  const { data: conversation, isLoading: convLoading } = useStaffActionConversation(
    staffKey,
    action.id
  );
  const sendMutation = useSendStaffMessage();
  const canReply = action.allowStaffJumpIn !== false && action.status !== 'resolved';

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || sendMutation.isPending) return;
    await sendMutation.mutateAsync({ actionId: action.id, content: text, staffKey });
    setReply('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex flex-col min-h-screen bg-white dark:bg-mage-gray-900 max-w-md mx-auto"
    >
      <header className="sticky top-0 z-10 bg-white dark:bg-mage-gray-900 border-b border-mage-gray-200 dark:border-mage-gray-700 px-4 py-4 safe-area-top">
        <motion.button
          type="button"
          onClick={onBack}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="text-sm text-mage-blue mb-2"
        >
          ← Back to list
        </motion.button>
        <motion.h1
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="text-xl font-semibold text-mage-black dark:text-white pr-2"
        >
          {action.summary}
        </motion.h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <span
            className={`inline-block text-xs px-2 py-0.5 rounded-full ${actionTypeBadgeClass(action.actionType)}`}
          >
            {actionTypeLabel(action.actionType)}
          </span>
          {action.escalationType && action.escalationType !== 'normal' && (
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded-full ${escalationBadgeClass(action.escalationType)}`}
            >
              {escalationLabel(action.escalationType)}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <dl className="rounded-uber-xl border border-mage-gray-200 dark:border-mage-gray-700 p-4 mb-6">
          <DetailRow label="Request ID">
            <code className="text-xs font-mono break-all">{action.id}</code>
          </DetailRow>
          <DetailRow label="Guest">
            {action.guestName ?? 'Unknown'} ({action.guestId})
          </DetailRow>
          <DetailRow label="Room">{action.roomNumber ?? '—'}</DetailRow>
          <DetailRow label="Type">{actionTypeLabel(action.actionType)}</DetailRow>
          <DetailRow label="Status">
            <span className="capitalize">{action.status}</span>
          </DetailRow>
          <DetailRow label="Summary">{action.summary}</DetailRow>
          <DetailRow label="Guest said">
            <blockquote className="text-mage-gray-600 dark:text-mage-gray-300 italic border-l-2 border-mage-gray-200 dark:border-mage-gray-600 pl-3">
              {action.sourceMessage}
            </blockquote>
          </DetailRow>
          <DetailRow label="Logged at">{created}</DetailRow>
        </dl>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-mage-black dark:text-white mb-3">
            Guest chat
          </h2>
          <div className="rounded-uber-xl border border-mage-gray-200 dark:border-mage-gray-700 p-3 min-h-[120px] max-h-64 overflow-y-auto bg-mage-gray-50 dark:bg-mage-gray-800/50">
            {convLoading ? (
              <p className="text-sm text-mage-gray-500">Loading conversation…</p>
            ) : !conversation?.messages.length ? (
              <p className="text-sm text-mage-gray-500">No messages yet.</p>
            ) : (
              conversation.messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id || `staff-view-${i}`}
                  message={msg}
                  isLast={i === conversation.messages.length - 1}
                />
              ))
            )}
          </div>
          {canReply && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to guest…"
                className="flex-1 px-4 py-2.5 rounded-uber-full border border-mage-gray-200 dark:border-mage-gray-600 bg-white dark:bg-mage-gray-800 text-mage-black dark:text-white text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type="button"
                disabled={!reply.trim() || sendMutation.isPending}
                onClick={() => void handleSend()}
                className="px-4 py-2.5 rounded-uber-full bg-mage-blue text-white text-sm font-medium disabled:opacity-50"
              >
                Send
              </button>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-3 pb-8">
          {action.status === 'pending' && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onUpdateStatus('acknowledged')}
              className="w-full py-3.5 rounded-uber-full bg-mage-blue text-white font-medium disabled:opacity-50"
            >
              Acknowledge
            </button>
          )}
          {action.status !== 'resolved' && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onUpdateStatus('resolved')}
              className="w-full py-3.5 rounded-uber-full bg-mage-black dark:bg-white text-white dark:text-mage-black font-medium disabled:opacity-50"
            >
              Mark resolved
            </button>
          )}
        </div>
      </main>
    </motion.div>
  );
}
