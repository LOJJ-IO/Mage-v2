"""Cross-service follow-up consolidation for staff inbox."""
from datetime import datetime, timedelta
from typing import List, Optional

from app.models.schemas import ActionType, StaffAction, StaffActionStatus
from app.services.database import get_database
from app.services.service_routing import extract_request_keywords


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
    # Recency-only tie: most recent pending if message is short follow-up
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
