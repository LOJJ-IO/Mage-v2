# Mage v2 — Cross-Agent Interface Registry

**Owner:** Agent 8 (Integration Lead)
**Audience:** Any agent or developer needing to know exactly what another agent exposes. This is the single source of truth for all inter-agent contracts. Readable without chat history.

If a contract here conflicts with an individual agent's doc, this registry takes precedence — flag the discrepancy to the agent owner.

---

## Known Conflicts (Resolve Before Merge)

| # | Conflict | Impact | Owner |
|---|----------|--------|-------|
| 1 | `email_verifications` table missing `guest_data JSONB` column | Agent 2 cannot reconstruct guest on token consume | Agent 1 fixes migration |
| 2 | `staff_members` table missing `email VARCHAR` column | Staff approval email cannot be sent | Agent 1 + Agent 3 fix |
| 3 | Agent 3 uses `sessionStorage`, Agent 5 uses `localStorage` for staff key | `/staff` redirect loop on login | Pick one — recommend `sessionStorage` |

See `integration_merge_plan.md` for full resolution instructions.

---

## Part 1: Backend HTTP APIs

### Guest Auth (Agent 2)

All routes live in `backend/app/api/auth.py`.

---

#### POST `/api/auth/guest/register`
Auth required: none

**Request:**
```json
{
  "name":        "Jane Doe",
  "email":       "jane@example.com",
  "booking_id":  "BK12345",
  "room_number": "204",               // optional
  "check_in":    "2026-06-20T00:00:00",
  "check_out":   "2026-06-25T00:00:00",
  "property_id": "grand-horizon"      // optional; defaults to PROPERTY_ID env
}
```

**Response 200:**
```json
{
  "verification_sent": true,
  "email": "jane@example.com",
  "verify_url": "..."    // only when DEBUG=true
}
```

**Error codes:** 400 (validation), 422 (missing fields), 500 (DB/email error)
**Consumers:** Agent 5 (frontend redirect), Agent 8 (test G-1)

---

#### POST `/api/auth/guest/verify-email`
Auth required: none. Token may be in body or `?t=` query param.

**Request (body or query param `?t=`):**
```json
{ "token": "<raw-token>" }
```

**Response 200:**
```json
{
  "verified": true,
  "magic_link_sent": true,
  "verify_url": "..."    // only when DEBUG=true
}
```

**Error codes:** 400 (expired/reused/missing), 422, 500
**Consumers:** Agent 5 (frontend callback), Agent 8 (tests G-2 through G-5)

---

#### POST `/api/auth/guest/sign-in`
Auth required: none

**Request:**
```json
{
  "name":        "Jane Doe",
  "booking_id":  "BK12345",
  "property_id": "grand-horizon"    // optional
}
```

**Response 200:** `GuestProfile` + `Set-Cookie: mage_session=...`
```json
{
  "id": "guest-abc12345",
  "name": "Jane Doe",
  "room_number": "204",
  "check_in": "2026-06-20T00:00:00",
  "check_out": "2026-06-25T00:00:00",
  "booking_id": "BK12345",
  "email": "jane@example.com",
  "property_id": "grand-horizon"
}
```

**Error codes:** 400 (not found, blank fields), 500
**Consumers:** Agent 5 (redirect to `/`), Agent 8 (tests G-6, G-7)

---

#### GET `/api/auth/verify?t=<TOKEN>` (existing — modified by Agent 2)
Auth required: none. **CHANGED:** now calls `db.mark_auth_token_used(token_hash)` after success.

**Response:** Sets `mage_session` cookie, redirects to `/` (or returns 200 if `redirect=false`).
**Error codes:** 400 (invalid/used/expired token)
**Consumers:** Agent 2 (magic link handler), Agent 8 (test R-5)

---

### Staff Auth (Agent 3)

All routes live in `backend/app/api/onboarding_staff.py`.

---

#### POST `/api/staff/onboarding/request`
Auth required: none

**Request:**
```json
{
  "display_name":   "Jordan Smith",
  "requested_role": "front_desk",
  "property_id":    "grand-horizon",
  "email":          "jordan@hotel.com"   // required after Conflict 2 resolution
}
```

**Response 200:**
```json
{
  "id":           "<uuid>",
  "staff_code":   "STF-A7K2",
  "display_name": "Jordan Smith",
  "status":       "pending"
}
```

**Note:** `access_key_hash` must NOT appear in this response.
**Consumers:** Agent 5 (frontend request form), Agent 8 (test S-1)

---

#### POST `/api/staff/onboarding/sign-in`
Auth required: none

**Request:**
```json
{
  "access_key":  "<raw-43-char-key>",
  "property_id": "grand-horizon"
}
```

**Response 200:**
```json
{
  "staff_member_id": "<uuid>",
  "staff_code":      "STF-A7K2",
  "display_name":    "Jordan Smith",
  "approved_role":   "front_desk",
  "property_id":     "grand-horizon"
}
```

**Error codes:** 401/403 (bad key, pending, rejected)
**Consumers:** Agent 4 (reads `approved_role`), Agent 5 (stores key + redirects to `/staff`), Agent 8 (tests S-5, S-6)

---

#### GET `/api/admin/staff/pending`
Auth required: `X-Staff-Key` of approved manager or legacy bootstrap key

**Response 200:** Array of `StaffMember` objects with `status="pending"`.
**Note:** `access_key_hash` must NOT appear in any element.
**Consumers:** Agent 8 (test S-2)

---

#### POST `/api/admin/staff/{id}/approve`
Auth required: `X-Staff-Key` of approved manager or legacy bootstrap key

**Request:**
```json
{ "approved_role": "front_desk" }
```

**Response 200:**
```json
{
  "access_key":    "<raw-key-shown-once>",
  "staff_member":  { "id": "...", "status": "approved", "approved_role": "front_desk", ... }
}
```

**Critical:** `access_key` raw value is returned here and **only here**. It is never retrievable again.
**Consumers:** Agent 8 (test S-3, S-9)

---

#### POST `/api/admin/staff/{id}/reject`
Auth required: `X-Staff-Key` of approved manager or legacy bootstrap key

**Response 200:** Updated `StaffMember` with `status="rejected"`.
**Consumers:** Agent 8 (test S-4)

---

### RBAC Session (Agent 4)

Route lives in `backend/app/api/staff.py` (extended by Agent 4).

---

#### GET `/api/staff/session`
Auth required: `X-Staff-Key` (any authenticated staff or bootstrap key)

**Response 200:**
```json
{
  "staff_member_id": "<uuid>",
  "display_name":    "Jordan Smith",
  "approved_role":   "front_desk",
  "property_id":     "grand-horizon",
  "allowed_nav":     ["tasks", "assigned", "schedule", "help-desk"],
  "allowed_action_types": ["MAINTENANCE", "HANDOFF"]
}
```

**Legacy behavior:** If `X-Staff-Key` matches `STAFF_ACCESS_KEY` env, resolves as `manager` (all nav, all action types).
**Consumers:** Agent 5 (hydrate role on app load), Agent 6 (check `allowed_nav` contains `help-desk`), Agent 8 (tests N-1 through N-5)

---

### Task Assist (Agent 6)

Routes live in `backend/app/api/task_assist.py`.

---

#### GET `/api/staff/task-assist/{action_id}`
Auth required: `X-Staff-Key`

**Response 200:**
```json
{
  "action_id": "abc-123",
  "messages": [
    { "role": "user",      "content": "...", "created_at": "2026-06-16T10:00:00+00:00" },
    { "role": "assistant", "content": "...", "created_at": "2026-06-16T10:00:01+00:00" }
  ]
}
```

**Error codes:** 404 (action not found), 401/403 (bad key)
**Consumers:** Agent 8 (test T-4)

---

#### POST `/api/staff/task-assist`
Auth required: `X-Staff-Key`

**Request:**
```json
{
  "action_id":       "abc-123",
  "message":         "How do I handle a clogged shower drain?",
  "staff_member_id": "<uuid>"   // optional
}
```

**Response 200:**
```json
{
  "reply":    "Here are the steps...",
  "messages": [ /* full thread */ ]
}
```

**Error codes:** 404 (action not found), 502 (LLM call failed), 401/403
**Consumers:** Agent 8 (tests T-3, T-4)

---

### Preserved (Frozen) Endpoints

These are not owned by any new agent. Do not modify.

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/auth/magic-link` | PMS: create token + send email |
| `POST` | `/api/auth/logout` | Clear mage_session |
| `GET`  | `/api/auth/session` | Check guest session |
| `POST` | `/api/chat/message` | Guest chat (streaming) |
| `GET`  | `/api/staff/actions` | Kanban tasks (Agent 4 adds role filter) |
| `PATCH`| `/api/staff/actions/{id}` | Patch task status |
| `GET`  | `/api/staff/guests/*` | Guest inbox |
| `GET`  | `/api/staff/knowledge/*` | Knowledge base |
| `POST` | `/api/staff/knowledge/*` | Knowledge mutation (manager/front_desk only) |
| `POST` | `/api/webhooks/pms-checkin` | PMS webhook |
| `GET`  | `/api/dashboard/*` | Analytics dashboard |
| `POST` | `/api/transcription` | Voice transcription |

---

## Part 2: Database Protocol Methods

All methods are on `DatabaseProtocol` in `backend/app/services/database.py` and implemented in both `MockDatabase` and `SupabaseDatabase`. **Owner: Agent 1** for all new methods below.

### Staff methods

| Method | Signature | Consumers |
|--------|-----------|-----------|
| `create_staff_request` | `(property_id, display_name, requested_role, email?) → StaffMember` | Agent 3 |
| `get_staff_member_by_id` | `(id: str) → Optional[StaffMember]` | Agent 3, 4 |
| `get_staff_member_by_code` | `(property_id, staff_code) → Optional[StaffMember]` | Agent 3 |
| `get_staff_member_by_access_key_hash` | `(hash: str) → Optional[StaffMember]` | Agent 3, 4 |
| `list_pending_staff` | `(property_id) → List[StaffMember]` | Agent 3 |
| `list_staff_members` | `(property_id, status=None) → List[StaffMember]` | Agent 3 |
| `approve_staff_member` | `(id, approved_role, access_key_hash, approved_by) → Optional[StaffMember]` | Agent 3 |
| `reject_staff_member` | `(id, approved_by=None) → Optional[StaffMember]` | Agent 3 |

### Email verification methods

| Method | Signature | Consumers |
|--------|-----------|-----------|
| `create_email_verification` | `(email, token_hash, guest_data, property_id, booking_id, expires_at) → None` | Agent 2 |
| `consume_email_verification` | `(token_hash) → Optional[dict]` returns `{guest_data, email, property_id, booking_id}` | Agent 2 |

**⚠ Conflict 1:** `guest_data` param requires `guest_data JSONB` column in `email_verifications` table — not present in current migration. Agent 1 must add it.

### Task assist methods

| Method | Signature | Consumers |
|--------|-----------|-----------|
| `get_task_assist_thread` | `(action_id, staff_member_id) → Optional[dict]` | Agent 6 |
| `upsert_task_assist_thread` | `(action_id, staff_member_id, property_id, messages_json) → dict` | Agent 6 |

### Guest extensions

| Method | Signature | Consumers |
|--------|-----------|-----------|
| `get_guest_by_name_and_booking` | `(name, booking_id, property_id=None) → Optional[GuestProfile]` | Agent 2 |
| `mark_auth_token_used` | `(token_hash) → None` | Agent 2 |

---

## Part 3: Frontend Library Exports

### `frontend/src/lib/api.ts` (extended by Agents 2, 3, 6)

**Guest methods (Agent 2):**

```typescript
apiClient.registerGuest(params: {
  name: string; email: string; bookingId: string;
  roomNumber?: string; checkIn: string; checkOut: string; propertyId?: string;
}) → ApiResponse<{ verificationSent: boolean; email: string; verifyUrl?: string }>

apiClient.verifyGuestEmail(token: string)
  → ApiResponse<{ verified: boolean; magicLinkSent: boolean; verifyUrl?: string }>

apiClient.signInGuestByBooking(name: string, bookingId: string, propertyId?: string)
  → ApiResponse<GuestProfile>
```

**Staff methods (Agent 3):**

```typescript
apiClient.requestStaffAccess(params: {
  displayName: string; requestedRole: string; propertyId?: string; email?: string;
}) → ApiResponse<{ id: string; staffCode: string; status: string }>

apiClient.staffSignIn(accessKey: string, propertyId?: string)
  → ApiResponse<{ staffMemberId: string; staffCode: string; displayName: string; approvedRole: string; propertyId: string }>

apiClient.listPendingStaff(propertyId?: string)
  → ApiResponse<StaffMember[]>

apiClient.approveStaff(id: string, approvedRole: string)
  → ApiResponse<{ accessKey: string; staffMember: StaffMember }>

apiClient.rejectStaff(id: string)
  → ApiResponse<StaffMember>
```

**Task assist methods (Agent 6):**

```typescript
apiClient.getTaskAssistThread(actionId: string)
  → ApiResponse<{ actionId: string; messages: TaskAssistMessage[] }>

apiClient.sendTaskAssistMessage(params: {
  actionId: string; message: string; staffMemberId?: string;
}) → ApiResponse<{ reply: string; messages: TaskAssistMessage[] }>
```

---

### `frontend/src/lib/onboarding.ts` (Agent 5)

```typescript
export const ALLOW_DEV_LOGIN: boolean   // from NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN

export async function checkGuestSession(): Promise<boolean>
// Checks sessionStorage for guest ID, then calls GET /api/auth/session

export function hasStoredStaffKey(): boolean
// Synchronous check — reads from sessionStorage via getStoredStaffKey()
// ⚠ Conflict 3: Agent 5 doc says localStorage; must align with Agent 3 (sessionStorage)
```

---

### `frontend/src/lib/staffPermissions.ts` (Agent 4)

```typescript
export type StaffRole = 'manager' | 'front_desk' | 'maintenance' | 'housekeeping' | 'room_service'

export const NAV_PERMISSIONS: Record<StaffRole, string[]>
// Maps role → allowed nav IDs

export const ACTION_TYPE_PERMISSIONS: Record<StaffRole, string[]>
// Maps role → allowed ActionType values

export function getAllowedNav(role: StaffRole): string[]
export function getAllowedActionTypes(role: StaffRole): string[]
export function canBrowseHelpDesk(role: StaffRole): boolean
export function canUseTaskAssist(role: StaffRole): boolean
```

---

## Part 4: sessionStorage Keys

| Key | Type | Set by | Read by | Notes |
|-----|------|--------|---------|-------|
| `mage-staff-key` | `string` | Agent 3 (`/onboard/staff` sign-in) | Agent 4 (session verify), Agent 5 (`hasStoredStaffKey`) | Raw access key — never logged |
| `mage-staff-role` | `string` | Agent 5 (optional) or Agent 4 | Agent 6, Agent 5 | `approved_role` string |
| `mage-guest-id` | `string` | Guest app (`page.tsx`) | Guest app (`page.tsx`) | Guest ID for session hydration |

**⚠ Conflict 3:** `mage-staff-key` must use `sessionStorage` (Agent 3 contract + existing `stateMachineStaff.ts`). Agent 5's routing doc references `localStorage` — this must be corrected.

---

## Part 5: Email Service Contract

**Owner: Agent 7.** File: `backend/app/services/email_service.py`.

```python
async def send_email(to: str, subject: str, body: str) -> bool
# Returns True on success (or in DEBUG=true mode)
# Returns False on delivery failure (never raises)
# DEBUG=true → logs to console, never sends
# RESEND_API_KEY set → sends via Resend SDK
# Neither → logs warning, returns False
```

**Consumers:** Agent 2 (`register_guest`, `verify_guest_email` → sends verification + magic link emails), Agent 3 (`approve_staff_member` → sends access key email).

**Email templates by event:**

| Event | Subject | Sent by | Template |
|-------|---------|---------|----------|
| Guest email verify | `Verify your email — {HOTEL_NAME}` | Agent 2 | agent7_email_templates.md #1 |
| Guest magic link | `Your link to chat with {property_name}` | Agent 2 | agent7_email_templates.md #2 |
| Staff request received | `Your Mage staff request has been received` | Agent 3 (optional) | agent7_email_templates.md #3 |
| Staff approved | `You're approved — your Mage access key is ready` | Agent 3 | agent7_email_templates.md #4 |
| Staff rejected | `Update on your Mage staff request` | Agent 3 (optional) | agent7_email_templates.md #5 |

---

## Part 6: Environment Variables

All env vars are set in Vercel backend service. **Owner: Agent 7** for new additions.

### Required for onboarding layer to function

| Variable | Owner | Purpose |
|----------|-------|---------|
| `RESEND_API_KEY` | Agent 7 | Transactional email delivery |
| `RESEND_FROM_EMAIL` | Agent 7 | Sender address (must be verified domain) |
| `FRONTEND_URL` | Agent 7 | Embedded in magic-link + verify email URLs |
| `STAFF_ACCESS_KEY` | Agent 7 (extend) | Bootstrap manager key — must be changed from default |

### Frontend env vars

| Variable | Owner | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN` | Agent 5 | `true` → show legacy inline sign-in at `/`; unset in prod |

### Full env var list
See `docs/agent7_deployment.md` for the complete required/optional table.

---

## Part 7: Frontend Route Map

| Path | Owner | Auth | Notes |
|------|-------|------|-------|
| `/` | Agent 5 | Guest session | Redirects to `/onboard` if no session and `ALLOW_DEV_LOGIN=false` |
| `/onboard` | Agent 5 | None | Three-door hub |
| `/onboard/guest` | Agent 2 | None | Registration + returning sign-in + verify callback |
| `/onboard/staff` | Agent 3 | None | Staff request + sign-in |
| `/onboard/admin` | Agent 3 | Manager key (inline) | Approval portal |
| `/staff` | Agent 5 | Staff key in sessionStorage | Redirects to `/onboard/staff` if no key |
| `/welcome` | Agent 5 | None | Redirect shim → `/onboard` |
| `/dashboard` | Frozen | Dashboard key | Untouched |
| `/auth/verify` | Existing (Agent 2 modifies backend) | None | Magic link exchange |

---

## Summary: Producer → Consumer Matrix

| Interface | Producer | Consumers |
|-----------|----------|-----------|
| DB staff/email/thread methods | Agent 1 | 2, 3, 6 |
| `send_email(to, subject, body)` | Agent 7 | 2, 3 |
| `POST /api/auth/guest/register` + verify + sign-in | Agent 2 | 5, 8 |
| `POST /api/staff/onboarding/*` + `/api/admin/staff/*` | Agent 3 | 4, 5, 8 |
| `GET /api/staff/session` + RBAC matrix | Agent 4 | 5, 6, 8 |
| `/onboard` route map + redirect helpers | Agent 5 | 8 |
| `POST /api/staff/task-assist` | Agent 6 | 8 |
| Deployment env vars + email templates | Agent 7 | 2, 3, 8 |
