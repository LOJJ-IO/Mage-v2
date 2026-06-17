# Mage v2 — QA Test Matrix

**Owner:** Agent 8 (Integration Lead)
**Audience:** QA engineer or developer running pre-merge verification. Readable without chat history.

Run tests in the order listed. New-flow tests (G, S, N, T) exercise the onboarding layer. Regression tests (R) verify frozen systems still work post-merge. All R tests must pass before any merge wave is considered complete.

---

## Setup

```bash
# Local dev (mock DB, emails logged not sent)
cd backend
DATABASE_TYPE=mock DEBUG=true uvicorn app.main:app --reload

# Frontend
cd frontend
NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN=true npm run dev
```

Default test property: `grand-horizon`
Default bootstrap key: `mage-staff-dev`
Default dev manager key (mock): `dev-manager-key-grand-horizon`

---

## G — Guest Auth Flows

### G-1: New guest registration — happy path

```bash
curl -s -X POST http://localhost:8000/api/auth/guest/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","booking_id":"BK-TEST-001","check_in":"2026-07-10T00:00:00","check_out":"2026-07-15T00:00:00"}'
```

**Expected:**
```json
{
  "verification_sent": true,
  "email": "jane@example.com",
  "verify_url": "http://localhost:3000/onboard/guest/verify?t=<TOKEN>"
}
```
`verify_url` present only in `DEBUG=true` mode.

---

### G-2: Email verification — happy path

Take `<TOKEN>` from G-1 response.

```bash
curl -s "http://localhost:8000/api/auth/guest/verify-email?t=<TOKEN>"
```

**Expected:**
```json
{
  "verified": true,
  "magic_link_sent": true,
  "verify_url": "http://localhost:3000/auth/verify?t=<MAGIC_TOKEN>"
}
```

---

### G-3: Magic link exchange — happy path

Take `<MAGIC_TOKEN>` from G-2 response.

```bash
curl -si "http://localhost:8000/api/auth/verify?t=<MAGIC_TOKEN>"
```

**Expected:**
- HTTP 200 (or redirect with 302)
- `Set-Cookie: mage_session=...` header present

---

### G-4: Guest verify — expired token

Simulate or wait for token expiry. Use a token that has already passed its `expires_at`.

```bash
curl -s "http://localhost:8000/api/auth/guest/verify-email?t=expired-or-fake-token"
```

**Expected:** `HTTP 400` — `"Invalid or expired verification link. Please register again."`

---

### G-5: Guest verify — reused token

Use the same `<TOKEN>` from G-1 a second time (after already calling G-2).

```bash
curl -s "http://localhost:8000/api/auth/guest/verify-email?t=<TOKEN>"
```

**Expected:** `HTTP 400` — `"Invalid or expired verification link. Please register again."`

---

### G-6: Returning guest sign-in — happy path

(Requires G-1 through G-3 to have completed, creating a guest record.)

```bash
curl -si -X POST http://localhost:8000/api/auth/guest/sign-in \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","booking_id":"BK-TEST-001"}'
```

**Expected:**
- HTTP 200
- `Set-Cookie: mage_session=...`
- Body: `GuestProfile` JSON with same `id` as created in G-1 flow

---

### G-7: Returning guest sign-in — name mismatch

```bash
curl -s -X POST http://localhost:8000/api/auth/guest/sign-in \
  -H "Content-Type: application/json" \
  -d '{"name":"Wrong Name","booking_id":"BK-TEST-001"}'
```

**Expected:** `HTTP 400` — `"No stay found matching that name and booking ID."`

---

### G-8: Guest chat history preserved after returning sign-in

1. Complete G-1 through G-3 (creates guest + session).
2. Open `http://localhost:3000` with the `mage_session` cookie — send at least one chat message.
3. Clear the `mage_session` cookie (log out or clear browser storage).
4. Complete G-6 (returning sign-in).
5. Open `http://localhost:3000` again.

**Expected:** Previous chat messages are still visible in the conversation.

---

### G-9: Guest registration — missing required field

```bash
curl -s -X POST http://localhost:8000/api/auth/guest/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com"}'
```

**Expected:** `HTTP 422` — Pydantic validation error mentioning `booking_id`, `check_in`, `check_out`.

---

### G-10: Guest registration — invalid date range

```bash
curl -s -X POST http://localhost:8000/api/auth/guest/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","booking_id":"BK-BAD","check_in":"2026-07-15T00:00:00","check_out":"2026-07-10T00:00:00"}'
```

**Expected:** `HTTP 400` — `"Check-out must be after check-in"`

---

## S — Staff Auth Flows

### S-1: Staff request access — happy path

```bash
curl -s -X POST http://localhost:8000/api/staff/onboarding/request \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Jordan Smith","requested_role":"front_desk","property_id":"grand-horizon"}'
```

**Expected:**
```json
{
  "staff_code": "STF-XXXX",
  "status": "pending",
  "display_name": "Jordan Smith"
}
```
Note the `staff_code` and `id` for subsequent steps.

---

### S-2: Manager lists pending staff

```bash
curl -s http://localhost:8000/api/admin/staff/pending \
  -H "X-Staff-Key: dev-manager-key-grand-horizon"
```

**Expected:** Array containing the request from S-1 with `status="pending"`.

---

### S-3: Manager approves staff — happy path

Use `<STAFF_ID>` from S-1 response.

```bash
curl -s -X POST http://localhost:8000/api/admin/staff/<STAFF_ID>/approve \
  -H "X-Staff-Key: dev-manager-key-grand-horizon" \
  -H "Content-Type: application/json" \
  -d '{"approved_role":"front_desk"}'
```

**Expected:**
```json
{
  "access_key": "<RAW_KEY>",
  "staff_member": { "status": "approved", "approved_role": "front_desk", ... }
}
```
`access_key` is returned exactly once. Save it for S-5.

---

### S-4: Manager rejects a different staff request

Create another request (same flow as S-1 with a different name), then:

```bash
curl -s -X POST http://localhost:8000/api/admin/staff/<OTHER_ID>/reject \
  -H "X-Staff-Key: dev-manager-key-grand-horizon"
```

**Expected:** `{"status": "rejected", ...}`

---

### S-5: Staff sign-in with valid access key

Use `<RAW_KEY>` from S-3.

```bash
curl -s -X POST http://localhost:8000/api/staff/onboarding/sign-in \
  -H "Content-Type: application/json" \
  -d '{"access_key":"<RAW_KEY>","property_id":"grand-horizon"}'
```

**Expected:**
```json
{
  "staff_member_id": "<UUID>",
  "staff_code": "STF-XXXX",
  "display_name": "Jordan Smith",
  "approved_role": "front_desk",
  "property_id": "grand-horizon"
}
```

---

### S-6: Staff sign-in with invalid key

```bash
curl -s -X POST http://localhost:8000/api/staff/onboarding/sign-in \
  -H "Content-Type: application/json" \
  -d '{"access_key":"completely-wrong-key","property_id":"grand-horizon"}'
```

**Expected:** `HTTP 401` or `HTTP 403`

---

### S-7: Rejected staff cannot sign in

Use `<OTHER_ID>` from S-4. Attempt sign-in with that staff member's (never-issued) key.

**Expected:** Same 401/403 as S-6 — rejected staff have no access key at all.

---

### S-8: Non-manager blocked from admin endpoint

Use the `<RAW_KEY>` from S-3 (which is a `front_desk` key) on an admin route.

```bash
curl -s http://localhost:8000/api/admin/staff/pending \
  -H "X-Staff-Key: <FRONT_DESK_RAW_KEY>"
```

**Expected:** `HTTP 403` — `"Manager access required"`

---

### S-9: Bootstrap manager approval (legacy key)

Simulate first-hotel bootstrap: use the env `STAFF_ACCESS_KEY` (default `mage-staff-dev`) to approve a manager-role request.

```bash
# First create a manager request
curl -s -X POST http://localhost:8000/api/staff/onboarding/request \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Hotel GM","requested_role":"manager","property_id":"grand-horizon"}'
# Note the id, then approve with bootstrap key
curl -s -X POST http://localhost:8000/api/admin/staff/<MGR_ID>/approve \
  -H "X-Staff-Key: mage-staff-dev" \
  -H "Content-Type: application/json" \
  -d '{"approved_role":"manager"}'
```

**Expected:** Returns `access_key` + `status=approved` — bootstrap key accepted.

---

## N — Nav & RBAC Filtering

For each role below: sign in via S-5 with a key of that role, then check `GET /api/staff/session`.

### N-1 through N-5: Per-role session response

```bash
curl -s http://localhost:8000/api/staff/session \
  -H "X-Staff-Key: <ROLE_KEY>"
```

| Test | Role | Expected `allowed_nav` | Expected `allowed_action_types` |
|------|------|------------------------|----------------------------------|
| N-1 | manager | tasks, assigned, schedule, review, guest-chat, help-desk, knowledge | MAINTENANCE, ROOM_SERVICE, HOUSEKEEPING, CONTACT_FRONT_DESK, HANDOFF |
| N-2 | front_desk | tasks, assigned, schedule, review, guest-chat, help-desk, knowledge | MAINTENANCE, ROOM_SERVICE, HOUSEKEEPING, CONTACT_FRONT_DESK, HANDOFF |
| N-3 | maintenance | tasks, assigned, schedule, help-desk | MAINTENANCE, HANDOFF |
| N-4 | housekeeping | tasks, assigned, schedule, help-desk | HOUSEKEEPING, HANDOFF |
| N-5 | room_service | tasks, assigned, schedule, help-desk | ROOM_SERVICE, HANDOFF |

### N-6: Kanban filtered on GET /api/staff/actions (maintenance role)

```bash
curl -s "http://localhost:8000/api/staff/actions" \
  -H "X-Staff-Key: <MAINTENANCE_KEY>"
```

**Expected:** Only `MAINTENANCE` and `HANDOFF` action types in the response. No `ROOM_SERVICE` or `HOUSEKEEPING` tasks.

### N-7: Frontend nav tabs hidden (UI test)

Sign in as `maintenance` role → navigate to `/staff`.

**Expected:**
- Sidebar shows: Tasks, Assigned, Schedule, Help Desk
- Sidebar does NOT show: Reviews, Guest Chat, Knowledge
- Help desk "Browse" mode should not be accessible via sidebar (but task assist is still accessible via task detail)

---

## T — Task Assist (Help Desk Copilot)

### T-1: "Get help with this task" button visible on assigned task

Sign in as any `TASK_HELP_ROLES` role (maintenance, housekeeping, room_service, front_desk, manager).
Open an assigned task in the detail panel.

**Expected:** "Get help with this task" button visible in the task detail panel.

---

### T-2: Button opens help desk in task mode

Click "Get help with this task".

**Expected:**
- URL changes to `/staff?nav=help-desk&task=<actionId>`
- Help desk opens in chat-heavy task mode (not the browse/category grid)
- Composer is pre-filled with task context (type, guest name, room, status, source message)

---

### T-3: Task assist — AI responds

Edit the composer if needed, hit send.

```bash
curl -s -X POST http://localhost:8000/api/staff/task-assist \
  -H "X-Staff-Key: <STAFF_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"action_id":"<ACTION_ID>","message":"How do I handle a clogged shower drain?"}'
```

**Expected:**
```json
{
  "reply": "Here are the steps...",
  "messages": [
    {"role": "user", "content": "...", "created_at": "..."},
    {"role": "assistant", "content": "...", "created_at": "..."}
  ]
}
```

---

### T-4: Thread persists across reload

After T-3, reload the page (`/staff?nav=help-desk&task=<actionId>`).

```bash
curl -s "http://localhost:8000/api/staff/task-assist/<ACTION_ID>" \
  -H "X-Staff-Key: <STAFF_KEY>"
```

**Expected:** Response includes the prior conversation messages.

---

### T-5: Browse help desk unaffected

Sign in as manager or front_desk. Navigate to help desk via sidebar (without `?task=` param).

**Expected:** Browse mode (category grid / knowledge browse) renders as before. No regression to existing help desk layout.

---

### T-6: Task-assist 404 on unknown action

```bash
curl -s "http://localhost:8000/api/staff/task-assist/nonexistent-action-id" \
  -H "X-Staff-Key: <STAFF_KEY>"
```

**Expected:** `HTTP 404`

---

## R — Regression Tests (Frozen Systems)

These must pass after every merge wave. Failure in any R test blocks the next wave.

---

### R-1: Guest chat state machine — full 11-state flow

1. Create a guest session (G-1 through G-3).
2. Open `http://localhost:3000`.
3. Interact through: greeting → intent detection → service request → escalation → resolution.

**Expected:** All 11 states reachable; no broken transitions; no JS console errors.

---

### R-2: Streaming chat (SSE)

```bash
curl -s -N -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -H "Cookie: mage_session=<SESSION_VALUE>" \
  -d '{"message":"What time is checkout?","conversation_id":"test"}'
```

**Expected:** Server-Sent Events stream — multiple `data:` lines arrive before connection closes. No immediate 500.

---

### R-3: Staff kanban — load and patch

```bash
# Load tasks
curl -s http://localhost:8000/api/staff/actions \
  -H "X-Staff-Key: mage-staff-dev"

# Patch a task status
curl -s -X PATCH http://localhost:8000/api/staff/actions/<ACTION_ID> \
  -H "X-Staff-Key: mage-staff-dev" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'
```

**Expected:** Actions list returns without error; PATCH returns updated action with new status.

---

### R-4: PMS webhook

```bash
curl -s -X POST http://localhost:8000/api/webhooks/pms-checkin \
  -H "Content-Type: application/json" \
  -d '{"booking_id":"BK-WEBHOOK-001","guest_name":"Webhook Test","room_number":"101","check_in":"2026-07-10T14:00:00","check_out":"2026-07-14T11:00:00"}'
```

**Expected:** `HTTP 200` — webhook accepted. Guest session or magic link created.

---

### R-5: Magic link (PMS flow) — existing endpoint preserved

```bash
# Create magic link
curl -si -X POST http://localhost:8000/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"pms@example.com","guest_name":"PMS Guest","booking_id":"BK-PMS","room_number":"201","check_in":"2026-07-10T00:00:00","check_out":"2026-07-14T00:00:00"}'
# Extract token from logged output or DEBUG verify_url
# Exchange token
curl -si "http://localhost:8000/api/auth/verify?t=<TOKEN>"
```

**Expected:** `Set-Cookie: mage_session=...` header. The `mark_auth_token_used` change (Agent 2) must not break this — second call returns 400, but first call still sets the cookie.

---

### R-6: Voice transcription

```bash
curl -s -X POST http://localhost:8000/api/transcription \
  -H "Cookie: mage_session=<SESSION>" \
  -F "audio=@test_audio.wav"
```

**Expected:** `{"transcript": "..."}` — any non-empty transcript. If `TRANSCRIPTION_PROVIDER=local` and Whisper isn't running, acceptable to get a controlled error. On Vercel, `openai` provider must work.

---

### R-7: Knowledge crawl

```bash
curl -s -X POST http://localhost:8000/api/staff/knowledge/crawl \
  -H "X-Staff-Key: mage-staff-dev" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","property_id":"grand-horizon"}'
```

**Expected:** `HTTP 200` — job accepted. Crawl results visible in knowledge tree after processing.

---

### R-8: Dashboard metrics

```bash
curl -s "http://localhost:8000/api/dashboard/metrics" \
  -H "X-Dashboard-Key: lojj-dash-dev"
```

**Expected:** `HTTP 200` — metrics JSON returned. No 403 or 500.

---

## Environment-Specific Notes

| Env | Notable differences |
|-----|---------------------|
| Local (mock DB) | `verify_url` returned in register/verify responses; emails logged to console; dev seed manager key works |
| Local (Supabase) | Set `DATABASE_TYPE=supabase` + real Supabase creds; seed data not present — run migrations first |
| Vercel production | `DEBUG=false` — no `verify_url` in responses; emails sent via Resend; `TRANSCRIPTION_PROVIDER=openai` |

---

## Definition of Done

All of the following must be true before marking the pilot ready:

- [ ] G-1 through G-10: all pass
- [ ] S-1 through S-9: all pass
- [ ] N-1 through N-7: all pass
- [ ] T-1 through T-6: all pass
- [ ] R-1 through R-8: all pass (frozen systems unbroken)
- [ ] No `access_key_hash` or `token_hash` visible in any API response body
- [ ] Magic link one-time use confirmed (R-5 second call returns 400)
- [ ] `mage_session` cookie has `HttpOnly` and `Secure` flags in production
