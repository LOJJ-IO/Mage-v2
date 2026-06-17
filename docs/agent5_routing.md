# Agent 5 — Route Map

> Authoritative reference for Agent 8 integration tests and deployment checks.
> Last updated by Agent 5 (Application Entry & Routing).

---

## Full Route Table

| Path | Auth Requirement | Redirect When Unauthenticated | Owner | Notes |
|------|-----------------|-------------------------------|-------|-------|
| `/` | Guest session | `/onboard` (prod) · `SignInScreen` (dev) | Agent 5 | Controlled by `NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN` |
| `/onboard` | None | — | Agent 5 | Three-door hub; skips to `/` or `/staff` if already authed |
| `/onboard/guest` | None | — | Agent 2 | New-stay registration + returning sign-in + email verify handler (`?t=`) |
| `/onboard/staff` | None | — | Agent 3 | Staff key sign-in + request-access flow |
| `/onboard/admin` | Manager key (inline) | — | Agent 3 | Manager approval portal; gate is inline on the page |
| `/staff` | Staff key in localStorage | `/onboard/staff` | Agent 5 | `StaffStateRenderer` mounts only when key present |
| `/welcome` | None | — | Agent 5 | Legacy redirect shim → `/onboard` |
| `/dashboard` | (frozen) | — | Frozen | Untouched |
| `/api/*` | (frozen) | — | Frozen | FastAPI rewrites via next.config.js |

---

## Redirect Logic Detail

### `/` (Guest app root) — `frontend/src/app/page.tsx`

```
1. Check sessionStorage['mage-guest-id'] → if set, hydrate store → show StateRenderer
2. Check GET /api/auth/session → if authenticated, hydrate store → show StateRenderer
3. No session found:
   - NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN=true  → show legacy SignInScreen (dev only)
   - otherwise                               → router.replace('/onboard')
```

### `/staff` — `frontend/src/app/staff/page.tsx`

```
1. useEffect: check localStorage for staff key via hasStoredStaffKey()
2. Key present  → render StaffStateRenderer (handles role fetch + workspace)
3. Key absent   → router.replace('/onboard/staff')
4. While checking → render null (no flash)
```

### `/onboard` (Hub) — `frontend/src/app/onboard/page.tsx`

```
1. useEffect: check localStorage for staff key → if found, router.replace('/staff')
2. Async: check guest session via checkGuestSession() → if authed, router.replace('/')
3. Otherwise: render three-door hub
   - "I'm a guest"       → /onboard/guest
   - "I'm a staff member" → /onboard/staff
   - "Hotel manager"     → /onboard/admin
```

### `/welcome` — `frontend/src/app/welcome/page.tsx`

```
router.replace(`/onboard${window.location.search}`)
```

---

## Environment Variables

| Variable | Location | Default | Effect |
|----------|----------|---------|--------|
| `NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN` | Frontend | unset (false) | `true` → show legacy inline email sign-in at `/`; unset/false → redirect to `/onboard` |

Add to `frontend/.env.local` for local development:
```
NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN=true
```

Leave unset in Vercel production environment.

---

## Auth Flow Diagrams

### New Guest

```
/onboard → [Guest] → /onboard/guest → register → email → verify (?t=) → magic link → / → chat
```

### Returning Guest

```
/onboard → [Guest] → /onboard/guest → returning → name + bookingId → / → chat
```

### Magic Link Direct

```
GET /api/auth/magic-link?token=... → sets mage_session cookie → redirect / → chat
```

### New Staff

```
/onboard → [Staff] → /onboard/staff → request access → pending → manager approves
→ access key email → /onboard/staff → sign in with key → /staff → workspace
```

### Returning Staff

```
/staff → key in localStorage → StaffStateRenderer → workspace
/staff → no key → /onboard/staff → sign in → /staff
```

### Manager Admin

```
/onboard → [Hotel manager] → /onboard/admin → manager key gate → approval table
```

---

## Frozen Routes (Do Not Touch)

- `/dashboard` — admin dashboard, frozen
- `/api/auth/magic-link` — backend magic link handler (Agent 2)
- `/api/staff/*` — all staff API routes (Agents 3, 4, 6)
- All guest chat state machine internals (`StateRenderer`, `HydrationGate` children)
- All staff workspace internals (`StaffWorkspace`, `StaffSidebar`, `StaffDetailPanel`)

---

## Key Helpers

**`frontend/src/lib/onboarding.ts`**

| Export | Type | Description |
|--------|------|-------------|
| `ALLOW_DEV_LOGIN` | `boolean` | Compile-time flag from `NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN` |
| `checkGuestSession()` | `async () => boolean` | Checks sessionStorage then `/api/auth/session` |
| `hasStoredStaffKey()` | `() => boolean` | Synchronous localStorage check via `getStoredStaffKey()` |
