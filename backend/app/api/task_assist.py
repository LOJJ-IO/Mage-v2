from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import get_settings
from app.models.schemas import ActionType
from app.services.database import get_database
from app.services.message_codec import parse_stored_message
from app.services.staff_permissions import StaffContext, get_current_staff

router = APIRouter(prefix="/staff", tags=["staff-task-assist"])

ACTION_TYPE_KEYWORDS: dict[str, list[str]] = {
    ActionType.MAINTENANCE: ["maintenance", "plumbing", "electrical", "engineer", "repair", "hvac"],
    ActionType.HOUSEKEEPING: ["housekeeping", "cleaning", "linen", "laundry", "towel", "maid"],
    ActionType.ROOM_SERVICE: ["room_service", "dining", "food", "menu", "restaurant", "beverage"],
    ActionType.CONTACT_FRONT_DESK: ["front_desk", "policy", "check", "room", "reception"],
    ActionType.HANDOFF: ["front_desk", "policy", "escalat", "manager"],
}


class TaskAssistMessage(BaseModel):
    role: str
    content: str
    created_at: str


class TaskAssistRequest(BaseModel):
    action_id: str
    message: str
    staff_member_id: Optional[str] = None


class TaskAssistResponse(BaseModel):
    reply: str
    messages: List[TaskAssistMessage]


class TaskAssistThread(BaseModel):
    action_id: str
    messages: List[TaskAssistMessage]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _format_conversation_excerpt(raw_rows: list[dict], limit: int = 5) -> str:
    recent = raw_rows[-limit:] if len(raw_rows) > limit else raw_rows
    lines = []
    for row in recent:
        role = row.get("role", "user")
        content = row.get("content", "")
        if not content.strip():
            continue
        try:
            parsed = parse_stored_message(role, content, "x", datetime.utcnow())
            content = parsed.get("content", content)
        except Exception:
            pass
        label = {"user": "Guest", "assistant": "AI", "staff": "Staff"}.get(role, role.title())
        lines.append(f"{label}: {content[:300]}")
    return "\n".join(lines) if lines else "(no conversation yet)"


def _filter_knowledge_facts(facts: list[dict], action_type: ActionType) -> str:
    keywords = ACTION_TYPE_KEYWORDS.get(action_type, [])
    relevant = []
    for fact in facts:
        key = (fact.get("slot_key") or "").lower()
        val = fact.get("value")
        if not val or fact.get("status") == "unknown":
            continue
        if any(kw in key for kw in keywords):
            relevant.append(f"- {key}: {str(val)[:200]}")
    if not relevant:
        return "(no specific SOPs found for this action type)"
    return "\n".join(relevant[:15])


def _build_system_prompt(action, conversation_excerpt: str, knowledge_text: str, hotel_name: str) -> str:
    return f"""You are an internal operations assistant for hotel staff at {hotel_name}.
Your role is to give clear, concise, step-by-step guidance for handling guest service tasks.
You have access to property SOPs and relevant knowledge excerpts below.
Speak directly to the staff member. Be brief and actionable.
Do not write guest-facing text unless the staff member explicitly asks for it.

--- TASK CONTEXT ---
Type: {action.action_type.value}
Guest: {action.guest_name or "Unknown"}, Room {action.room_number or "N/A"}
Status: {action.status.value}
Guest request: "{action.source_message}"

--- RECENT GUEST CONVERSATION (last 5 messages) ---
{conversation_excerpt}

--- RELEVANT PROPERTY KNOWLEDGE ---
{knowledge_text}"""


async def _call_task_assist_llm(
    system_prompt: str,
    messages: list[dict],
) -> str:
    settings = get_settings()
    api_key = settings.openrouter_api_key
    if not api_key:
        return (
            "AI assist is not configured (OPENROUTER_API_KEY not set). "
            "Add your key to enable step-by-step guidance."
        )

    model = settings.llm_model_small or "openrouter/auto"
    payload = {
        "model": model,
        "max_tokens": settings.llm_max_tokens_small,
        "temperature": 0.5,
        "messages": [{"role": "system", "content": system_prompt}]
        + [{"role": m["role"], "content": m["content"]} for m in messages],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mage-hotel.app",
        "X-Title": "Mage Staff Assist",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.openrouter_base_url}/chat/completions",
            json=payload,
            headers=headers,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"LLM error: {resp.status_code}")
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise HTTPException(status_code=502, detail="Unexpected LLM response shape") from exc


@router.get("/task-assist/{action_id}", response_model=TaskAssistThread)
async def get_task_assist_thread(
    action_id: str,
    ctx: StaffContext = Depends(get_current_staff),
):
    db = get_database()
    action = db.get_staff_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    row = db.get_task_assist_thread(action_id, ctx.id)
    messages: list[TaskAssistMessage] = []
    if row and row.get("messages_json"):
        for m in row["messages_json"]:
            messages.append(
                TaskAssistMessage(
                    role=m.get("role", "user"),
                    content=m.get("content", ""),
                    created_at=m.get("created_at", _now_iso()),
                )
            )
    return TaskAssistThread(action_id=action_id, messages=messages)


@router.post("/task-assist", response_model=TaskAssistResponse)
async def post_task_assist_message(
    request: TaskAssistRequest,
    ctx: StaffContext = Depends(get_current_staff),
):
    settings = get_settings()
    db = get_database()

    action = db.get_staff_action(request.action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    row = db.get_task_assist_thread(request.action_id, ctx.id)
    messages_json: list[dict] = list(row["messages_json"]) if row and row.get("messages_json") else []

    messages_json.append({
        "role": "user",
        "content": request.message,
        "created_at": _now_iso(),
    })

    thread_id = action.guest_conversation_thread_id or action.guest_id
    raw_conv = db.get_conversation(thread_id)
    conversation_excerpt = _format_conversation_excerpt(raw_conv)

    property_id = ctx.property_id or settings.property_id
    raw_facts = db.list_property_facts(property_id)
    knowledge_text = _filter_knowledge_facts(raw_facts, action.action_type)

    system_prompt = _build_system_prompt(action, conversation_excerpt, knowledge_text, settings.hotel_name)

    llm_messages = [{"role": m["role"], "content": m["content"]} for m in messages_json]
    reply = await _call_task_assist_llm(system_prompt, llm_messages)

    messages_json.append({
        "role": "assistant",
        "content": reply,
        "created_at": _now_iso(),
    })

    db.upsert_task_assist_thread(request.action_id, ctx.id, property_id, messages_json)

    return TaskAssistResponse(
        reply=reply,
        messages=[
            TaskAssistMessage(
                role=m["role"],
                content=m["content"],
                created_at=m["created_at"],
            )
            for m in messages_json
        ],
    )
