# Demo period trigger checklist

**Do not run until the team explicitly says "demo period starts."**

Until this trigger fires, `METRICS_TRACKING_ENABLED` should remain `false` and the dashboard showing zeros is expected.

## Trigger steps (execute in order)

1. **Apply Supabase migrations** (if not already applied):
   - `docs/supabase_core_migration.sql`
   - `docs/supabase_metrics_migration.sql`
   - `docs/supabase_dashboard_prebeta_migration.sql`

2. **Set environment variable** on the backend deployment:
   ```env
   METRICS_TRACKING_ENABLED=true
   ```
   Restart / redeploy the API after changing `.env`.

3. **Enable runtime collection** in the dashboard:
   - Open `/dashboard/settings`
   - Turn on "Runtime collection" (PATCH `/api/dashboard/config` with `{ "enabled": true }`)

4. **Verify guest tiers:**
   - Team / dev accounts → `account_tier = dev_internal` (excluded from metrics)
   - Outside testers → `account_tier = pilot_tester` (included; labeled "pilot data" in UI)

5. **Smoke test:**
   - Send a message as a `pilot_tester` guest via `POST /api/chat/message`
   - Confirm a `routing` event appears in `/dashboard/events`
   - Confirm Overview headline KPIs update (resolved without escalation %, request type coverage, completion rate)
   - Confirm dev_internal activity does **not** appear in aggregated KPIs

6. **Curate walk-through transcripts** during the demo window:
   - Flag at least 2 `clean_routine`, 1 `edge_case_graceful`, 1 `graceful_escalation`, 1 `multi_turn_success` in Event Log

## Turning off after demo

- Disable runtime toggle in Settings (immediate stop of new events)
- Set `METRICS_TRACKING_ENABLED=false` when archiving the demo environment
