import { Message, FaqItem } from '@/types';

/** Map API message (snake_case or camelCase) to client Message. */
export function mapApiMessage(raw: Record<string, unknown>): Message {
  const faqRaw = (raw.faq_items ?? raw.faqItems) as Array<Record<string, string>> | undefined;
  return {
    id: String(raw.id),
    role: raw.role as Message['role'],
    content: String(raw.content ?? ''),
    timestamp: new Date(String(raw.timestamp ?? Date.now())),
    requireContactConfirmation:
      raw.require_contact_confirmation != null
        ? Boolean(raw.require_contact_confirmation)
        : raw.requireContactConfirmation != null
          ? Boolean(raw.requireContactConfirmation)
          : undefined,
    kind: (raw.kind as Message['kind']) ?? 'text',
    intro: raw.intro != null ? String(raw.intro) : undefined,
    faqItems: faqRaw?.map(
      (item): FaqItem => ({
        id: String(item.id),
        title: String(item.title),
        body: String(item.body),
      })
    ),
    triggerContent:
      raw.trigger_content != null
        ? String(raw.trigger_content)
        : raw.triggerContent != null
          ? String(raw.triggerContent)
          : undefined,
    faqResolved:
      raw.faq_resolved != null
        ? Boolean(raw.faq_resolved)
        : raw.faqResolved != null
          ? Boolean(raw.faqResolved)
          : undefined,
  };
}
