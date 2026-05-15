# Staff state machine

Staff flows use a separate state machine from guest (`S-G-*`) states.

## States

| ID | Name | Screen |
|----|------|--------|
| `S-S-001` | Staff.Auth.PinEntry | Staff access key |
| `S-S-002` | Staff.Inbox.List | To-do list of flagged actions |
| `S-S-003` | Staff.Action.Detail | Full action detail |

## Transitions

| From | Trigger | To |
|------|---------|-----|
| `ENTRY` | `SUBMIT_PIN` (valid key) | `S-S-002` |
| `S-S-001` | `SUBMIT_PIN` (valid key) | `S-S-002` |
| `S-S-002` | `SELECT_ACTION` | `S-S-003` |
| `S-S-002` | `LOGOUT` | `S-S-001` |
| `S-S-003` | `BACK` | `S-S-002` |
| `S-S-003` | `ACK` | `S-S-002` |
| `S-S-003` | `RESOLVE` | `S-S-002` |

## App entry (guest vs staff)

| Screen | Route | Storage |
|--------|-------|---------|
| Role chooser | `/welcome` | `sessionStorage.mage-guest-id` for guest |
| Guest app | `/` | Zustand `guestProfile` |
| Staff app | `/staff` | `sessionStorage.mage-staff-key` |

## Two-tab test

1. Start backend (`uvicorn`) and frontend (`npm run dev`).
2. Tab A: open `/staff`, enter staff key (`mage-staff-dev` by default).
3. Tab B: open `/welcome`, pick a guest, chat about a shower/maintenance issue.
4. Within ~2.5s Tab A inbox should show a new `MAINTENANCE` row; tap for detail.

## API

- `GET /api/staff/actions` — header `X-Staff-Key`
- `GET /api/staff/actions/{id}`
- `PATCH /api/staff/actions/{id}` — body `{ "status": "acknowledged" | "resolved" }`
