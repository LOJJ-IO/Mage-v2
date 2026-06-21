"""Metrics collection for the analytics dashboard."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

from app.core.config import get_settings
from app.services.database import get_database

logger = logging.getLogger(__name__)


@dataclass
class RoutingTelemetry:
    """Telemetry captured during a single guest message routing."""

    guest_id: Optional[str] = None
    property_id: Optional[str] = None
    abilities: List[str] = field(default_factory=list)
    ability_executed: Optional[str] = None
    confidence: Optional[float] = None
    request_type: Optional[str] = None
    escalation_type: Optional[str] = None
    salvaged: bool = False
    classifier_model: Optional[str] = None
    copy_model: Optional[str] = None
    prompt_cache_hit: bool = False
    fallback_used: bool = False
    classifier_latency_ms: Optional[int] = None
    copy_latency_ms: Optional[int] = None
    total_latency_ms: Optional[int] = None
    success: bool = True
    error_code: Optional[str] = None
    staff_action_logged: bool = False
    happiness_score: Optional[int] = None
    routing_path: Optional[str] = None
    turn_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_event_payload(self) -> Dict[str, Any]:
        data = asdict(self)
        metadata = dict(data.pop("metadata", {}) or {})
        routing_path = data.pop("routing_path", None)
        turn_count = data.pop("turn_count", None)
        if routing_path:
            metadata["routing_path"] = routing_path
        if turn_count is not None:
            metadata["turn_count"] = turn_count
        data["event_type"] = "routing"
        data["metadata"] = metadata
        return data


def _active() -> bool:
    settings = get_settings()
    if not settings.metrics_tracking_enabled:
        return False
    try:
        return get_database().is_metrics_db_enabled()
    except Exception as exc:
        logger.warning("Metrics gate check failed: %s", exc)
        return False


def record_routing_event(telemetry: RoutingTelemetry) -> None:
    """Persist a routing event if tracking is active."""
    if not _active():
        return
    try:
        get_database().record_metrics_event(telemetry.to_event_payload())
    except Exception as exc:
        logger.warning("Failed to record routing metrics: %s", exc)


def record_faq_feedback_event(
    *,
    guest_id: str,
    property_id: Optional[str],
    helpful: bool,
    trigger_content: str,
    faq_titles: Optional[List[str]] = None,
) -> None:
    if not _active():
        return
    try:
        get_database().record_metrics_event(
            {
                "event_type": "faq_feedback",
                "guest_id": guest_id,
                "property_id": property_id,
                "success": helpful,
                "metadata": {
                    "helpful": helpful,
                    "trigger_content": (trigger_content or "")[:500],
                    "faq_titles": faq_titles or [],
                },
            }
        )
    except Exception as exc:
        logger.warning("Failed to record FAQ feedback metrics: %s", exc)


def record_sentiment_snapshot(
    *,
    guest_id: str,
    property_id: Optional[str],
    happiness_score: int,
) -> None:
    if not _active():
        return
    try:
        get_database().record_metrics_event(
            {
                "event_type": "sentiment",
                "guest_id": guest_id,
                "property_id": property_id,
                "happiness_score": happiness_score,
                "metadata": {},
            }
        )
    except Exception as exc:
        logger.warning("Failed to record sentiment metrics: %s", exc)


def record_staff_team_reassignment_event(
    *,
    guest_id: str,
    property_id: Optional[str],
    action_id: str,
    from_team: str,
    to_team: str,
    staff_role: str,
    staff_id: str,
) -> None:
    """Persist when front desk or manager manually picks a team for a task."""
    if not _active():
        return
    try:
        get_database().record_metrics_event(
            {
                "event_type": "staff_team_reassignment",
                "guest_id": guest_id,
                "property_id": property_id,
                "success": True,
                "metadata": {
                    "action_id": action_id,
                    "from_team": from_team,
                    "to_team": to_team,
                    "staff_role": staff_role,
                    "staff_id": staff_id,
                },
            }
        )
    except Exception as exc:
        logger.warning("Failed to record staff team reassignment metrics: %s", exc)


def get_tracking_config() -> Dict[str, Any]:
    settings = get_settings()
    db_enabled = False
    try:
        db_enabled = get_database().is_metrics_db_enabled()
    except Exception:
        pass
    return {
        "env_enabled": settings.metrics_tracking_enabled,
        "db_enabled": db_enabled,
        "active": settings.metrics_tracking_enabled and db_enabled,
    }
