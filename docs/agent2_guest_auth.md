# Agent 2 — Guest Identity & Onboarding

Owner: Agent 2  
Status: Implemented  
Last updated: 2026-06-16

---

## Overview

This document specifies every API endpoint, database method, and UI route owned by Agent 2 for the guest onboarding and authentication system.

### Two guest flows

```
New guest
  └─ POST /api/auth/guest/register
       └─ email verification link → /onboard/guest/verify?t=TOKEN
            └─ POST /api/auth/guest/verify-email (backend)
                 └─ magic link email → /auth/verify?t=TOKEN (existing)
                      └─ GET /api/auth/verify (existing) → mage_session cookie → /

Returning guest
  └─ POST /api/auth/guest/sign-in → mage_session cookie → /
```

---

## Backend APIs

All endpoints live under the existing `/api/auth` router (`backend/app/api/auth.py`).  
Cookie name: `mage_session` (HttpOnly, SameSite=Lax, Secure in production).

---

### POST /api/auth/guest/register

Step 1 of new-guest flow. Stores a pending email-verification record (token stored as SHA-256 hash only) and sends a verification email.

**Request body**

```json
{
  "name":        "Jane Doe",          // required, 1–200 chars
  "email":       "jane@example.com",  // required, valid email
  "booking_id":  "BK12345",           // required
  "room_number": "204",               // optional
  "check_in":    "2026-06-20T00:00:00",  // required ISO datetime
  "check_out":   "2026-06-25T00:00:00",  // required ISO datetime
  "property_id": "grand-horizon"      // optional; defaults to PROPERTY_ID env
}
```

**Success 200**

```json
{
  "verification_sent": true,
  "email": "jane@example.com"
}
```

When `DEBUG=true`, the response also includes:

```json
{
  "verification_sent": true,
  "email": "jane@example.com",
  "verify_url": "http://localhost:3000/onboard/guest/verify?t=<raw-token>"
}
```

**Errors**

| HTTP | `detail`                                     | Cause                          |
|------|----------------------------------------------|--------------------------------|
| 400  | `Name is required`                           | blank name                     |
| 400  | `Email is required`                          | blank email                    |
| 400  | `Booking ID is required`                     | blank booking_id               |
| 400  | `Check-out must be after check-in`           | date range invalid             |
| 400  | `Unknown property: <id>`                     | unknown property_id            |
| 422  | pydantic validation messages                 | malformed JSON / missing fields|
| 500  | `Registration failed. Check server logs.`    | unexpected DB / email error    |

---

### POST /api/auth/guest/verify-email

Step 2 of new-guest flow. Consumes the one-time email-verification token, upserts the guest record, and sends a magic-link email for the final sign-in step.

**Request body**

```json
{ "token": "<raw-token>" }
```

Token may also be passed as the `?t=` query param (GET-compatible for redirect links).

**Success 200**

```json
{
  "verified": true,
  "magic_link_sent": true
}
```

When `DEBUG=true`:

```json
{
  "verified": true,
  "magic_link_sent": true,
  "verify_url": "http://localhost:3000/auth/verify?t=<magic-link-token>"
}
```

**Errors**

| HTTP | `detail`                                         | Cause                                 |
|------|--------------------------------------------------|---------------------------------------|
| 400  | `Invalid or expired verification link. Please register again.` | token missing/expired/already used |
| 422  | `token is required`                              | no token in body or query param       |
| 500  | `Email verification failed. Check server logs.`  | unexpected error                      |

---

### POST /api/auth/guest/sign-in

Returning-guest sign-in. Sets `mage_session` cookie and returns `GuestProfile`. Preserves existing `guest_id` so `conversations` history is intact.

**Request body**

```json
{
  "name":        "Jane Doe",   // required; case-insensitive match
  "booking_id":  "BK12345",   // required
  "property_id": "grand-horizon"  // optional; defaults to PROPERTY_ID env
}
```

**Success 200**  — sets `mage_session` cookie and returns `GuestProfile`

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

**Errors**

| HTTP | `detail`                                             | Cause                        |
|------|------------------------------------------------------|------------------------------|
| 400  | `Name is required`                                   | blank name                   |
| 400  | `Booking ID is required`                             | blank booking_id             |
| 400  | `No stay found matching that name and booking ID.`   | no matching guest record     |
| 500  | `Sign-in failed. Check server logs.`                 | unexpected DB error          |

---

### Preserved endpoints (unchanged by Agent 2)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/auth/magic-link` | PMS/internal: create token + send email |
| `GET`  | `/api/auth/verify?t=` | Exchange token → `mage_session` cookie |
| `GET`  | `/api/auth/session` | Check current session |
| `POST` | `/api/auth/logout` | Clear session cookie |
| `POST` | `/api/auth/email-sign-in` | Dev-only email sign-in (gated by `ALLOW_DEV_GUEST_LOGIN`) |

One change to existing code: `GET /api/auth/verify` now calls `db.mark_auth_token_used()` after successful verification, making magic-link tokens one-time use.

---

## Database methods (owned/extended by Agent 2)

All methods are added to `DatabaseProtocol` (`backend/app/services/database.py`) and implemented in both `PropertyStoreMixin` (mock) and `PropertyStoreSupabase`.

### `create_email_verification`

```python
def create_email_verification(
    self,
    email: str,
    token_hash: str,   # SHA-256 of raw token — raw never stored
    guest_data: dict,  # {name, email, booking_id, room_number, check_in, check_out, property_id}
    property_id: str,
    booking_id: str,
    expires_at: datetime,
) -> None
```

### `consume_email_verification`

```python
def consume_email_verification(self, token_hash: str) -> Optional[dict]
# Returns: {guest_data, email, property_id, booking_id}
# Returns None if: token missing, already consumed (verified_at set), or expired
```

### `get_guest_by_name_and_booking`

```python
def get_guest_by_name_and_booking(
    self, name: str, booking_id: str, property_id: Optional[str] = None
) -> Optional[GuestProfile]
# Case-insensitive name.strip().lower() comparison
```

### `mark_auth_token_used`

```python
def mark_auth_token_used(self, token_hash: str) -> None
# Sets used_at; validate_auth_token now returns None when used_at is set
```

---

## Auth service functions (backend/app/services/auth_service.py)

### `register_guest(...) -> dict`

Creates email-verification row and sends verification email.

### `verify_guest_email(token, ...) -> dict`

Consumes verification token, upserts guest, sends magic link.

### `sign_in_guest_by_name_and_booking(name, booking_id, ...) -> (GuestProfile, cookie_value, version)`

Returning-guest sign-in via name + booking_id lookup.

---

## Email service (backend/app/services/email_service.py)

```python
async def send_email(to: str, subject: str, body: str) -> None
```

- `DEBUG=true` → log only, never raise
- `RESEND_API_KEY` set → send via Resend SDK (lazy import)
- Neither → log warning, email not sent

**Email templates sent by Agent 2:**

1. **Verification email** — subject: `Verify your email — {property_name}`
2. **Magic link email** (via `send_magic_link_email`) — subject: `Your link to chat with {property_name}`

---

## Frontend

### `/onboard/guest` — `frontend/src/app/onboard/guest/page.tsx`

Tab selector → two flows:

**New stay** (tab "New stay — register")

1. Form: name, email, booking ID (required); room number (optional); check-in, check-out (required)
2. `POST /api/auth/guest/register`
3. Shows "Check your email" confirmation (with debug link if `verify_url` returned)

**Returning guest** (tab "Returning guest — sign in")

1. Form: name, booking ID (required)
2. `POST /api/auth/guest/sign-in`
3. Sets session cookie → `router.push('/')`

**Verification callback** — mounted when `?t=` is present in URL

1. `POST /api/auth/guest/verify-email` with token
2. Shows "Email verified! Check inbox for sign-in link"
3. Debug: shows clickable magic link

### `frontend/src/lib/api.ts` — new methods

```typescript
apiClient.registerGuest({ name, email, bookingId, roomNumber?, checkIn, checkOut, propertyId? })
  → ApiResponse<{ verificationSent, email, verifyUrl? }>

apiClient.verifyGuestEmail(token)
  → ApiResponse<{ verified, magicLinkSent, verifyUrl? }>

apiClient.signInGuestByBooking(name, bookingId, propertyId?)
  → ApiResponse<GuestProfile>
```

---

## Supabase schema requirements

The following table is required in Supabase (migration owned by Agent 1):

```sql
CREATE TABLE email_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  guest_data  jsonb NOT NULL,
  property_id text NOT NULL,
  booking_id  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Add used_at to auth_tokens if not already present:
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS used_at timestamptz;
```

---

## Testing

### Local (mock DB, DEBUG=true)

```bash
# 1. Register
curl -s -X POST http://localhost:8000/api/auth/guest/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "booking_id": "BK12345",
    "check_in": "2026-06-20T00:00:00",
    "check_out": "2026-06-25T00:00:00"
  }' | python3 -m json.tool
# → returns verify_url in debug mode

# 2. Verify email (use verify_url token from step 1)
curl -s -X POST "http://localhost:8000/api/auth/guest/verify-email?t=<TOKEN>" \
  | python3 -m json.tool
# → returns verify_url (magic link) in debug mode

# 3. Magic link verify (use verify_url from step 2)
curl -si "http://localhost:8000/api/auth/verify?t=<MAGIC_TOKEN>&redirect=false"
# → Set-Cookie: mage_session=...

# 4. Returning guest sign-in
curl -s -X POST http://localhost:8000/api/auth/guest/sign-in \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "booking_id": "BK12345"}' | python3 -m json.tool
# → GuestProfile JSON + Set-Cookie header
```

### Error cases

```bash
# Expired / reused token
curl -X POST "http://localhost:8000/api/auth/guest/verify-email?t=expired-token"
# → 400 Invalid or expired verification link

# Name mismatch
curl -X POST http://localhost:8000/api/auth/guest/sign-in \
  -H "Content-Type: application/json" \
  -d '{"name": "Wrong Name", "booking_id": "BK12345"}'
# → 400 No stay found matching that name and booking ID
```

---

## Interface to other agents

### Agent 5 (onboarding hub)

- Guest success path: `mage_session` cookie set + `router.push('/')`.
- Onboarding hub entry point: `/onboard/guest` — no `page.tsx` for `/onboard` is owned by Agent 2.
- Agent 5 should link "Guest access" → `/onboard/guest`.

### Agent 7 (email service)

- `send_email(to, subject, body)` signature is stable (see `email_service.py`).
- Agent 7 can extend `email_service.py` to centralise templates, but the call interface must remain unchanged.
- Agent 7 must add `RESEND_API_KEY` and optionally `RESEND_FROM_EMAIL` to `config.py` / `.env.example`.

### Agent 8 (testing & security)

- All three endpoints above are test targets.
- Tokens are SHA-256 hashed; raw tokens are 32-byte URL-safe randoms.
- One-time use enforced on both email-verification tokens (verified_at) and magic-link tokens (used_at).
- Name matching is exact (case-insensitive trim) — no fuzzy matching.
