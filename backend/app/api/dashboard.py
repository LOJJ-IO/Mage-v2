"""Analytics dashboard API (key-gated)."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.models.schemas import TranscriptFlagCategory
from app.services.conversation_sessions import (
    build_conversation_threads,
    compute_conversation_completion_rate,
)
from app.services.database import get_database
from app.services.metric_definitions import metric_labels_for_dev, metric_labels_for_overview
from app.services.metrics_aggregations import (
    aggregate_dev,
    aggregate_marketing,
    build_chart_splits,
    build_phrase_cloud,
    build_timeseries,
    filter_events_by_range,
    recent_wins,
)
from app.services.metrics_service import get_tracking_config

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
settings = get_settings()


class MetricsConfigPatch(BaseModel):
    enabled: bool


class TranscriptFlagBody(BaseModel):
    guest_id: str
    session_id: str
    category: TranscriptFlagCategory
    note: Optional[str] = Field(None, max_length=2000)


def verify_dashboard_key(
    x_dashboard_key: Optional[str] = Header(None, alias="X-Dashboard-Key"),
):
    if not x_dashboard_key or x_dashboard_key != settings.dashboard_access_key:
        raise HTTPException(status_code=401, detail="Invalid dashboard key")
    return x_dashboard_key


def _parse_range(days: int) -> tuple[datetime, datetime]:
    end = datetime.utcnow()
    start = end - timedelta(days=max(1, days))
    return start, end


def _dev_internal_guest_ids() -> set[str]:
    try:
        return set(get_database().list_dev_internal_guest_ids())
    except Exception:
        return set()


def _load_events(
    *,
    days: int,
    property_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 5000,
) -> List[dict]:
    start, end = _parse_range(days)
    db = get_database()
    rows = db.list_metrics_events(
        limit=limit,
        event_type=event_type,
        since=start,
        until=end,
        property_id=None,
    )
    pid = property_id or (settings.property_id or None)
    excluded = _dev_internal_guest_ids()
    return filter_events_by_range(
        rows, start=start, end=end, property_id=pid, exclude_guest_ids=excluded
    )


@router.get("/config")
async def get_config(_: str = Depends(verify_dashboard_key)):
    return get_tracking_config()


@router.patch("/config")
async def patch_config(
    body: MetricsConfigPatch,
    _: str = Depends(verify_dashboard_key),
):
    if not settings.metrics_tracking_enabled:
        raise HTTPException(
            status_code=400,
            detail="METRICS_TRACKING_ENABLED is false in environment (master switch).",
        )
    db = get_database()
    enabled = db.set_metrics_db_enabled(body.enabled)
    return {**get_tracking_config(), "db_enabled": enabled}


@router.get("/summary")
async def marketing_summary(
    _: str = Depends(verify_dashboard_key),
    days: int = Query(30, ge=1, le=365),
):
    events = _load_events(days=days)
    summary = aggregate_marketing(
        events,
        labor_cost_per_call=settings.metrics_labor_cost_per_call,
        avg_call_minutes=settings.metrics_avg_call_minutes,
        happiness_threshold=settings.metrics_happiness_threshold,
    )
    completion = compute_conversation_completion_rate(events)
    summary.update(completion)
    return {
        "period_days": days,
        "tracking": get_tracking_config(),
        "data_scope": "pilot_tester",
        "pilot_data_label": "Pilot data — not live hotel operations",
        "metric_labels": metric_labels_for_overview(),
        "summary": summary,
        "recent_wins": recent_wins(events, limit=12),
        "chart_splits": build_chart_splits(events),
        "phrase_cloud": build_phrase_cloud(events),
    }


@router.get("/dev")
async def dev_metrics(
    _: str = Depends(verify_dashboard_key),
    days: int = Query(30, ge=1, le=365),
):
    events = _load_events(days=days)
    return {
        "period_days": days,
        "tracking": get_tracking_config(),
        "data_scope": "pilot_tester",
        "metric_labels": metric_labels_for_dev(),
        "metrics": aggregate_dev(events),
        "phrase_cloud": build_phrase_cloud(events),
    }


@router.get("/timeseries")
async def timeseries(
    _: str = Depends(verify_dashboard_key),
    metric: str = Query("messages"),
    days: int = Query(30, ge=1, le=90),
):
    events = _load_events(days=days, limit=10000)
    return {
        "metric": metric,
        "series": build_timeseries(events, metric, days=days),
    }


@router.get("/events")
async def list_events(
    _: str = Depends(verify_dashboard_key),
    days: int = Query(7, ge=1, le=90),
    event_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    events = _load_events(days=days, event_type=event_type, limit=limit + offset + 500)
    page = events[offset : offset + limit]
    flags = {f"{f['guest_id']}:{f['session_id']}": f for f in get_database().list_transcript_flags()}
    for ev in page:
        meta = ev.get("metadata") or {}
        gid = ev.get("guest_id")
        if gid and meta.get("session_id"):
            key = f"{gid}:{meta['session_id']}"
            if key in flags:
                ev["transcript_flag"] = flags[key]
    return {
        "total": len(events),
        "offset": offset,
        "limit": limit,
        "events": page,
    }


@router.get("/threads")
async def list_conversation_threads(
    _: str = Depends(verify_dashboard_key),
    days: int = Query(30, ge=1, le=90),
):
    events = _load_events(days=days, limit=10000)
    threads = build_conversation_threads(events)
    flags = {f"{f['guest_id']}:{f['session_id']}": f for f in get_database().list_transcript_flags()}
    for thread in threads:
        key = f"{thread['guest_id']}:{thread['session_id']}"
        if key in flags:
            thread["transcript_flag"] = flags[key]
    return {"threads": threads, "total": len(threads)}


@router.get("/transcript-flags")
async def list_transcript_flags(
    _: str = Depends(verify_dashboard_key),
    category: Optional[str] = Query(None),
):
    flags = get_database().list_transcript_flags(category=category)
    return {"flags": flags, "total": len(flags)}


@router.put("/transcript-flags")
async def upsert_transcript_flag(
    body: TranscriptFlagBody,
    _: str = Depends(verify_dashboard_key),
):
    row = get_database().upsert_transcript_flag(
        guest_id=body.guest_id,
        session_id=body.session_id,
        category=body.category.value,
        note=body.note,
    )
    return row


@router.delete("/transcript-flags")
async def delete_transcript_flag(
    guest_id: str = Query(...),
    session_id: str = Query(...),
    _: str = Depends(verify_dashboard_key),
):
    ok = get_database().delete_transcript_flag(guest_id, session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Flag not found")
    return {"deleted": True}
