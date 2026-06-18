# Mage — Vercel + Supabase Deployment Guide

Cold-start checklist for onboarding a pilot hotel.

---

## 1. Supabase — run migrations in order

Open your Supabase project → SQL Editor and run each file in this exact order:

1. `docs/supabase_core_migration.sql`
2. `docs/supabase_properties_auth_knowledge_migration.sql`
3. `docs/supabase_staff_actions_migration.sql`
4. `docs/supabase_onboarding_migration.sql` ← staff_members, email_verifications, staff_task_assist_threads
5. `docs/supabase_metrics_migration.sql`
6. `docs/supabase_dashboard_prebeta_migration.sql` (guest tiers + transcript flags — before demo period)

Copy the **Project URL** and **service_role** key from Supabase → Project Settings → API — you'll need them below.

---

## 2. Resend — set up email sender

1. Create an account at [resend.com](https://resend.com).
2. Add and verify your sending domain (e.g. `mail.yourdomain.com`).
3. Create an API key with **Full access** (or **Sending access**).
4. Note the key (`re_...`) and your verified from-address for the env vars below.

---

## 3. Vercel — environment variables

Set these on the **backend** service in Vercel → Project → Settings → Environment Variables.

### Required

| Variable | Value |
|----------|-------|
| `DATABASE_TYPE` | `supabase` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | `service_role` key (never the anon key) |
| `AUTH_SECRET` | 32-char random string — `openssl rand -hex 16` |
| `RESEND_API_KEY` | `re_...` from Resend dashboard |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `noreply@mail.yourdomain.com` |
| `FRONTEND_URL` | `https://<your-vercel-domain>` (used in magic-link URLs) |
| `OPENROUTER_API_KEY` | From [openrouter.ai](https://openrouter.ai) |
| `DEBUG` | `false` |
| `ALLOW_DEV_GUEST_LOGIN` | `false` |
| `TRANSCRIPTION_PROVIDER` | `openai` (Vercel has no local Whisper) |
| `OPENAI_API_KEY` | Required when `TRANSCRIPTION_PROVIDER=openai` |
| `STAFF_ACCESS_KEY` | Replace the default `mage-staff-dev` |
| `DASHBOARD_ACCESS_KEY` | Replace the default `lojj-dash-dev` |

### Pilot hotel identity

| Variable | Value |
|----------|-------|
| `PROPERTY_ID` | URL-safe slug, e.g. `comfort-inn-pilot` |
| `HOTEL_NAME` | Display name, e.g. `Comfort Inn Downtown` |
| `HOTEL_TIMEZONE` | IANA tz, e.g. `America/Toronto` |
| `HOTEL_FRONT_DESK_PHONE` | E.164, e.g. `+15551234567` (optional) |

### Optional tuning

| Variable | Default | Notes |
|----------|---------|-------|
| `LLM_MODEL_CLASSIFIER` | `google/gemini-2.5-flash-lite` | Classifier tier |
| `LLM_CLASSIFIER_PROMPT_CACHE` | `true` | Requires pinned classifier model |
| `AUTH_TOKEN_TTL_HOURS` | `48` | Magic-link expiry |
| `SESSION_TTL_HOURS` | `168` | Guest session expiry (7 days) |
| `STAY_GRACE_HOURS` | `12` | Hours past checkout guests can still access |
| `METRICS_TRACKING_ENABLED` | `false` | Enable analytics dashboard |

### Frontend service (usually auto-resolved)

The Next.js frontend reads `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` to proxy `/api/*` calls — no extra config needed on Vercel. Set `BACKEND_URL` only if the frontend is deployed to a separate domain from the backend.

---

## 4. vercel.json (do not modify)

```json
{
  "experimentalServices": {
    "frontend": { "entrypoint": "frontend", "routePrefix": "/" },
    "backend":  { "entrypoint": "backend",  "routePrefix": "/_/backend" }
  }
}
```

The Next.js rewrite in `next.config.js` maps `/api/*` → `/_/backend/api/*` automatically.

---

## 5. Verify the deploy

```bash
# Health check — confirms Supabase connection
curl https://<your-vercel-domain>/api/health

# Smoke-test email (runs in debug mode locally)
DEBUG=true RESEND_API_KEY="" python -c "
import asyncio
from app.services.email_service import send_email
asyncio.run(send_email('test@example.com', 'Test', 'Hello'))
"
```

Expected health response: `{"status": "ok", ...}`

---

## 6. Pilot hotel onboarding flow

1. Run all 5 SQL migrations in Supabase (step 1).
2. Deploy to Vercel with env vars set (steps 2–3).
3. Hit `/api/health` — confirm `"status": "ok"`.
4. Open `/onboard` in a browser — confirm the three-door hub loads.
5. Register a test guest → verify confirmation email arrives via Resend.
6. Approve a test staff member → confirm sign-in with access key works.
7. Hand hotel manager the admin credentials and staff approval URL.
