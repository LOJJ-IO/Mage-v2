# Review specialist — product notes

## Preferred review platform per guest

The platform shown for a guest in **Review specialist** (and used for review link suggestions) should reflect **where they booked**, not a random or staff-default choice.

**Today:** when no  platform is stored, the UI falls back to a deterministic hash of `guestId` across a fixed list (Google, TripAdvisor, Booking.com, Expedia). That is a placeholder only.

**Target behavior:** each guest has a **preferred review platform** derived from their booking channel — e.g. Booking.com guest → suggest Booking.com review; direct/unknown → hotel’s default or Google.

### How we might get there

Two acceptable approaches (can combine):

1. **Detect from reservation / PMS**  
   Read booking source or channel from the PMS (or webhook payload) when the guest is hydrated — e.g. `booking.com`, `expedia`, direct, walk-in. Map known OTA codes to the matching review platform.

2. **Ask the guest**  
   During onboarding or early in stay, ask: *“How did you book your stay?”* (or similar). Persist the answer as the guest’s preferred platform for review suggestions. Useful when PMS data is missing, ambiguous, or wrong.

Staff may still override per guest in Review specialist; the default should always start from booking source or guest-stated channel, not an arbitrary pick.

### Open questions (when implementing)

- Which PMS fields (if any) expose OTA / channel today?
- Single question in guest chat vs dedicated onboarding step?
- Fallback when channel is “direct” or unknown — property-configured default vs Google?
