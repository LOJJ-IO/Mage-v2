# Mage v2 — Integration Merge Plan

**Owner:** Agent 8 (Integration Lead)
**Audience:** Developer executing the merge. Readable without chat history.

---

## Pre-Merge: Conflicts That Must Be Resolved First

Three cross-agent contract mismatches were found by reviewing all agent docs against the actual SQL migration. Merge is blocked until these are resolved.

---

### CONFLICT 1 — `email_verifications` missing `guest_data` column

**Files in conflict:**
- `docs/supabase_onboarding_migration.sql` (Agent 1) — table has no `guest_data` column
- `docs/agent2_guest_auth.md` — `create_email_verification(...)` passes `guest_data: dict`; `consume_email_verification` returns `{guest_data, email, property_id, booking_id}`

**Impact:** Agent 2's `verify_guest_email` reads `guest_data` from the consumed token to reconstruct the guest record before upserting it. Without the column, this data is lost and the guest cannot be created.

**Resolution (Agent 1):**
Add to `supabase_onboarding_migration.sql` before running in production:
```sql
ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS guest_data JSONB NOT NULL DEFAULT '{}';
```
Agent 1 must also update `EmailVerification` Pydantic model and both DB implementations.

---

### CONFLICT 2 — `staff_members` missing `email` column

**Files in conflict:**
- `docs/supabase_onboarding_migration.sql` (Agent 1) — no `email` field on `staff_members`
- `docs/agent7_email_templates.md` (Agent 7) — Template 4 emails the access key to the staff member on approval
- `docs/agent3_staff_admin_auth.md` (Agent 3) — `create_staff_request` does not mention collecting email

**Impact:** Staff approval email cannot be sent; there is nowhere to store or retrieve the staff member's email.

**Resolution (Agent 1 + Agent 3):**
- Agent 1: Add `email VARCHAR(255)` (nullable for v1 to avoid breaking anything) to `staff_members`
- Agent 3: Add `email` field to the `/api/staff/onboarding/request` form and `StaffMember` schema
- If this is not resolved before launch, staff approval email becomes a Phase 2 item (see `mvp_cut_line.md`)

---

### CONFLICT 3 — `sessionStorage` vs `localStorage` for staff key

**Files in conflict:**
- `docs/agent3_staff_admin_auth.md` — "The `sessionStorage['mage-staff-key']` contract is unchanged"
- `docs/agent5_routing.md` — "check `localStorage` for staff key via `hasStoredStaffKey()`"
- `frontend/src/lib/stateMachineStaff.ts` — existing helpers use `sessionStorage`

**Impact:** If Agent 5 and Agent 3 write to different storage APIs, the key stored by one won't be found by the other. The `/staff` page will loop to `/onboard/staff` on every visit.

**Resolution (must pick one before merge):**
- **Recommended: keep `sessionStorage`.** Safer on shared hotel computers (wiped on tab close). Agent 5 should change its routing check to use `sessionStorage` via the existing `getStoredStaffKey()` helper rather than reading `localStorage` directly.
- If `localStorage` is preferred for UX (key persists across tabs), Agent 3 must update its contract and `stateMachineStaff.ts` helpers together in the same PR.

---

## Merge Wave Order

```
Wave 1 — Foundation (must land first, all others depend on it)
  └─ Agent 1

Wave 2 — Auth layer (parallel, no interdependencies)
  ├─ Agent 2  (guest auth)
  ├─ Agent 3  (staff auth)
  └─ Agent 7  (email service + env vars)

Wave 3 — RBAC (depends on Agent 3 StaffMember schema + Agent 1 DB methods)
  └─ Agent 4

Wave 4 — Onboarding hub + entry routing (depends on 2, 3, 4)
  └─ Agent 5

Wave 5 — Task assist copilot (depends on Agent 4 session, Agent 1 thread methods)
  └─ Agent 6

Wave 6 — Smoke tests + regression
```

---

## File-Level Touch List Per Agent

### Agent 1 (DB Foundation)

| File | Change type |
|------|-------------|
| `docs/supabase_onboarding_migration.sql` | New (+ fix for Conflicts 1 & 2) |
| `backend/app/models/schemas.py` | Add `StaffMember`, `EmailVerification`, `StaffRole`, `StaffMemberStatus` |
| `backend/app/services/database.py` | Add new protocol methods (10 new signatures) |
| `backend/app/services/property_db_mock.py` | Implement all new DB methods for mock |
| `backend/app/services/property_db_supabase.py` | Implement all new DB methods for Supabase |

**New DB methods added:**
`create_staff_request`, `get_staff_member_by_id`, `get_staff_member_by_code`,
`get_staff_member_by_access_key_hash`, `list_pending_staff`, `list_staff_members`,
`approve_staff_member`, `reject_staff_member`,
`create_email_verification`, `consume_email_verification`,
`get_task_assist_thread`, `upsert_task_assist_thread`,
`get_guest_by_name_and_booking`, `mark_auth_token_used`

---

### Agent 2 (Guest Auth)

| File | Change type |
|------|-------------|
| `backend/app/api/auth.py` | Add 3 new POST endpoints |
| `backend/app/services/auth_service.py` | Add `register_guest`, `verify_guest_email`, `sign_in_guest_by_name_and_booking` |
| `backend/app/services/database.py` | Extend (calls Agent 1 methods — no new protocol signatures) |
| `frontend/src/app/onboard/guest/page.tsx` | New file |
| `frontend/src/lib/api.ts` | Add `registerGuest`, `verifyGuestEmail`, `signInGuestByBooking` |

**New endpoints added:**
- `POST /api/auth/guest/register`
- `POST /api/auth/guest/verify-email`
- `POST /api/auth/guest/sign-in`

**Existing endpoint modified:**
- `GET /api/auth/verify?t=` — now calls `db.mark_auth_token_used()` after exchange

---

### Agent 3 (Staff Auth)

| File | Change type |
|------|-------------|
| `backend/app/services/staff_auth_service.py` | New file |
| `backend/app/api/onboarding_staff.py` | New file — 5 endpoints |
| `backend/app/main.py` | Register `onboarding_staff` router |
| `backend/app/services/database.py` | Extend (calls Agent 1 methods) |
| `frontend/src/app/onboard/staff/page.tsx` | New file |
| `frontend/src/app/onboard/admin/page.tsx` | New file |
| `frontend/src/lib/api.ts` | Add `requestStaffAccess`, `staffSignIn`, `listPendingStaff`, `approveStaff`, `rejectStaff` |

**New endpoints added:**
- `POST /api/staff/onboarding/request`
- `POST /api/staff/onboarding/sign-in`
- `GET /api/admin/staff/pending`
- `POST /api/admin/staff/{id}/approve`
- `POST /api/admin/staff/{id}/reject`

**Router prefix conflict check:** `onboarding_staff` router prefix must not shadow existing `/api/staff/*` routes. Recommended prefix: `/api` with path `/staff/onboarding/*` and `/admin/staff/*`.

---

### Agent 7 (Email + Config)

| File | Change type |
|------|-------------|
| `backend/app/services/email_service.py` | New file |
| `backend/app/core/config.py` | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL` |
| `backend/.env.example` | Document all new vars |
| `backend/app/main.py` | No router change — email service is imported directly |

**No router registration needed.** Email service is called by auth_service (Agent 2) and staff_auth_service (Agent 3).

---

### Agent 4 (RBAC)

| File | Change type |
|------|-------------|
| `backend/app/services/staff_permissions.py` | New file — role → nav + ActionType maps |
| `frontend/src/lib/staffPermissions.ts` | New file — frontend mirror |
| `backend/app/api/staff.py` | Upgrade `verify_staff_key` to use per-user keys + RBAC |
| `backend/app/api/staff.py` | Add `GET /api/staff/session` endpoint |
| `frontend/src/components/staff/StaffSidebar.tsx` | Filter nav tabs by `allowed_nav` |
| `frontend/src/components/staff/StaffStateRenderer.tsx` | Hydrate role from session on mount |

**Backward-compat requirement:** Legacy `STAFF_ACCESS_KEY` still works — resolves as `manager` for `settings.property_id`. No existing staff workflow breaks.

---

### Agent 5 (Onboarding Hub + Entry Routing)

| File | Change type |
|------|-------------|
| `frontend/src/app/onboard/page.tsx` | New file — three-door hub |
| `frontend/src/lib/onboarding.ts` | New file — `checkGuestSession`, `hasStoredStaffKey`, `ALLOW_DEV_LOGIN` |
| `frontend/src/app/page.tsx` | Update unauthenticated path: redirect to `/onboard` instead of inline sign-in |
| `frontend/src/app/staff/page.tsx` | Update: use `hasStoredStaffKey()` from `onboarding.ts` |
| `frontend/src/app/welcome/page.tsx` | Change: `router.replace('/onboard' + search)` |

**Regression risk:** `page.tsx` change must preserve `NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN=true` path (legacy `SignInScreen` for dev). Test both branches.

---

### Agent 6 (Task Assist)

| File | Change type |
|------|-------------|
| `backend/app/api/task_assist.py` | New file — 2 endpoints |
| `backend/app/main.py` | Register `task_assist` router |
| `frontend/src/components/staff/StaffDetailPanel.tsx` | Add "Get help with this task" button |
| `frontend/src/components/staff/StaffHelpDesk.tsx` | Add `TaskAssistMode` branch; preserve `StaffHelpDeskBrowse` |
| `frontend/src/lib/api.ts` | Add `getTaskAssistThread`, `sendTaskAssistMessage` |

**Router prefix conflict check:** `task_assist` router prefix must not conflict with `onboarding_staff` router added by Agent 3. Recommended: both use prefix `/api` with distinct path segments.

---

## Integration Checkpoints

After each wave, verify before proceeding:

| Wave | Checkpoint command | Expected |
|------|--------------------|----------|
| 1 | `curl http://localhost:8000/api/health` | `{"status":"ok"}` |
| 1 | `DEBUG=true python -c "from app.services.database import get_database; db = get_database(); print(db)"` | No import errors |
| 2 | `curl -X POST .../api/auth/guest/register -d '{"name":"Test","email":"t@t.com","booking_id":"BK1","check_in":"2026-07-01T00:00:00","check_out":"2026-07-05T00:00:00"}'` | `{"verification_sent":true,"verify_url":"..."}` in DEBUG mode |
| 2 | `curl -X POST .../api/staff/onboarding/request -d '{"display_name":"Jordan","requested_role":"front_desk","property_id":"grand-horizon"}'` | `{"staff_code":"STF-XXXX","status":"pending"}` |
| 3 | `curl -H 'X-Staff-Key: mage-staff-dev' http://localhost:8000/api/staff/session` | Returns `allowed_nav` + `allowed_action_types` for manager role |
| 4 | `open http://localhost:3000/onboard` | Three-door hub renders with Guest / Staff / Manager buttons |
| 4 | `open http://localhost:3000/welcome` | Redirects to `/onboard` |
| 5 | Assign a task, open detail panel | "Get help with this task" button visible |
| 5 | Click button | URL becomes `/staff?nav=help-desk&task={actionId}` |
| 6 | Run full regression suite (see `qa_test_matrix.md` R-1 through R-8) | All pass |

---

## Known Integration Risks

### CORS / FRONTEND_URL mismatch
`FRONTEND_URL` is embedded in magic-link and email-verification URLs. If it doesn't match the actual Vercel domain, all link-based auth flows fail silently.

**Check:** After deploy, `curl /api/health` response should include `frontend_url` field. Verify it matches `https://<your-vercel-domain>`.

**Fix:** Set `FRONTEND_URL=https://<exact-domain>` in Vercel backend env. No trailing slash.

### main.py router registration race
Agents 3 and 6 both add new routers to `backend/app/main.py`. If both PRs touch the same line, a merge conflict will occur. Resolve by keeping them as separate `app.include_router(...)` calls in order: `onboarding_staff` first (Wave 2), `task_assist` second (Wave 5).

### React StrictMode double-verify
In development, React 18 Strict Mode runs `useEffect` twice. If a page mounts and immediately calls `GET /api/auth/verify?t=TOKEN`, the token is consumed on the first call; the second call gets 400.

- This is **not a production bug** — StrictMode is dev-only.
- The frontend `verify-email` page should treat a 400 response with `"Invalid or expired"` detail as success if it already showed a success state (use a `useRef` guard or check `verifiedRef.current`).
- Do not "fix" this by making tokens multi-use.

### Vercel cold start
The first request after the backend idles can take 5–15 seconds. This affects the initial magic-link verify redirect. No code fix needed; document in the pilot playbook.

`TRANSCRIPTION_PROVIDER=openai` is required on Vercel — local Whisper cannot run in a serverless function. Ensure `OPENAI_API_KEY` is set.

### Supabase RLS
For v1, all DB access goes through the FastAPI layer using the `service_role` key, which bypasses RLS. RLS policies are **not required** for the pilot to function correctly. However:
- Ensure the Supabase project does **not** have "Enable Row Level Security" with permissive public policies — that would allow the anon key to read data.
- Note this as a Phase 2 hardening item (see `security_checklist.md`).
