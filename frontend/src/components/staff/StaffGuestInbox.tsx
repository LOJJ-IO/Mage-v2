'use client';

import { useMemo, useState } from 'react';
import { StaffAction } from '@/types';
import { useSendStaffMessage, useStaffActionConversation } from '@/hooks/useStaffApi';
import { StaffCard } from './StaffLayoutPrimitives';

interface StaffGuestInboxProps {
  actions: StaffAction[];
  staffKey: string;
}

interface GuestThreadSummary {
  guestId: string;
  guestName: string;
  roomNumber: string | null;
  latestActionId: string;
  latestSummary: string;
  latestAt: string;
  unreadCount: number;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function buildGuestThreads(actions: StaffAction[]): GuestThreadSummary[] {
  const map = new Map<string, StaffAction[]>();
  for (const action of actions) {
    const rows = map.get(action.guestId) ?? [];
    rows.push(action);
    map.set(action.guestId, rows);
  }

  const summaries: GuestThreadSummary[] = [];
  map.forEach((rows, guestId) => {
    const sorted = [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latest = sorted[0];
    summaries.push({
      guestId,
      guestName: latest.guestName ?? guestId,
      roomNumber: latest.roomNumber ?? null,
      latestActionId: latest.id,
      latestSummary: latest.summary,
      latestAt: latest.createdAt,
      unreadCount: rows.filter((row) => row.status === 'pending').length,
    });
  });

  return summaries.sort(
    (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function StaffGuestInbox({ actions, staffKey }: StaffGuestInboxProps) {
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const threads = useMemo(() => buildGuestThreads(actions), [actions]);
  const selectedThread =
    threads.find((thread) => thread.guestId === selectedGuestId) ?? threads[0] ?? null;
  const selectedActionId = selectedThread?.latestActionId ?? null;
  const { data: conversation, isLoading } = useStaffActionConversation(staffKey, selectedActionId);
  const sendMutation = useSendStaffMessage();

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || !selectedActionId || sendMutation.isPending) return;
    await sendMutation.mutateAsync({ actionId: selectedActionId, content: text, staffKey });
    setReply('');
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden gap-3 p-4 md:p-5 flex-col lg:flex-row">
      <StaffCard className="w-full lg:w-[300px] shrink-0 overflow-hidden flex flex-col max-h-[260px] lg:max-h-none">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Guest inbox</h2>
          <p className="text-xs text-neutral-500 mt-1">{threads.length} active threads</p>
        </div>
        <div className="overflow-y-auto p-2 space-y-1.5">
          {threads.map((thread) => (
            <button
              key={thread.guestId}
              type="button"
              onClick={() => setSelectedGuestId(thread.guestId)}
              className={`w-full text-left rounded-lg px-3 py-2 ${
                selectedThread?.guestId === thread.guestId
                  ? 'bg-neutral-100 dark:bg-neutral-800'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
                  {initials(thread.guestName)}
                </span>
                <p className="flex-1 truncate text-sm font-medium text-neutral-900 dark:text-white">
                  {thread.guestName}
                </p>
                <span className="text-[11px] text-neutral-400">{formatRelative(thread.latestAt)}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500 truncate">
                {thread.roomNumber ? `Room ${thread.roomNumber} · ` : ''}
                {thread.latestSummary}
              </p>
              {thread.unreadCount > 0 && (
                <span className="mt-1 inline-flex rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {thread.unreadCount} pending
                </span>
              )}
            </button>
          ))}
        </div>
      </StaffCard>

      <StaffCard className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          {selectedThread ? (
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {selectedThread.guestName}
              </h2>
              <span className="text-xs text-neutral-500">
                {selectedThread.roomNumber ? `Room ${selectedThread.roomNumber}` : 'No room'}
              </span>
            </div>
          ) : (
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              No guest conversations yet
            </h2>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-neutral-50/70 dark:bg-neutral-950/40">
          {!selectedThread ? (
            <p className="text-sm text-neutral-500">New guest conversations will appear here.</p>
          ) : isLoading ? (
            <p className="text-sm text-neutral-500">Loading conversation…</p>
          ) : !conversation?.messages.length ? (
            <p className="text-sm text-neutral-500">No messages yet.</p>
          ) : (
            conversation.messages.map((message) => {
              const guestSide = message.role === 'user';
              const bubbleClass = guestSide
                ? 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white rounded-bl-sm'
                : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-br-sm';

              return (
                <div
                  key={message.id}
                  className={`flex ${guestSide ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[78%] rounded-xl px-3 py-2 text-sm ${bubbleClass}`}>
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    <p
                      className={`mt-1 text-[11px] ${
                        guestSide ? 'text-neutral-400' : 'text-white/70 dark:text-neutral-500'
                      }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-800 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Jump in and reply as staff…"
              className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={!selectedActionId}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!selectedActionId || !reply.trim() || sendMutation.isPending}
              className="rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </StaffCard>
    </div>
  );
}

