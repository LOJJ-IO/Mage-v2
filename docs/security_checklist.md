# Mage v2 — Security Checklist

**Owner:** Agent 8 (Security Review)
**Audience:** Developer doing pre-launch security pass. Check each item before going live with a pilot hotel.

Items marked **[BLOCKER]** must be resolved before any real guest data is processed. Items marked **[HARDENING]** are important but can be deferred to Phase 2 if the pilot is internal/low-risk.

---

## 1. Token & Key Storage

### 1.1 Access key hashing
- [ ] **[BLOCKER]** `approve_staff_member()` stores only `SHA-256(raw_key)` in `access_key_hash`. Raw key is never written to DB.
- [ ] **[BLOCKER]** `POST /api/admin/staff/{id}/approve` returns `access_key` (raw) exactly once in the response body. Verify it is not stored or logged anywhere after this call.
- [ ] **[BLOCKER]** `GET /api/admin/staff/pending` and all `StaffMember` response serializers must exclude `access_key_hash`. Confirm the Pydantic response model does not include this field.

**How to verify:**
```bash
# Approve a staff member, then fetch the member record
curl -s http://localhost:8000/api/admin/staff/pending \
  -H "X-Staff-Key: dev-manager-key-grand-horizon" | python3 -m json.tool | grep -i "hash"
# Expected: no output — hash fields must not appear in any response
```

---

### 1.2 Email verification token hashing
- [ ] **[BLOCKER]** `create_email_verification()` stores only `SHA-256(raw_token)` in `token_hash`. Raw token only travels by email.
- [ ] **[BLOCKER]** `consume_email_verification()` computes the hash of the incoming token and looks up by hash — it never compares raw values stored in the DB.
- [ ] **[BLOCKER]** `verified_at` is set atomically when a token is consumed. A second call with the same token returns `None` (not a second verification).

**How to verify:**
```bash
# Register a guest (DEBUG=true returns verify_url)
curl -s -X POST http://localhost:8000/api/auth/guest/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"t@t.com","booking_id":"BK1","check_in":"2026-07-10T00:00:00","check_out":"2026-07-15T00:00:00"}'
# Extract token from verify_url, verify it once (expect success)
# Verify again with same token (expect 400)
```

---

### 1.3 Magic link one-time use
- [ ] **[BLOCKER]** `GET /api/auth/verify?t=<TOKEN>` calls `db.mark_auth_token_used(token_hash)` immediately after successfully setting the session cookie.
- [ ] **[BLOCKER]** `validate_auth_token()` returns `None` when `used_at IS NOT NULL`.
- [ ] A second call with the same magic-link token returns 400, not a new session.

**How to verify (see R-5 in qa_test_matrix.md):** Exchange the same magic-link token twice. Second call must not set a new `mage_session`.

---

### 1.4 Dev seed key confinement
- [ ] **[BLOCKER]** The mock dev seed key `dev-manager-key-grand-horizon` is only present in `MockDatabase`. Verify it does not exist in `SupabaseDatabase` or any Supabase seed script.
- [ ] `DATABASE_TYPE=supabase` in production — this key is unreachable.

---

## 2. API Authorization

### 2.1 Admin endpoint gating
- [ ] **[BLOCKER]** `GET /api/admin/staff/pending`, `POST /api/admin/staff/{id}/approve`, `POST /api/admin/staff/{id}/reject` all call `verify_manager_key()` before any DB access.
- [ ] `verify_manager_key()` raises HTTP 403 (not 401) for non-manager keys — 403 does not leak whether the key exists.
- [ ] Test: send a `front_desk` key to an admin endpoint → expect 403 (see S-8 in qa_test_matrix.md).

### 2.2 Staff sign-in response on bad key
- [ ] **[BLOCKER]** `POST /api/staff/onboarding/sign-in` returns HTTP 401 or 403 for an unrecognized key. It must NOT return HTTP 200 with a null body or empty staff record.
- [ ] The response body for auth failures must not reveal whether the key "almost matched" or whether the staff member exists.

### 2.3 Key not logged
- [ ] **[BLOCKER]** `X-Staff-Key` header value is never written to application logs at INFO, WARNING, or ERROR level.
- [ ] Confirm: FastAPI's default request logging does not log headers. If a custom access log is added, exclude `X-Staff-Key`.
- [ ] `DEBUG=true` may log additional detail — ensure it does not log the raw key value even in debug mode.

### 2.4 Response body audit — no hashes exposed
- [ ] **[BLOCKER]** No API endpoint returns `access_key_hash` or `token_hash` in its response body. These fields must be excluded from all Pydantic response models.

**How to verify:**
```bash
# Exhaustive check across all response-touching endpoints
grep -r "access_key_hash\|token_hash" backend/app/api/ backend/app/services/auth_service.py
# Expect: zero results in response serialization paths
```

---

## 3. Cookie & Session Security

### 3.1 mage_session cookie attributes
- [ ] **[BLOCKER]** In production (`DEBUG=false`): `mage_session` cookie is set with `HttpOnly=True`, `SameSite=Lax`, `Secure=True`.
- [ ] In development (`DEBUG=true`): `Secure=False` is acceptable (localhost has no HTTPS), but `HttpOnly` should still be set.
- [ ] Verify with: `curl -si .../api/auth/verify?t=<TOKEN> | grep -i "set-cookie"`

### 3.2 Staff key storage on shared computers
- [ ] **[HARDENING]** Staff key is stored in `sessionStorage` (wiped on tab close) — NOT `localStorage` (persists across tabs/sessions). On shared hotel computers, `sessionStorage` is the safer default.
- [ ] Resolve Conflict 3 (see `integration_merge_plan.md`) before launch — both Agent 3 and Agent 5 must use the same storage API (`sessionStorage` recommended).
- [ ] Document in staff training: "Always close the browser tab when you're done. Do not leave the workspace open on a shared computer."

### 3.3 Bootstrap key rotation
- [ ] **[BLOCKER for GA]** `STAFF_ACCESS_KEY` (default `mage-staff-dev`) must be changed before launch. Set a strong random value: `openssl rand -hex 24`.
- [ ] After at least one real manager is approved, rotate or disable `STAFF_ACCESS_KEY` in Vercel env. Disabling it means no one can use the bootstrap path — only approved managers can run admin operations.
- [ ] The pilot playbook includes this step (Step 9 in `pilot_hotel_playbook.md`).

---

## 4. CORS & URL Integrity

### 4.1 FRONTEND_URL / magic link domain
- [ ] **[BLOCKER]** `FRONTEND_URL` env var is set to the exact production domain (e.g. `https://mage.yourdomain.com`). No trailing slash.
- [ ] Magic-link emails embed `{FRONTEND_URL}/auth/verify?t=...`. If `FRONTEND_URL` is wrong, all magic links 404 or redirect to the wrong host.
- [ ] Email verification links embed `{FRONTEND_URL}/onboard/guest/verify?t=...`. Same risk.

**How to verify:** After deploy, trigger a guest registration, check the email, and click the link.

### 4.2 CORS allow-list
- [ ] **[BLOCKER]** `DEBUG=false` disables wildcard CORS (`*`). The allow-list in `main.py` must explicitly include the production frontend URL.
- [ ] If frontend and backend are on the same Vercel project (same domain), CORS headers are usually not needed — verify the Next.js rewrite (`/api/*` → `/_/backend/api/*`) handles requests correctly without cross-origin headers.
- [ ] `DEBUG=true` may allow all origins for local dev — acceptable, but verify the flag.

### 4.3 next.config.js rewrite
- [ ] Verify that `/api/*` rewrites to `/_/backend/api/*` and does not conflict with any Next.js route named `/api/`.
- [ ] Verify that the frontend does not have a `src/app/api/` directory that would create a Next.js API route shadowing FastAPI.

---

## 5. Supabase Configuration

### 5.1 Service role key only
- [ ] **[BLOCKER]** Only the `service_role` key is set in `SUPABASE_KEY` on Vercel. Never the `anon` key.
- [ ] The `anon` key must not appear in any backend env var.
- [ ] Frontend never receives or stores the `service_role` key.

### 5.2 Anonymous sign-ins disabled
- [ ] In Supabase dashboard → Authentication → Settings: disable "Enable anonymous sign-ins" if it was on by default.
- [ ] Disable email/password sign-ups in Supabase Auth — Mage manages its own auth, not Supabase Auth.

### 5.3 RLS — Phase 2 note
- [ ] **[HARDENING]** For v1, all table access is through FastAPI using `service_role`, which bypasses Row Level Security (RLS). This is acceptable for the pilot.
- [ ] RLS policies are recommended before multi-tenant GA. At minimum, add policies that prevent one `property_id` from reading another property's rows on `staff_members`, `email_verifications`, `staff_task_assist_threads`, `guests`.
- [ ] Track this in Phase 2 backlog.

### 5.4 Supabase project not publicly accessible
- [ ] Database password is not the default — change it in Supabase project settings.
- [ ] "Public" schema access for the `anon` role should be restricted or fully disabled if not needed.

---

## 6. Rate Limiting

**Current status: advisory (not yet implemented in code). Required before public launch.**

- [ ] **[HARDENING]** `POST /api/auth/guest/register`: max 5 requests/hour per IP. Prevents email enumeration (attacker cannot tell whether an email is registered by timing responses).
- [ ] **[HARDENING]** `POST /api/auth/guest/verify-email`: max 10 requests/hour per IP.
- [ ] **[HARDENING]** `POST /api/staff/onboarding/sign-in`: max 20 requests/hour per IP. 43-character URL-safe keys have sufficient entropy that brute-force is not a practical threat, but rate limiting adds defense-in-depth.
- [ ] **[HARDENING]** `POST /api/admin/staff/*`: max 100 requests/hour per IP.

Implementation options:
- Vercel Edge Middleware (rate-limit at CDN layer — lowest latency)
- FastAPI middleware with Redis (if a Redis instance is available)
- SlowAPI library (simple token-bucket, in-memory — acceptable for single-instance pilot)

---

## 7. Legal & Consent

### 7.1 Guest email consent
- [ ] **[BLOCKER for real guests]** Guest registration form must include a consent statement before the submit button:

  > "By registering, {HOTEL_NAME} may send you account and stay-related emails. See our [Privacy Policy](/privacy)."

  This satisfies CAN-SPAM (US), CASL (Canada), and the transactional email exemption under GDPR for EU guests.

- [ ] A `/privacy` page with a basic privacy policy should exist before accepting real guest emails. A minimal stub is acceptable for the internal pilot; a real policy is required before marketing the product.

### 7.2 Data retention
- [ ] Document (even informally) how long guest data is retained. GDPR requires a stated retention period.
- [ ] `email_verifications` records with `verified_at` set can be purged after 30 days — add a cleanup job (Phase 2).

---

## 8. Known Issues (Not Blockers)

### React StrictMode double-verify
In local development with React 18 Strict Mode enabled, `useEffect` fires twice on mount. A page that calls `GET /api/auth/verify?t=TOKEN` on mount will fire the request twice. The second call returns 400 ("token already used") even if the first succeeded.

**Not a production issue** — React StrictMode is disabled in production builds.

**Frontend fix (recommended):** Use a `useRef` guard on the verify page:
```typescript
const hasVerified = useRef(false);
useEffect(() => {
  if (hasVerified.current) return;
  hasVerified.current = true;
  verifyToken(token);
}, [token]);
```
Do not "fix" this by making tokens multi-use.

---

### Vercel cold start
After the backend serverless function is idle, the first request takes 5–15 seconds. Users clicking a magic link may see a blank page during this window.

**Mitigation (Phase 2):** Add a loading indicator on the `/auth/verify` page; retry the verify request once on timeout; or use Vercel's "fluid compute" to keep the function warm.

**For the pilot:** Document in the playbook. Not a security issue.

---

### Whisper not available on Vercel
Local Whisper transcription requires a long-running process and cannot run in a Vercel serverless function.

**Required env var:** `TRANSCRIPTION_PROVIDER=openai` and `OPENAI_API_KEY=<key>` must be set in Vercel.

If these are missing, the transcription endpoint will fail silently or error — the rest of the app continues to work.

---

## Pre-Launch Sign-Off

Complete this sign-off before the first real hotel goes live:

| Category | Checked by | Date |
|----------|------------|------|
| Token & key storage (1.1–1.4) | | |
| API authorization (2.1–2.4) | | |
| Cookie & session (3.1–3.3) | | |
| CORS & URL integrity (4.1–4.3) | | |
| Supabase config (5.1–5.4) | | |
| Guest email consent (7.1) | | |
| QA matrix all pass (qa_test_matrix.md) | | |
