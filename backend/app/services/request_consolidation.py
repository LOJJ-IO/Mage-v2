"""Cross-service follow-up consolidation and task escalation for staff inbox."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from app.models.schemas import ActionType, StaffAction, StaffActionEscalationType, StaffActionStatus
from app.services.database import get_database
from app.services.conversation_helpers import resolve_substantive_user_message
from app.services.service_routing import (
    build_staff_summary,
    extract_request_keywords,
    normalize_action_type_for_staff,
)

logger = logging.getLogger(__name__)

CONSOLIDATION_WINDOW_MINUTES = 60


def list_pending_actions_for_guest(guest_id: str) -> List[StaffAction]:
    db = get_database()
    cutoff = datetime.utcnow() - timedelta(minutes=CONSOLIDATION_WINDOW_MINUTES)
    actions = db.list_staff_actions(limit=100, status=StaffActionStatus.PENDING)
    return [
        a
        for a in actions
        if a.guest_id == guest_id and a.created_at >= cutoff
    ]


def _overlap_score(message_keywords: set, action: StaffAction) -> float:
    action_text = f"{action.summary} {action.source_message}".lower()
    action_keywords = extract_request_keywords(action_text)
    if not message_keywords or not action_keywords:
        return 0.0
    overlap = message_keywords & action_keywords
    if not overlap:
        return 0.0
    return len(overlap) / max(len(message_keywords), 1)


def find_best_pending_action(
    guest_id: str,
    user_message: str,
) -> Optional[StaffAction]:
    pending = list_pending_actions_for_guest(guest_id)
    if not pending:
        return None
    msg_kw = extract_request_keywords(user_message)
    pending.sort(key=lambda a: a.created_at, reverse=True)
    best: Optional[StaffAction] = None
    best_score = 0.15
    for action in pending:
        score = _overlap_score(msg_kw, action)
        if score > best_score:
            best_score = score
            best = action
    if best is None and len(user_message.strip()) < 80:
        return pending[0]
    return best


def append_to_best_pending(
    guest_id: str,
    user_message: str,
) -> Optional[StaffAction]:
    """Append follow-up note to best matching pending action (any service type)."""
    note = (user_message or "").strip()[:200]
    if not note:
        return None
    best = find_best_pending_action(guest_id, user_message)
    if not best:
        return None
    db = get_database()
    new_summary = f"{best.summary.rstrip('.')}; {note}"[:500]
    return db.update_staff_action_summary(best.id, new_summary)


def _log_task(
    guest_id: str,
    service: str,
    title: str,
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]],
    escalation_type: StaffActionEscalationType,
) -> Optional[StaffAction]:
    resolved = normalize_action_type_for_staff(service)
    if resolved.value not in {
        ActionType.MAINTENANCE.value,
        ActionType.ROOM_SERVICE.value,
        ActionType.HOUSEKEEPING.value,
        ActionType.CONTACT_FRONT_DESK.value,
    }:
        return None
    substantive = resolve_substantive_user_message(user_message, conversation_history)
    summary_text = (title or "").strip()
    if not summary_text:
        summary_text = build_staff_summary(
            resolved, substantive, conversation_history
        )
    db = get_database()
    return db.log_staff_action(
        guest_id=guest_id,
        action_type=resolved,
        summary=summary_text[:500],
        source_message=substantive,
        escalation_type=escalation_type,
        guest_conversation_thread_id=guest_id,
    )


def escalate_or_create_task(
    guest_id: str,
    service: str,
    title: str,
    request_type: str,
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Tuple[Optional[StaffAction], str]:
    """
    On follow_up_escalation: escalate matching pending task of same service.
    Returns (staff_action, guest_message). action None when clarification needed.
    """
    if request_type != "follow_up_escalation":
        action = _log_task(
            guest_id,
            service,
            title,
            user_message,
            conversation_history,
            StaffActionEscalationType.NORMAL,
        )
        msg = title or "I've logged that for you."
        return (action, msg)

    resolved = normalize_action_type_for_staff(service)
    db = get_database()
    active = db.list_pending_actions_for_guest_service(
        guest_id, resolved, max_age_minutes=CONSOLIDATION_WINDOW_MINUTES
    )

    if len(active) > 1:
        labels = ", ".join(sorted({a.action_type.value.replace("_", " ").lower() for a in active}))
        logger.info(
            "Multiple active %s tasks for guest %s; asking clarification",
            service,
            guest_id,
        )
        guest_msg = (
            f"I see you have multiple open requests ({labels}). "
            "Which one needs follow-up? Tell me a bit more detail."
        )
        return (None, guest_msg)

    if len(active) == 1:
        task = active[0]
        note = (title or user_message or "").strip()[:200]
        new_summary = f"{task.summary.rstrip('.')} → {note}"[:500] if note else task.summary
        updated = db.update_staff_action_escalation(
            task.id,
            StaffActionEscalationType.ESCALATED,
            summary=new_summary,
        )
        logger.info("Escalated task %s for guest %s", task.id, guest_id)
        guest_msg = "I've flagged your request with the team — they'll prioritize it."
        return (updated or task, guest_msg)

    action = _log_task(
        guest_id,
        service,
        title,
        user_message,
        conversation_history,
        StaffActionEscalationType.NORMAL,
    )
    guest_msg = title or "I've logged that for you."
    return (action, guest_msg)
