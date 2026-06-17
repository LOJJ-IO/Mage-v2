'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconMageLogo } from '@/components/staff/StaffIcons';
import { apiClient } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingMember {
  id: string;
  staff_code: string;
  display_name: string;
  requested_role: string;
  status: string;
  property_id: string;
  created_at: string | null;
}

interface IssuedKey {
  staffCode: string;
  displayName: string;
  accessKey: string;
  approvedRole: string;
}

const ROLE_LABELS: Record<string, string> = {
  manager: 'Manager',
  front_desk: 'Front Desk',
  maintenance: 'Maintenance',
  housekeeping: 'Housekeeping',
  room_service: 'Room Service',
};

const ALL_ROLES = Object.keys(ROLE_LABELS);

function formatRole(role: string) {
  return ROLE_LABELS[role] ?? role;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KeyRevealModal({
  issued,
  onClose,
}: {
  issued: IssuedKey;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(issued.accessKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-xl"
      >
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-0.5">
            Access approved
          </p>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            {issued.displayName}{' '}
            <span className="font-mono text-sm font-normal text-neutral-400">
              {issued.staffCode}
            </span>
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Role: {formatRole(issued.approvedRole)}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-4 mb-4">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2 uppercase tracking-wide">
            One-time access key — shown once only
          </p>
          <p className="font-mono text-sm break-all text-neutral-900 dark:text-white leading-relaxed">
            {issued.accessKey}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy key'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
        <p className="text-xs text-center text-neutral-400 dark:text-neutral-500 mt-3">
          Hand this key to {issued.displayName} securely. It cannot be retrieved again.
        </p>
      </motion.div>
    </div>
  );
}

function ApproveModal({
  member,
  onConfirm,
  onCancel,
  loading,
}: {
  member: PendingMember;
  onConfirm: (role: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [role, setRole] = useState(member.requested_role);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-xl"
      >
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white mb-1">
          Approve {member.display_name}
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Confirm or adjust role before issuing access key.
        </p>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          Role
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 mb-5"
        >
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {formatRole(r)}
            </option>
          ))}
        </select>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(role)}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {loading ? 'Approving…' : 'Approve & issue key'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function RejectModal({
  member,
  onConfirm,
  onCancel,
  loading,
}: {
  member: PendingMember;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-xl"
      >
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white mb-1">
          Reject {member.display_name}?
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
          Staff ID {member.staff_code} will be marked rejected and cannot sign in.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {loading ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type AdminPhase =
  | { name: 'gate' }
  | { name: 'loading' }
  | { name: 'list'; members: PendingMember[]; managerKey: string }
  | { name: 'error'; message: string };

export default function OnboardAdminPage() {
  const [phase, setPhase] = useState<AdminPhase>({ name: 'gate' });
  const [managerKeyInput, setManagerKeyInput] = useState('');
  const [gateError, setGateError] = useState<string | undefined>();

  // Modal state
  const [approveTarget, setApproveTarget] = useState<PendingMember | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingMember | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [issuedKey, setIssuedKey] = useState<IssuedKey | null>(null);

  // Fetch pending list
  const loadList = useCallback(async (key: string) => {
    setPhase({ name: 'loading' });
    const res = await apiClient.listPendingStaff(key);
    if (!res.success || !res.data) {
      setGateError(res.error ?? 'Could not load pending staff. Check your manager key.');
      setPhase({ name: 'gate' });
      return;
    }
    setPhase({ name: 'list', members: res.data as PendingMember[], managerKey: key });
  }, []);

  async function handleGateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGateError(undefined);
    await loadList(managerKeyInput.trim());
  }

  async function handleApprove(role: string) {
    if (!approveTarget || phase.name !== 'list') return;
    setActionLoading(true);
    try {
      const res = await apiClient.approveStaff(
        approveTarget.id,
        phase.managerKey,
        role
      );
      if (!res.success || !res.data) {
        alert(res.error ?? 'Approval failed.');
        return;
      }
      setIssuedKey({
        staffCode: res.data.staffCode,
        displayName: res.data.displayName,
        accessKey: res.data.accessKey,
        approvedRole: res.data.approvedRole,
      });
      setApproveTarget(null);
      // Refresh list
      setPhase((prev) =>
        prev.name === 'list'
          ? {
              ...prev,
              members: prev.members.filter((m) => m.id !== approveTarget.id),
            }
          : prev
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectTarget || phase.name !== 'list') return;
    setActionLoading(true);
    try {
      const res = await apiClient.rejectStaff(rejectTarget.id, phase.managerKey);
      if (!res.success) {
        alert(res.error ?? 'Rejection failed.');
        return;
      }
      setRejectTarget(null);
      setPhase((prev) =>
        prev.name === 'list'
          ? {
              ...prev,
              members: prev.members.filter((m) => m.id !== rejectTarget.id),
            }
          : prev
      );
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      {/* Modals */}
      <AnimatePresence>
        {issuedKey && (
          <KeyRevealModal issued={issuedKey} onClose={() => setIssuedKey(null)} />
        )}
        {approveTarget && (
          <ApproveModal
            member={approveTarget}
            onConfirm={handleApprove}
            onCancel={() => setApproveTarget(null)}
            loading={actionLoading}
          />
        )}
        {rejectTarget && (
          <RejectModal
            member={rejectTarget}
            onConfirm={handleReject}
            onCancel={() => setRejectTarget(null)}
            loading={actionLoading}
          />
        )}
      </AnimatePresence>

      <div className="staff-ui font-sans min-h-screen bg-neutral-100 dark:bg-neutral-950 px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <IconMageLogo className="w-10 h-10" />
            <div>
              <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
                Staff approvals
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Approve or reject pending staff access requests
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* Manager key gate */}
            {(phase.name === 'gate' || phase.name === 'loading') && (
              <motion.div
                key="gate"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm"
              >
                <form onSubmit={handleGateSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="manager-key"
                      className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
                    >
                      Manager access key
                    </label>
                    <input
                      id="manager-key"
                      type="password"
                      value={managerKeyInput}
                      onChange={(e) => setManagerKeyInput(e.target.value)}
                      placeholder="Your manager access key"
                      autoComplete="off"
                      className="w-full px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />
                  </div>
                  {gateError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{gateError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={phase.name === 'loading' || !managerKeyInput.trim()}
                    className="w-full py-3 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {phase.name === 'loading' ? 'Loading…' : 'View pending requests'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* Pending list */}
            {phase.name === 'list' && (
              <motion.div
                key="list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {phase.members.length === 0
                      ? 'No pending requests'
                      : `${phase.members.length} pending request${phase.members.length !== 1 ? 's' : ''}`}
                  </p>
                  <button
                    onClick={() => loadList(phase.managerKey)}
                    className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white underline"
                  >
                    Refresh
                  </button>
                </div>

                {phase.members.length === 0 ? (
                  <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center">
                    <p className="text-sm text-neutral-400 dark:text-neutral-500">
                      All caught up — no pending requests.
                    </p>
                  </div>
                ) : (
                  phase.members.map((member) => (
                    <div
                      key={member.id}
                      className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-900 dark:text-white truncate">
                            {member.display_name}
                          </p>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            <span className="font-mono">{member.staff_code}</span>
                            {' · '}
                            {formatRole(member.requested_role)}
                            {member.created_at && (
                              <>
                                {' · '}
                                <span className="text-xs">
                                  {formatDate(member.created_at)}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => setRejectTarget(member)}
                            className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => setApproveTarget(member)}
                            className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 transition-opacity"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <button
                  onClick={() => {
                    setPhase({ name: 'gate' });
                    setManagerKeyInput('');
                  }}
                  className="mt-2 text-sm text-neutral-400 underline hover:text-neutral-900 dark:hover:text-white"
                >
                  Sign out of admin
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <a
            href="/staff"
            className="mt-8 block text-center text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white underline"
          >
            Back to staff workspace
          </a>
        </div>
      </div>
    </>
  );
}
