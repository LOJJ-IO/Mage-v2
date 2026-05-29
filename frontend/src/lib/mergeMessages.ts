import { Message } from '@/types';
import { parseApiTimestamp } from '@/lib/parseTimestamp';

function messageKey(message: Message): string {
  const ts = parseApiTimestamp(message.timestamp).getTime();
  return `${message.role}|${ts}|${message.content.slice(0, 120)}`;
}

/** Merge server history with local bubbles without dropping newer local-only messages. */
export function mergeConversationMessages(
  local: Message[],
  server: Message[]
): Message[] {
  const merged = new Map<string, Message>();

  for (const message of server) {
    merged.set(message.id, message);
  }

  for (const message of local) {
    if (merged.has(message.id)) continue;
    const duplicateOnServer = server.some((row) => messageKey(row) === messageKey(message));
    if (!duplicateOnServer) {
      merged.set(message.id, message);
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) =>
      parseApiTimestamp(a.timestamp).getTime() - parseApiTimestamp(b.timestamp).getTime()
  );
}
