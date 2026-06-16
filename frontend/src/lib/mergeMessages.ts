import { Message } from '@/types';
import { parseApiTimestamp } from '@/lib/parseTimestamp';

/** Stable identity for deduping local optimistic bubbles against server history. */
export function messageFingerprint(message: Message): string {
  if (message.kind === 'faq') {
    const itemIds = (message.faqItems ?? [])
      .map((item) => item.id)
      .sort()
      .join(',');
    return [
      'faq',
      message.role,
      (message.intro ?? message.content).trim(),
      itemIds,
      (message.triggerContent ?? '').trim(),
      String(message.faqResolved ?? ''),
    ].join('|');
  }

  return ['text', message.role, message.content.trim()].join('|');
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

  const serverFingerprintCounts = new Map<string, number>();
  for (const message of server) {
    const fingerprint = messageFingerprint(message);
    serverFingerprintCounts.set(
      fingerprint,
      (serverFingerprintCounts.get(fingerprint) ?? 0) + 1
    );
  }

  for (const message of local) {
    if (merged.has(message.id)) continue;

    const fingerprint = messageFingerprint(message);
    const remaining = serverFingerprintCounts.get(fingerprint) ?? 0;
    if (remaining > 0) {
      serverFingerprintCounts.set(fingerprint, remaining - 1);
      continue;
    }

    merged.set(message.id, message);
  }

  return Array.from(merged.values()).sort(
    (a, b) =>
      parseApiTimestamp(a.timestamp).getTime() - parseApiTimestamp(b.timestamp).getTime()
  );
}
