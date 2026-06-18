# Agent 6 — Help Desk Task Assist Contract

## Purpose
Task-scoped AI ops copilot. Staff open an assigned task → click "Get help with this task" → Help desk opens in chat-heavy task mode with prefilled context → AI returns step-by-step SOP guidance using property knowledge.

---

## API Endpoints

### GET `/api/staff/task-assist/{action_id}`
Load existing thread for a task (scoped to the authenticated staff member).

**Auth:** `X-Staff-Key` header → `get_current_staff`  
**Response:**
```json
{
  "action_id": "abc-123",
  "messages": [
    { "role": "user", "content": "...", "created_at": "2026-06-16T10:00:00+00:00" },
    { "role": "assistant", "content": "...", "created_at": "2026-06-16T10:00:01+00:00" }
  ]
}
```

### POST `/api/staff/task-assist`
Send a message and receive an AI reply. Thread is persisted to `staff_task_assist_threads`.

**Auth:** `X-Staff-Key` header → `get_current_staff`  
**Request body:**
```json
{
  "action_id": "abc-123",
  "message": "...",
  "staff_member_id": "optional-uuid"
}
```
**Response:**
```json
{
  "reply": "Here are the steps...",
  "messages": [ /* full thread after reply */ ]
}
```
**Errors:** `404` if `action_id` not found; `502` if OpenRouter call fails.

---

## Message Shape

Each message in `messages_json` (stored by Agent 1):
```json
{ "role": "user|assistant", "content": "string", "created_at": "ISO-8601 UTC" }
```

Thread is keyed `{action_id}:{staff_member_id}` in `staff_task_assist_threads`.

---

## System Prompt Template

```
You are an internal operations assistant for hotel staff at {hotel_name}.
Your role is to give clear, concise, step-by-step guidance for handling guest service tasks.
You have access to property SOPs and relevant knowledge excerpts below.
Speak directly to the staff member. Be brief and actionable.
Do not write guest-facing text unless the staff member explicitly asks for it.

--- TASK CONTEXT ---
Type: {action_type}
Guest: {guest_name}, Room {room_number}
Status: {status}
Guest request: "{source_message}"

--- RECENT GUEST CONVERSATION (last 5 messages) ---
{conversation_excerpt}

--- RELEVANT PROPERTY KNOWLEDGE ---
{knowledge_facts}
```

**Knowledge filtering by action type:**
| ActionType | Slot key keywords |
|---|---|
| MAINTENANCE | maintenance, plumbing, electrical, engineer, repair, hvac |
| HOUSEKEEPING | housekeeping, cleaning, linen, laundry, towel, maid |
| ROOM_SERVICE | room_service, dining, food, menu, restaurant, beverage |
| CONTACT_FRONT_DESK | front_desk, policy, check, room, reception |
| HANDOFF | front_desk, policy, escalat, manager |

---

## LLM Config
- Model: `settings.llm_model_small` (default `openrouter/auto`)
- Max tokens: `settings.llm_max_tokens_small` (default 384)
- Temperature: 0.5
- No streaming — single POST to `/chat/completions`, returns full reply

---

## Frontend URL Convention

Task mode is entered via URL param: `/staff?nav=help-desk&task={actionId}`

- `StaffStateRenderer.handleGetHelp` pushes this URL and closes the detail panel
- `StaffWorkspace` reads `task` param and passes it to `StaffHelpDesk`
- `StaffHelpDesk` branches: if `taskActionId` → `TaskAssistMode`; else → `StaffHelpDeskBrowse` (unchanged)
- "← Back" in task mode removes `task` param and switches to `tasks` nav

---

## Prefill Template

When no existing thread, the composer is pre-filled with:
```
[MAINTENANCE] Alice Johnson · Room 305 · pending
"The shower drain is clogged and there is standing water"

Notes: 
```
Staff can edit the Notes line and anything else before hitting Send.

---

## Preserved (untouched)
- `StaffHelpDeskBrowse` — category grid, knowledge browse, sidebar nav, trending slots
- `helpDeskNav.ts`, `helpDesk.css`
- All knowledge crawl / `staff_knowledge.py` APIs
- `StaffKnowledgeOnboarding`
