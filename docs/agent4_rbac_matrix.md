# Agent 4 — RBAC Matrix

Single source of truth: `backend/app/services/staff_permissions.py`
Frontend mirror: `frontend/src/lib/staffPermissions.ts`

---

## Nav access

| Nav ID | manager | front_desk | maintenance | housekeeping | room_service |
|---|:---:|:---:|:---:|:---:|:---:|
| tasks | ✓ | ✓ | ✓ | ✓ | ✓ |
| assigned | ✓ | ✓ | ✓ | ✓ | ✓ |
| schedule | ✓ | ✓ | ✓ | ✓ | ✓ |
| review | ✓ | ✓ | — | — | — |
| guest-chat | ✓ | ✓ | — | — | — |
| help-desk | ✓ | ✓ | ✓ | ✓ | ✓ |
| knowledge | ✓ | ✓ | — | — | — |

---

## ActionType access (kanban + GET /api/staff/actions)

| ActionType | manager | front_desk | maintenance | housekeeping | room_service |
|---|:---:|:---:|:---:|:---:|:---:|
| MAINTENANCE | ✓ | ✓ | ✓ | — | — |
| ROOM_SERVICE | ✓ | ✓ | — | — | ✓ |
| HOUSEKEEPING | ✓ | ✓ | — | ✓ | — |
| CONTACT_FRONT_DESK | ✓ | ✓ | — | — | — |
| HANDOFF | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Guarded API routes

| Route | Required roles | Notes |
|---|---|---|
| `GET /api/staff/session` | any authenticated | Returns allowed_nav + allowed_action_types |
| `GET /api/staff/actions` | any authenticated | Server-side filtered by ROLE_ACTION_TYPES |
| `GET /api/staff/actions/{id}` | any authenticated | Filtered client-side too |
| `PATCH /api/staff/actions/{id}` | any authenticated | |
| `GET /api/staff/actions/{id}/conversation` | any authenticated | |
| `POST /api/staff/actions/{id}/message` | manager, front_desk | Direct guest reply |
| `GET /api/staff/inbox/threads` | manager, front_desk | |
| `GET /api/staff/guests/{id}/conversation` | manager, front_desk | |
| `POST /api/staff/guests/{id}/message` | manager, front_desk | |
| `GET /api/staff/guests/happiness-scores` | manager, front_desk | Review specialist only |
| `GET /api/staff/guests/review-summary` | manager, front_desk | Review specialist only |
| `GET /api/staff/knowledge/*` (read) | any authenticated | Schema, facts, tree, gaps, crawl status |
| `PATCH /api/staff/knowledge/facts/...` | manager, front_desk | |
| `POST /api/staff/knowledge/publish/...` | manager, front_desk | |
| `POST /api/staff/knowledge/seed/...` | manager, front_desk | |
| `POST /api/staff/knowledge/crawl` | manager, front_desk | |
| `POST /api/staff/knowledge/gaps/.../answer` | manager, front_desk | |

---

## Help desk modes (for Agent 6)

| Role | Browse Help Desk (sidebar) | "Get help with this task" button |
|---|:---:|:---:|
| manager | ✓ | ✓ |
| front_desk | ✓ | ✓ |
| maintenance | — | ✓ |
| housekeeping | — | ✓ |
| room_service | — | ✓ |

Constants: `BROWSE_HELP_ROLES`, `TASK_HELP_ROLES` in both `staff_permissions.py` and `staffPermissions.ts`.

---

## Legacy key bootstrap

If `X-Staff-Key` matches `settings.staff_access_key` (env `STAFF_ACCESS_KEY`, default `mage-staff-dev`), the request is resolved as a synthetic **manager** scoped to `settings.property_id`. This ensures all existing dev workflows keep working with the shared key.
