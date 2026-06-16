"""Analytics dashboard API (key-gated)."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from app.core.config import get_settings
from app.services.database import get_database
from app.services.metrics_aggregations import (
    aggregate_dev,
    aggregate_marketing,
    aggregate_phrases,
    build_timeseries,
    filter_events_by_range,
    marketing_chart_splits,
    recent_wins,
)
from app.services.metrics_service import get_tracking_config

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
settings = get_settings()


class MetricsConfigPatch(BaseModel):
    enabled: bool


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
    return filter_events_by_range(rows, start=start, end=end, property_id=pid)


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
    return {
        "period_days": days,
        "tracking": get_tracking_config(),
        "summary": summary,
        "recent_wins": recent_wins(events, limit=12),
        "phrase_cloud": aggregate_phrases(events),
        "chart_splits": marketing_chart_splits(
            events, happiness_threshold=settings.metrics_happiness_threshold
        ),
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
        "metrics": aggregate_dev(events),
        "phrase_cloud": aggregate_phrases(events),
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
    events = _load_events(days=days, event_type=event_type, limit=limit + offset)
    page = events[offset : offset + limit]
    return {
        "total": len(events),
        "offset": offset,
        "limit": limit,
        "events": page,
    }
