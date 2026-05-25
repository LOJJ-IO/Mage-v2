'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StaffAction } from '@/types';
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

interface StaffDetailPanelProps {
  action: StaffAction;
  staffKey: string;
  isUpdating: boolean;
  onClose: () => void;
  onUpdateStatus: (status: 'acknowledged' | 'resolved') => void;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
        {label}
      </dt>
      <dd className="text-neutral-900 dark:text-white text-sm">{children}</dd>
    </div>
  );
}

export function StaffDetailPanel({
  action,
  staffKey,
  isUpdating,
  onClose,
  onUpdateStatus,
}: StaffDetailPanelProps) {
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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex justify-end"
      >
        <button
          type="button"
          aria-label="Close panel"
          className="absolute inset-0 bg-black/30"
          onClick={onClose}
        />
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative flex h-full w-full max-w-lg flex-col bg-white dark:bg-neutral-950 shadow-2xl border-l border-neutral-200 dark:border-neutral-800"
        >
          <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white mb-2"
            >
              ← Back to board
            </button>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white pr-2">
              {action.summary}
            </h2>
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

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <dl className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 mb-6">
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
              <DetailRow label="Guest said">
                <blockquote className="text-neutral-600 dark:text-neutral-300 italic border-l-2 border-neutral-200 dark:border-neutral-600 pl-3">
                  {action.sourceMessage}
                </blockquote>
              </DetailRow>
              <DetailRow label="Logged at">{created}</DetailRow>
            </dl>

            <section className="mb-6">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
                Guest chat
              </h3>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 min-h-[120px] max-h-64 overflow-y-auto bg-neutral-50 dark:bg-neutral-900/50">
                {convLoading ? (
                  <p className="text-sm text-neutral-500">Loading conversation…</p>
                ) : !conversation?.messages.length ? (
                  <p className="text-sm text-neutral-500">No messages yet.</p>
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
                    className="flex-1 px-4 py-2.5 rounded-full border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
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
                    className="px-4 py-2.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              )}
            </section>
          </div>

          <footer className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 p-5 flex flex-col gap-2">
            {action.status === 'pending' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => onUpdateStatus('acknowledged')}
                className="w-full py-3 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium text-sm disabled:opacity-50"
              >
                Move to On-going
              </button>
            )}
            {action.status !== 'resolved' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => onUpdateStatus('resolved')}
                className="w-full py-3 rounded-full border border-neutral-300 dark:border-neutral-600 font-medium text-sm disabled:opacity-50"
              >
                Mark done
              </button>
            )}
          </footer>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
