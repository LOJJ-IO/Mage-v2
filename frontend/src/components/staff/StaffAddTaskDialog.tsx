'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ActionType, StaffActionStatus } from '@/types';
import { actionTypeLabel } from './actionBadges';
import { REASSIGNABLE_ACTION_TYPES } from '@/lib/staffPermissions';
import { useStaffGuests } from '@/hooks/useStaffApi';
import type { KanbanColumnId } from './StaffKanbanColumn';

const COLUMN_STATUS: Record<KanbanColumnId, StaffActionStatus> = {
  todo: 'pending',
  ongoing: 'acknowledged',
  done: 'resolved',
};

const COLUMN_LABEL: Record<KanbanColumnId, string> = {
  todo: 'To-do',
  ongoing: 'On-going',
  done: 'Done',
};

export interface StaffAddTaskFormValues {
  summary: string;
  guestId: string;
  notes: string;
  actionType?: ActionType;
  status: StaffActionStatus;
}

interface StaffAddTaskDialogProps {
  open: boolean;
  columnId: KanbanColumnId;
  staffKey: string;
  canPickTeam: boolean;
  defaultTeam: ActionType | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: StaffAddTaskFormValues) => void;
}

export function StaffAddTaskDialog({
  open,
  columnId,
  staffKey,
  canPickTeam,
  defaultTeam,
  isSubmitting,
  onClose,
  onSubmit,
}: StaffAddTaskDialogProps) {
  const { data: guests = [], isLoading: guestsLoading } = useStaffGuests(open ? staffKey : null);
  const [summary, setSummary] = useState('');
  const [guestId, setGuestId] = useState('');
  const [notes, setNotes] = useState('');
  const [actionType, setActionType] = useState<ActionType>(
    canPickTeam ? 'MAINTENANCE' : (defaultTeam ?? 'MAINTENANCE')
  );

  useEffect(() => {
    if (!open) return;
    setSummary('');
    setNotes('');
    setGuestId('');
    setActionType(canPickTeam ? 'MAINTENANCE' : (defaultTeam ?? 'MAINTENANCE'));
  }, [open, canPickTeam, defaultTeam, columnId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = summary.trim();
    if (!trimmed || !guestId || isSubmitting) return;
    onSubmit({
      summary: trimmed,
      guestId,
      notes: notes.trim(),
      actionType: canPickTeam ? actionType : undefined,
      status: COLUMN_STATUS[columnId],
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="relative w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-950"
            role="dialog"
            aria-labelledby="add-task-title"
          >
            <h2 id="add-task-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
              Add task
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Creates in <span className="font-medium">{COLUMN_LABEL[columnId]}</span>
              {!canPickTeam && defaultTeam && (
                <>
                  {' '}
                  · Team: <span className="font-medium">{actionTypeLabel(defaultTeam)}</span>
                </>
              )}
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="add-task-summary"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500"
                >
                  Task title
                </label>
                <input
                  id="add-task-summary"
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="e.g. Replace hallway light bulb"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
                  autoFocus
                  maxLength={500}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="add-task-guest"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500"
                >
                  Guest
                </label>
                <select
                  id="add-task-guest"
                  value={guestId}
                  onChange={(e) => setGuestId(e.target.value)}
                  disabled={guestsLoading}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white disabled:opacity-50"
                  required
                >
                  <option value="">
                    {guestsLoading ? 'Loading guests…' : 'Select a guest'}
                  </option>
                  {guests.map((g) => (
                    <option key={g.guestId} value={g.guestId}>
                      {g.name} · Room {g.roomNumber}
                    </option>
                  ))}
                </select>
              </div>

              {canPickTeam && (
                <div>
                  <label
                    htmlFor="add-task-team"
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500"
                  >
                    Assigned team
                  </label>
                  <select
                    id="add-task-team"
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as ActionType)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
                  >
                    {REASSIGNABLE_ACTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {actionTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="add-task-notes"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500"
                >
                  Notes <span className="normal-case text-neutral-400">(optional)</span>
                </label>
                <textarea
                  id="add-task-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Extra context for the team…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
                  maxLength={4000}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-full border border-neutral-300 py-2.5 text-sm font-medium dark:border-neutral-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!summary.trim() || !guestId || isSubmitting || guestsLoading}
                  className="flex-1 rounded-full bg-neutral-900 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                >
                  {isSubmitting ? 'Creating…' : 'Create task'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
