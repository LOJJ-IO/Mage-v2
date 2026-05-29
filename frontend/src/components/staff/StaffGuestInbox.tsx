'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useSendStaffMessage,
  useStaffGuestConversation,
  useStaffInboxThreads,
} from '@/hooks/useStaffApi';
import { formatMessageTime, parseApiTimestamp } from '@/lib/parseTimestamp';
import { useMediaQuery } from '@/hooks/useResizableWidth';
import { StaffCard } from './StaffLayoutPrimitives';
import { ResizableSplit } from './ResizablePanel';
import { staffChatBubbleClasses, staffChatMetaClasses } from './staffChatBubble';
import { IconHeadset } from './StaffIcons';

interface StaffGuestInboxProps {
  staffKey: string;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - parseApiTimestamp(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function StaffGuestInbox({ staffKey }: StaffGuestInboxProps) {
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const userPickedGuestRef = useRef(false);

  const { data: threads = [], isLoading: threadsLoading, error: threadsError } =
    useStaffInboxThreads(staffKey);

  const selectedThread =
    threads.find((thread) => thread.guestId === selectedGuestId) ?? null;

  useEffect(() => {
    if (userPickedGuestRef.current) return;
    if (!selectedGuestId && threads[0]?.guestId) {
      setSelectedGuestId(threads[0].guestId);
    }
  }, [threads, selectedGuestId]);

  const guestId = selectedThread?.guestId ?? null;
  const {
    data: conversation,
    isLoading: conversationLoading,
    isFetching: conversationFetching,
    isError: conversationError,
    error: conversationErrorDetail,
  } = useStaffGuestConversation(staffKey, guestId);
  const sendMutation = useSendStaffMessage();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const messages = conversation?.messages ?? [];
  const showConversationLoading =
    !!guestId && conversationLoading && messages.length === 0;

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || !guestId || sendMutation.isPending) return;
    await sendMutation.mutateAsync({
      guestId,
      actionId: selectedThread?.linkedActionId ?? undefined,
      content: text,
      staffKey,
    });
    setReply('');
  };

  const threadList = (
      <StaffCard className="h-full min-h-0 overflow-hidden flex flex-col max-h-[260px] lg:max-h-none">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Guest inbox</h2>
          <p className="text-xs text-neutral-500 mt-1">
            {threads.length} conversation{threads.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="overflow-y-auto p-2 space-y-1.5">
          {threadsLoading && (
            <p className="px-3 py-4 text-xs text-neutral-500">Loading conversations…</p>
          )}
          {threadsError && (
            <p className="px-3 py-4 text-xs text-red-600 dark:text-red-400">
              Could not load inbox. Try refreshing.
            </p>
          )}
          {!threadsLoading && !threadsError && threads.length === 0 && (
            <p className="px-3 py-4 text-xs text-neutral-500">
              No guest chats yet. Conversations appear here as soon as a guest messages Mage.
            </p>
          )}
          {threads.map((thread) => (
            <button
              key={thread.guestId}
              type="button"
              onClick={() => {
                userPickedGuestRef.current = true;
                setSelectedGuestId(thread.guestId);
              }}
              className={`w-full text-left rounded-lg px-3 py-2 ${
                selectedThread?.guestId === thread.guestId
                  ? 'bg-neutral-100 dark:bg-neutral-800'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
                  {initials(thread.guestName ?? thread.guestId)}
                </span>
                <p className="flex-1 truncate text-sm font-medium text-neutral-900 dark:text-white">
                  {thread.guestName ?? thread.guestId}
                </p>
                <span className="text-[11px] text-neutral-400">
                  {formatRelative(thread.lastMessageAt)}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500 truncate">
                {thread.roomNumber ? `Room ${thread.roomNumber} · ` : ''}
                {thread.lastMessagePreview || 'No messages yet'}
              </p>
              {thread.liveChatPending && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-mage-blue/40 bg-mage-blue/15 px-2 py-0.5 text-[10px] font-semibold text-mage-blue dark:text-mage-blue">
                  <IconHeadset className="w-3 h-3" />
                  Live chat — guest waiting
                </span>
              )}
            </button>
          ))}
        </div>
      </StaffCard>
  );

  const conversationPanel = (
      <StaffCard className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          {selectedThread ? (
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {selectedThread.guestName ?? selectedThread.guestId}
              </h2>
              <span className="text-xs text-neutral-500">
                {selectedThread.roomNumber ? `Room ${selectedThread.roomNumber}` : 'No room'}
              </span>
              {conversationFetching && messages.length > 0 && (
                <span className="text-[10px] text-neutral-400">Updating…</span>
              )}
            </div>
          ) : (
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Select a guest conversation
            </h2>
          )}
        </div>

        <div className="relative flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-neutral-50/70 dark:bg-neutral-950/40">
          {!selectedThread ? (
            <p className="text-sm text-neutral-500">
              All guest chats with Mage appear here, even when no task was logged.
            </p>
          ) : conversationError ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              {conversationErrorDetail instanceof Error
                ? conversationErrorDetail.message
                : 'Could not load conversation.'}
            </p>
          ) : showConversationLoading ? (
            <p className="text-sm text-neutral-500">Loading conversation…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No messages in this thread yet. The guest may have only triggered a staff task.
            </p>
          ) : (
            messages.map((message) => {
              const guestSide = message.role === 'user';
              const bubbleClass = staffChatBubbleClasses(message.role);

              return (
                <div
                  key={message.id}
                  className={`flex ${guestSide ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[78%] rounded-xl px-3 py-2 text-sm ${bubbleClass}`}>
                    {message.role === 'staff' && (
                      <p className="text-xs font-medium text-mage-blue dark:text-mage-blue mb-1">
                        Front desk
                      </p>
                    )}
                    {message.role === 'assistant' && (
                      <p className="text-xs font-medium text-neutral-500 mb-1">Mage</p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    <p className={`mt-1 text-[11px] ${staffChatMetaClasses(message.role)}`}>
                      {formatMessageTime(message.timestamp)}
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
              disabled={!guestId}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!guestId || !reply.trim() || sendMutation.isPending}
              className="rounded-lg bg-mage-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90"
            >
              Send
            </button>
          </div>
        </div>
      </StaffCard>
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden p-4 md:p-5">
      {isDesktop ? (
        <ResizableSplit
          storageKey="staff-guest-inbox"
          defaultLeftWidth={300}
          minLeft={220}
          maxLeft={480}
          className="min-h-0 flex-1"
          left={threadList}
          right={conversationPanel}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {threadList}
          {conversationPanel}
        </div>
      )}
    </div>
  );
}
