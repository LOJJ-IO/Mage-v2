# Mage v2 — MVP Cut Line

**Owner:** Agent 8 (Launch PM)
**Purpose:** Defines what ships in the pilot (Day 1) versus what moves to Phase 2. Prevents scope creep during the merge sprint and gives a clear answer when "should we build this now?" comes up.

---

## Decision Rule

**Ships Day 1** if it blocks a guest from checking in, blocks a staff member from doing their job, or blocks a manager from approving their team.

**Moves to Phase 2** if it improves an experience that already works, adds a role or edge case not present in the pilot hotel, requires schema changes beyond the 5 current migrations, or adds infrastructure the pilot hotel doesn't need.

---

## Day 1 — Ships With the Pilot

### Guest authentication
- [x] Guest registration form (name, email, booking ID, check-in/out dates)
- [x] Email verification (one-time token, 24h expiry)
- [x] Magic-link sign-in after email verification
- [x] Returning guest sign-in (name + booking ID → same `guest_id`, chat history preserved)
- [x] Guest session cookie (`mage_session`, HttpOnly, Secure in prod)

### Staff authentication
- [x] Staff request access form (name, role, email)
- [x] Provisional Staff ID shown at request time (`STF-XXXX`)
- [x] Manager approval portal (`/onboard/admin`)
- [x] Per-staff unique access key generated on approval (SHA-256 hashed at rest)
- [x] Access key emailed to staff member on approval *(requires Conflict 2 fix — email column)*
- [x] Staff sign-in with access key → session in `sessionStorage`

### RBAC
- [x] Five roles: `manager`, `front_desk`, `maintenance`, `housekeeping`, `room_service`
- [x] Per-role nav tab filtering (sidebar)
- [x] Per-role ActionType kanban filtering (tasks + GET /api/staff/actions)
- [x] `GET /api/staff/session` returns `allowed_nav` + `allowed_action_types`
- [x] Legacy `STAFF_ACCESS_KEY` still works as synthetic manager (backward-compat)

### Onboarding hub
- [x] `/onboard` three-door hub (Guest / Staff / Hotel Manager)
- [x] `/welcome` redirect shim → `/onboard`
- [x] Unauthenticated `/` redirects to `/onboard` (when `ALLOW_DEV_GUEST_LOGIN=false`)

### Task assist (ops copilot)
- [x] "Get help with this task" button on assigned task detail panel
- [x] Opens help desk in chat-heavy task mode with pre-filled context
- [x] POST /api/staff/task-assist — AI responds with SOP guidance
- [x] Thread persists to `staff_task_assist_threads` table
- [x] Browse help desk mode unchanged

### Frozen systems (must remain working)
- [x] Guest chat state machine (11 states, streaming SSE)
- [x] Staff kanban (tasks, assigned, status patch)
- [x] PMS webhook (`/api/webhooks/pms-checkin`)
- [x] Magic link (PMS flow) — `POST /api/auth/magic-link` + `GET /api/auth/verify`
- [x] Voice transcription
- [x] Knowledge crawl + publish
- [x] Reviews / guest inbox (front_desk + manager only)
- [x] Dashboard metrics

### Infrastructure
- [x] Supabase migrations 1–5 run in order
- [x] `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + `FRONTEND_URL` configured
- [x] `DEBUG=false`, `ALLOW_DEV_GUEST_LOGIN=false` in production
- [x] `TRANSCRIPTION_PROVIDER=openai` on Vercel

---

## Phase 2 — Post-Pilot

Items below are explicitly deferred. Do not implement during the merge sprint.

### Staff email on request received
**What:** Send Template 3 ("Your Mage staff request has been received") when a staff member submits their request.
**Why deferred:** Low urgency — the request-received screen already shows the Staff ID. The manager sees the pending list. Email is a nice-to-have but doesn't block the flow.
**Trigger to implement:** Second hotel onboarding, or if pilot hotel manager requests it.

### Staff key rotation UI
**What:** Manager can revoke a staff member's access key and issue a new one without going through the full re-approve flow.
**Why deferred:** v1 workaround is to re-approve the staff member (reject → new request → approve). Works but is clunky.
**Trigger to implement:** When a pilot hotel staff member reports a lost key.

### Guest magic link re-send
**What:** Guest can request a new magic link from `/onboard/guest` if their first one expires.
**Why deferred:** The returning sign-in flow (name + booking ID) achieves the same outcome without a new link. Re-send is UX polish.
**Trigger to implement:** If guests report frustration with expired links during the pilot.

### Multi-property support
**What:** One deployment serving multiple `property_id` values with isolated data.
**Why deferred:** The pilot is single-property. Multi-property requires routing logic, per-property env resolution, and more complex Supabase RLS.
**Trigger to implement:** Second hotel signs up.

### Supabase Row Level Security (RLS)
**What:** Add RLS policies so `property_id` rows are only accessible to the correct service context.
**Why deferred:** v1 uses the `service_role` key which bypasses RLS. Acceptable for a single-property pilot. Required before multi-tenant.
**Trigger to implement:** Before opening to a second property.

### Rate limiting
**What:** Per-IP rate limits on auth endpoints (register, verify, sign-in, staff sign-in).
**Why deferred:** Advisory only — not yet implemented. Pilot hotels have low traffic. Key entropy (43 chars) makes brute-force impractical even without rate limiting.
**Trigger to implement:** Before any public marketing or high-volume use.

### Metrics / analytics for managers
**What:** Dashboard tab visible to manager role showing guest satisfaction trends, call deflection rate, task resolution times.
**Why deferred:** The `/dashboard` endpoint exists but is not RBAC-gated to the manager role in the staff workspace. Analytics are useful for proving ROI but not needed for the pilot to function.
**Trigger to implement:** When pilot hotel GM asks for usage data.

### Concierge and Review Specialist roles
**What:** Separate named roles for concierge (currently maps to `front_desk`) and review specialist (currently maps to `front_desk`).
**Why deferred:** For v1, both map to `front_desk` and get full access. Creating distinct roles requires RBAC matrix additions and potential UI changes.
**Trigger to implement:** When a hotel has a distinct concierge desk that needs different access than front_desk agents.

### Guest data deletion (GDPR)
**What:** "Delete my data" endpoint allowing a guest to remove their profile, conversations, and email verifications.
**Why deferred:** Pilot hotels are likely in jurisdictions where this is required eventually but not immediately enforceable at small scale.
**Trigger to implement:** Before EU hotel or any hotel explicitly requesting GDPR compliance.

### Staff approval email (if Conflict 2 not fixed)
**What:** Email the access key to the staff member when approved.
**Why deferred only if Conflict 2 (missing `email` column) is not resolved before launch:** If the column is added before launch, this ships Day 1. If not, the access key is shown on screen at approval time instead, and the manager communicates it to the staff member manually.
**Trigger to implement:** Resolve Conflict 2.

### Vercel cold start mitigation
**What:** Loading indicator on `/auth/verify`; retry logic; or "fluid compute" to keep the function warm.
**Why deferred:** Not a blocker — the page still works, just slowly on first load.
**Trigger to implement:** When pilot guests report confusion about blank/slow magic link landing.

### Multi-language guest chat
**What:** AI responds in the guest's language.
**Why deferred:** Out of scope for pilot. OpenRouter models support multilingual by default; explicit language routing is a product decision.
**Trigger to implement:** Hotel requests it or a non-English speaking guest reports a problem.

---

## Conflict-Gated Items

These are Day 1 items that become Phase 2 if the conflict is not resolved in time:

| Item | Blocked by | Becomes Phase 2 if... |
|------|-----------|----------------------|
| Staff approval email | Conflict 2 (`email` column missing) | Column not added before launch |
| Guest email verify stores guest data | Conflict 1 (`guest_data` column missing) | Column not added — entire guest register flow breaks |
| Staff auth + routing | Conflict 3 (`sessionStorage` vs `localStorage`) | Not aligned — causes redirect loop on `/staff` |

Conflicts 1 and 3 are **hard blockers** — they break core flows. Conflict 2 degrades (email not sent) but the flow still works.

---

## Definition of Done (Pilot)

The pilot is shippable when:

1. All Day 1 items above are implemented and pass the QA matrix (`docs/qa_test_matrix.md`)
2. All 3 conflicts are resolved
3. Security checklist `docs/security_checklist.md` — all [BLOCKER] items checked
4. The pilot hotel playbook (`docs/pilot_hotel_playbook.md`) has been walked through end-to-end with a test property
5. At least one real guest has registered and chatted
6. At least one staff member has been approved and signed in
