# Agent 3: Staff & Admin Auth — Interface Contract

**Owner:** Agent 3 (Staff & Admin Identity Engineer)  
**Consumers:** Agent 4 (RBAC / session hydration), Agent 5 (onboarding hub), Agent 8 (E2E test plan)

---

## Overview

Mage replaces a single shared `STAFF_ACCESS_KEY` with **per-staff access keys**.  
Every staff member has a unique opaque key; the backend validates key → hash → approved
status → role on every protected request.

The `X-Staff-Key` header pattern and `sessionStorage['mage-staff-key']` contract are
**unchanged** — existing staff workspace routes work without modification.

---

## New API Routes

All routes are mounted under `POST/GET /api/` via `backend/app/api/onboarding_staff.py`.

### Public (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/staff/onboarding/request` | Submit access request; returns staff_code |
| `POST` | `/api/staff/onboarding/sign-in` | Exchange access key for identity |

### Manager-gated (`X-Staff-Key` of approved manager or bootstrap key)

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/admin/staff/pending` | List pending requests |
| `POST` | `/api/admin/staff/{id}/approve` | Approve + issue one-time access key |
| `POST` | `/api/admin/staff/{id}/reject` | Reject request |

---

## Sign-in Response Shape (Agent 4 contract)

`POST /api/staff/onboarding/sign-in` returns:

```json
{
  "staff_member_id": "uuid-v4-string",
  "staff_code":      "STF-A7K2",
  "display_name":    "Jordan Smith",
  "approved_role":   "front_desk",
  "property_id":     "grand-horizon"
}
```

**Agent 4 must** use `approved_role` to hydrate the RBAC permission matrix after sign-in.
The frontend page at `/onboard/staff` stores the raw access key in
`sessionStorage['mage-staff-key']` (via `setStoredStaffKey`) and can optionally store
`approved_role` under `sessionStorage['mage-staff-role']` for Agent 4's use.

### `approved_role` values (frozen)

| Value | Label |
|-------|-------|
| `manager` | Manager |
| `front_desk` | Front Desk |
| `maintenance` | Maintenance |
| `housekeeping` | Housekeeping |
| `room_service` | Room Service |

---

## Access Key Lifecycle

```
Request → PENDING (staff_code issued, no key)
             │
             │  Manager approves
             ▼
         APPROVED (SHA-256 hash stored, plain key shown once)
             │
             │  Manager rejects
             ▼
         REJECTED (no key, cannot sign in)
```

- Key generation: `secrets.token_urlsafe(32)` → 43 URL-safe characters.
- Storage: only the SHA-256 hex digest is persisted (`access_key_hash` column).
- The plain-text key is returned **exactly once** in `POST /api/admin/staff/{id}/approve`.
  It is never logged and cannot be retrieved again.
- Key rotation: out of scope for v1. Re-approve to issue a new key.

---

## Manager Auth on Admin Routes

The `verify_manager_key(db, raw_key, settings)` function in
`backend/app/services/staff_auth_service.py` checks in order:

1. **Bootstrap:** if `raw_key == settings.staff_access_key` (the legacy `STAFF_ACCESS_KEY`
   env var, default `mage-staff-dev`), return `None` (treated as implicit manager).
   This allows the first real manager to be approved before any per-user managers exist.

2. **Per-user manager:** hash the key, look up `staff_members`, verify
   `status == approved` and `approved_role == manager`. Return the `StaffMember`.

3. **Anything else:** raise `HTTP 403 Manager access required`.

**Agent 4 note:** `GET /api/staff/session` (Agent 4's responsibility) should follow the
same two-path check pattern for the main workspace session; Agent 4 implements that
endpoint independently using `verify_manager_key` or an equivalent role check.

---

## sessionStorage Contract

| Key | Set by | Value | Notes |
|-----|--------|-------|-------|
| `mage-staff-key` | Agent 3 (`/onboard/staff`) | Raw access key string | Unchanged from legacy |
| `mage-staff-role` | Agent 5 / Agent 4 (optional) | `approved_role` string | Not yet set by Agent 3 |

After sign-in, `setStoredStaffKey(rawKey)` is called (from `lib/stateMachineStaff.ts`),
then the user is redirected to `/staff`. `StaffStateRenderer` reads the stored key and
bypasses the PIN screen as before (state `S-S-002`).

---

## Bootstrap Runbook (first hotel deployment)

1. Deploy with `STAFF_ACCESS_KEY=<some-secure-value>` in the Vercel env.
2. A hotel manager navigates to `/onboard/staff` → "Request access" → selects role
   `manager` → submits → notes their **Staff ID** (e.g. `STF-A7K2`).
3. An operator opens `/onboard/admin`, enters the legacy `STAFF_ACCESS_KEY` as the
   manager key, and approves the manager's request.
4. The manager receives their personal access key (shown once).
5. From this point, the manager uses their personal key for all admin operations.
6. Rotate or disable `STAFF_ACCESS_KEY` in Vercel once at least one manager is approved.

---

## Files Owned by Agent 3

| File | Purpose |
|------|---------|
| `backend/app/services/staff_auth_service.py` | Business logic (hash, sign-in, approve, reject, verify manager) |
| `backend/app/api/onboarding_staff.py` | FastAPI router — 5 endpoints |
| `frontend/src/app/onboard/staff/page.tsx` | Request access + sign-in UI |
| `frontend/src/app/onboard/admin/page.tsx` | Manager approval portal |
| `frontend/src/lib/api.ts` (extended) | `requestStaffAccess`, `staffSignIn`, `listPendingStaff`, `approveStaff`, `rejectStaff` |
| `backend/app/services/database.py` (extended) | Mock DB implementations for `staff_members` CRUD |

---

## Non-Changes (Preserved)

- `verify_staff_key()` in `api/staff.py` — unchanged, still validates `X-Staff-Key`
  against `STAFF_ACCESS_KEY` for existing `/api/staff/*` routes until Agent 4 upgrades it.
- `StaffPinScreen` component — reused as-is.
- `StaffStateRenderer` state machine (S-S-001 → S-S-003) — untouched.
- `sessionStorage['mage-staff-key']` key name — unchanged.
- All staff kanban, schedule, reviews, guest inbox, knowledge routes — frozen.
