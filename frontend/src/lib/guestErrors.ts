/** Map API/technical errors to guest-safe chat copy (never show "Unknown error"). */

export const GUEST_CHAT_ERROR =
  "I'm having a little trouble right now. Please try again in a moment, or contact the front desk if it's urgent.";

const TECHNICAL_PATTERNS = [
  /^unknown error$/i,
  /^request failed$/i,
  /^failed to send message$/i,
  /^network error$/i,
  /^failed to fetch$/i,
  /typeerror/i,
  /internal server error/i,
  /^error:/i,
];

export function toGuestFriendlyError(raw: string | undefined | null): string {
  const msg = (raw ?? '').trim();
  if (!msg) {
    return GUEST_CHAT_ERROR;
  }
  if (TECHNICAL_PATTERNS.some((p) => p.test(msg))) {
    if (/failed to fetch|network/i.test(msg)) {
      return "I couldn't reach the hotel assistant just now. Please check your connection and try again.";
    }
    return GUEST_CHAT_ERROR;
  }
  return msg;
}
