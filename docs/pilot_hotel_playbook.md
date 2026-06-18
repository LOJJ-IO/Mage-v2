# Mage v2 — Pilot Hotel Onboarding Playbook

**Owner:** Agent 8 (Launch PM)
**Audience:** Founder or technical operator onboarding the first hotel. No prior codebase knowledge assumed. Executable in one day.

---

## Pre-Flight Checklist

Before starting, create accounts on these four services if you don't already have them:

| Service | Purpose | Free tier? |
|---------|---------|------------|
| [supabase.com](https://supabase.com) | PostgreSQL database | Yes (one free project) |
| [resend.com](https://resend.com) | Transactional email | Yes (100 emails/day) |
| [vercel.com](https://vercel.com) | Hosting (frontend + backend) | Yes |
| [openrouter.ai](https://openrouter.ai) | LLM API (chat + task assist) | Pay-as-you-go |

Also prepare:
- [ ] A domain or subdomain for the hotel (e.g. `chat.grandhotel.com`) — or use a Vercel subdomain for the pilot
- [ ] The hotel's property ID slug (URL-safe, lowercase, e.g. `grand-horizon`)
- [ ] The hotel's display name (e.g. `Grand Horizon Hotel`)
- [ ] IANA timezone (e.g. `America/New_York`) — find yours at [en.wikipedia.org/wiki/List_of_tz_database_time_zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

---

## Step 1: Run Database Migrations

1. Log in to [app.supabase.com](https://app.supabase.com) and open your project.
2. In the left sidebar: **SQL Editor** → **New query**.
3. Run each file below **in this exact order** — paste the contents and click Run. Do not skip or reorder.

| Order | File |
|-------|------|
| 1 | `docs/supabase_core_migration.sql` |
| 2 | `docs/supabase_properties_auth_knowledge_migration.sql` |
| 3 | `docs/supabase_staff_actions_migration.sql` |
| 4 | `docs/supabase_metrics_migration.sql` |
| 5 | `docs/supabase_onboarding_migration.sql` |

4. After running migration 5, verify the new tables exist: in the left sidebar click **Table Editor** and confirm you see `staff_members`, `email_verifications`, `staff_task_assist_threads`.

5. From **Project Settings → API**, copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **service_role** secret key (under "Project API keys" — not the `anon` key)

---

## Step 2: Configure Resend (Email)

1. Log in to [resend.com](https://resend.com) → **Domains** → **Add Domain**.
2. Add your sending domain (e.g. `mail.grandhotel.com`) and follow the DNS verification steps. This typically takes 5–30 minutes.
3. Once verified: **API Keys** → **Create API Key** → name it `Mage Pilot` → select **Full access** → copy the key (`re_...`).
4. Note your verified from-address, e.g. `noreply@mail.grandhotel.com`.

> **Pilot shortcut:** If DNS is taking too long, use Resend's sandbox domain (`onboarding@resend.dev`) for the pilot. Emails will only deliver to your own address but that's fine for testing.

---

## Step 3: Set Vercel Environment Variables

In your Vercel project: **Settings → Environment Variables** → set these on the **backend** service.

### Required (all must be set)

| Variable | Value |
|----------|-------|
| `DATABASE_TYPE` | `supabase` |
| `SUPABASE_URL` | Your Supabase project URL from Step 1 |
| `SUPABASE_KEY` | The `service_role` key from Step 1 (never the anon key) |
| `AUTH_SECRET` | 32-char random string — run: `openssl rand -hex 16` |
| `RESEND_API_KEY` | `re_...` from Step 2 |
| `RESEND_FROM_EMAIL` | Verified sender e.g. `noreply@mail.grandhotel.com` |
| `FRONTEND_URL` | `https://<your-vercel-domain>` — no trailing slash |
| `OPENROUTER_API_KEY` | From [openrouter.ai/keys](https://openrouter.ai/keys) |
| `DEBUG` | `false` |
| `ALLOW_DEV_GUEST_LOGIN` | `false` |
| `TRANSCRIPTION_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | From [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — needed for voice transcription |
| `STAFF_ACCESS_KEY` | Strong random string — run: `openssl rand -hex 20` — **save this value securely** |
| `DASHBOARD_ACCESS_KEY` | Strong random string — run: `openssl rand -hex 20` |

### Hotel identity

| Variable | Value |
|----------|-------|
| `PROPERTY_ID` | URL-safe slug e.g. `grand-horizon` |
| `HOTEL_NAME` | Display name e.g. `Grand Horizon Hotel` |
| `HOTEL_TIMEZONE` | IANA tz e.g. `America/New_York` |
| `HOTEL_FRONT_DESK_PHONE` | E.164 format e.g. `+15551234567` (optional) |

### Frontend variable (set on the frontend service)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_ALLOW_DEV_GUEST_LOGIN` | (leave unset — defaults to false in production) |

---

## Step 4: Deploy and Verify

1. Push to your main branch (or trigger a Vercel deploy manually).
2. Once deployed, run the health check:

```bash
curl https://<your-vercel-domain>/api/health
```

Expected response:
```json
{"status": "ok", "database": "supabase", "supabase_connected": true}
```

If `supabase_connected` is `false`, double-check `SUPABASE_URL` and `SUPABASE_KEY`.

3. Open `https://<your-vercel-domain>/onboard` in a browser. You should see the three-door hub: **Guest**, **Staff**, **Hotel Manager**.

---

## Step 5: Bootstrap the First Manager

The first manager must be approved using the legacy `STAFF_ACCESS_KEY` bootstrap key (the value you set in Step 3).

**The hotel GM does this:**
1. Navigate to `https://<domain>/onboard/staff`.
2. Choose "Request access".
3. Enter their name, select role **Manager**, enter their email, and submit.
4. Note the **Staff ID** shown (e.g. `STF-A7K2`).

**You (the operator) do this:**
1. Navigate to `https://<domain>/onboard/admin`.
2. When prompted for the manager key, enter the `STAFF_ACCESS_KEY` value from Step 3.
3. The pending staff list will show the GM's request. Click **Approve**.
4. The GM receives an email with their personal access key.

**Hand the GM:**
- Their personal access key (shown in the approval email or on screen)
- The sign-in URL: `https://<domain>/onboard/staff`
- The admin URL: `https://<domain>/onboard/admin`

From this point, the GM uses their personal key for all admin operations. You can optionally rotate or disable `STAFF_ACCESS_KEY` in Vercel once the GM is set up (see Step 9).

---

## Step 6: Publish Hotel Knowledge

The GM does this after signing in to the staff workspace.

1. Go to `https://<domain>/onboard/staff` and sign in with their personal access key.
2. In the staff workspace, navigate to the **Knowledge** tab.
3. Click **Seed** to load a starter knowledge structure for the hotel.
4. Click **Crawl** and enter the hotel's website URL to automatically import amenities, policies, and FAQ content.
5. Review the imported facts. Edit or add any missing information (pool hours, parking policy, check-out time, breakfast, etc.).
6. Click **Publish** when satisfied.

The AI guest assistant will now answer questions using this property-specific knowledge.

---

## Step 7: Onboard Staff

The GM handles this for each staff member.

**Each staff member:**
1. Goes to `https://<domain>/onboard/staff`.
2. Fills in their name, role, and email → submits.
3. Waits for approval email.

**GM (from `/onboard/admin`):**
1. Approves each pending request.
2. Assigns the correct role from the dropdown.
3. The staff member receives their personal access key by email.

**Roles to assign:**

| Role | Who gets it | Access |
|------|-------------|--------|
| `manager` | GM, assistant GM | Full access + admin portal |
| `front_desk` | Front desk agents, concierge | All tasks + guest chat + knowledge |
| `maintenance` | Maintenance technicians | Maintenance tasks + task assist |
| `housekeeping` | Housekeeping staff | Housekeeping tasks + task assist |
| `room_service` | Room service staff | Room service tasks + task assist |

Hand each staff member the staff training card (see bottom of this document).

---

## Step 8: Test the Guest Flow

Before going live with real guests, run through the full registration flow with a test email.

1. On your phone, scan a QR code pointing to `https://<domain>/onboard` — or open it directly.
2. Tap **I'm a guest**.
3. Fill in test registration details (use a real email you control, a fake booking ID, future check-in/out dates).
4. Check your inbox — a verification email should arrive within 1–2 minutes.
5. Click the verification link.
6. Check your inbox again — a magic-link sign-in email should arrive.
7. Click the magic link — you should land in the guest chat.
8. Send a test message ("What time is checkout?") and verify the AI responds using the hotel knowledge published in Step 6.
9. Test returning sign-in: clear cookies, go to `/onboard` → Guest → "Returning guest", enter the same name and booking ID — you should land back in chat with your history intact.

If any step fails, check the Vercel function logs for the backend.

---

## Step 9: Go Live

Once Step 8 passes end-to-end, you're ready for real guests.

1. **Rotate the bootstrap key** (optional but recommended): in Vercel → Environment Variables → update `STAFF_ACCESS_KEY` to a new random value, or delete it entirely. This prevents anyone from using the bootstrap path to approve new managers without your knowledge.

2. **Create the guest QR code**: generate a QR code pointing to `https://<domain>/onboard`. Print it on check-in cards, place it in rooms, add it to the confirmation email, or put it on a tablet at reception.

3. **Notify the GM** that their team can begin using the staff workspace.

4. **Monitor** for the first 48 hours: watch Vercel function logs for errors; check Resend delivery status for emails; have the GM confirm staff sign-ins are working.

---

## Pilot Success Criteria

The pilot is considered successful when:

- [ ] At least one real guest registers, verifies their email, and uses the guest chat
- [ ] Guest can register and reach the AI chat in under 2 minutes
- [ ] All hotel staff are approved and can sign in within 24 hours of requesting access
- [ ] GM can view pending requests and approve them from `/onboard/admin`
- [ ] At least one staff member uses "Get help with this task" on an assigned task
- [ ] No frozen system regressions: guest chat, kanban, PMS webhook, streaming all work
- [ ] No critical errors in Vercel function logs during the first 24 hours

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `/api/health` returns `supabase_connected: false` | Wrong Supabase URL or key | Re-check `SUPABASE_URL` and `SUPABASE_KEY` env vars |
| Verification email not received | Resend domain not verified, or wrong `RESEND_FROM_EMAIL` | Check Resend dashboard for delivery errors |
| Magic link redirects to wrong domain | `FRONTEND_URL` mismatch | Set `FRONTEND_URL=https://<exact-vercel-domain>` — no trailing slash |
| Magic link says "already used" on first click | React StrictMode double-fire (dev only) | Not a production issue; use production build (`DEBUG=false`) |
| Staff workspace blank on load | Staff key not found in sessionStorage | Clear browser storage and sign in again at `/onboard/staff` |
| Task assist returns error | Missing `OPENROUTER_API_KEY` or LLM quota | Check Vercel function logs; top up OpenRouter credits |
| Transcription fails | Missing `OPENAI_API_KEY` | Set `OPENAI_API_KEY` in Vercel env vars |
| First request very slow (5–15s) | Vercel cold start | Normal behaviour; add a loading indicator (Phase 2) |

---

## Staff Training Card

> Print or send this to each team member when their access is approved.

---

**Welcome to Mage — Your Hotel AI Workspace**

**Sign in:** `https://<domain>/onboard/staff`

**To get started:**
1. Go to the sign-in link above.
2. Enter your access key (sent to your email when you were approved).
3. You'll see your task queue filtered for your role.

**For assigned tasks:** Open any task → tap "Get help with this task" → chat with the AI ops assistant for step-by-step guidance.

**Lost your access key?** Contact your manager — they can issue a new one.

**Always close your browser tab** when you're done on a shared computer.

---
