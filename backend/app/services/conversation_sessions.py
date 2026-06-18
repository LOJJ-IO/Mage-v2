"""Conversation session grouping and completion rate for dashboard metrics."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.services.metrics_aggregations import _is_escalation, _parse_ts

SESSION_GAP_MINUTES = 30


@dataclass
class ConversationSession:
    guest_id: str
    session_id: str
    started_at: datetime
    ended_at: datetime
    event_count: int
    outcome: str  # completed | abandoned | in_progress
    had_escalation: bool


def _routing_sorted(events: List[dict]) -> List[dict]:
    routing = [e for e in events if e.get("event_type") == "routing" and e.get("guest_id")]
    return sorted(routing, key=lambda e: _parse_ts(e.get("created_at")) or datetime.min)


def group_routing_into_sessions(
    events: List[dict],
    *,
    gap_minutes: int = SESSION_GAP_MINUTES,
    now: Optional[datetime] = None,
) -> List[ConversationSession]:
    """Split routing events per guest into sessions separated by inactivity gaps."""
    now = now or datetime.utcnow()
    gap = timedelta(minutes=gap_minutes)
    by_guest: Dict[str, List[dict]] = {}
    for ev in _routing_sorted(events):
        gid = str(ev["guest_id"])
        by_guest.setdefault(gid, []).append(ev)

    sessions: List[ConversationSession] = []
    for guest_id, guest_events in by_guest.items():
        chunk: List[dict] = []
        chunk_start: Optional[datetime] = None
        prev_ts: Optional[datetime] = None

        def flush_chunk() -> None:
            nonlocal chunk, chunk_start
            if not chunk or chunk_start is None:
                chunk = []
                chunk_start = None
                return
            last_ts = _parse_ts(chunk[-1].get("created_at")) or chunk_start
            had_esc = any(_is_escalation(e) for e in chunk)
            failed = any(e.get("success") is False for e in chunk)
            closed = (now - last_ts) >= gap
            if not closed:
                outcome = "in_progress"
            elif had_esc or failed:
                outcome = "abandoned"
            else:
                outcome = "completed"
            session_id = f"{guest_id}:{chunk_start.isoformat()}"
            sessions.append(
                ConversationSession(
                    guest_id=guest_id,
                    session_id=session_id,
                    started_at=chunk_start,
                    ended_at=last_ts,
                    event_count=len(chunk),
                    outcome=outcome,
                    had_escalation=had_esc,
                )
            )
            chunk = []
            chunk_start = None

        for ev in guest_events:
            ts = _parse_ts(ev.get("created_at"))
            if ts is None:
                continue
            if chunk and prev_ts and (ts - prev_ts) > gap:
                flush_chunk()
            if not chunk:
                chunk_start = ts
            chunk.append(ev)
            prev_ts = ts
        flush_chunk()

    return sessions


def compute_conversation_completion_rate(
    events: List[dict],
    *,
    gap_minutes: int = SESSION_GAP_MINUTES,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    sessions = group_routing_into_sessions(events, gap_minutes=gap_minutes, now=now)
    completed = sum(1 for s in sessions if s.outcome == "completed")
    abandoned = sum(1 for s in sessions if s.outcome == "abandoned")
    in_progress = sum(1 for s in sessions if s.outcome == "in_progress")
    denom = completed + abandoned
    rate = round((completed / denom) * 100, 1) if denom else 0.0
    return {
        "conversation_completion_rate_pct": rate,
        "sessions_completed": completed,
        "sessions_abandoned": abandoned,
        "sessions_in_progress": in_progress,
        "sessions_total_closed": denom,
    }


def build_conversation_threads(
    events: List[dict],
    *,
    gap_minutes: int = SESSION_GAP_MINUTES,
) -> List[Dict[str, Any]]:
    """Summaries for Event Log transcript flagging UI."""
    sessions = group_routing_into_sessions(events, gap_minutes=gap_minutes)
    threads: List[Dict[str, Any]] = []
    for s in sorted(sessions, key=lambda x: x.started_at, reverse=True):
        threads.append(
            {
                "guest_id": s.guest_id,
                "session_id": s.session_id,
                "started_at": s.started_at.isoformat(),
                "ended_at": s.ended_at.isoformat(),
                "event_count": s.event_count,
                "outcome": s.outcome,
                "had_escalation": s.had_escalation,
            }
        )
    return threads
