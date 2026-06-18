"""Pure aggregation helpers for dashboard metrics."""
from __future__ import annotations

import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple


def _parse_ts(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def filter_events_by_range(
    events: List[dict],
    *,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    property_id: Optional[str] = None,
) -> List[dict]:
    out: List[dict] = []
    for ev in events:
        if property_id and ev.get("property_id") and ev.get("property_id") != property_id:
            continue
        ts = _parse_ts(ev.get("created_at"))
        if ts is None:
            continue
        if start and ts < start:
            continue
        if end and ts > end:
            continue
        out.append(ev)
    return out


def _percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = int(round((pct / 100.0) * (len(sorted_vals) - 1)))
    return sorted_vals[max(0, min(idx, len(sorted_vals) - 1))]


def _routing_events(events: List[dict]) -> List[dict]:
    return [e for e in events if e.get("event_type") == "routing"]


def _faq_events(events: List[dict]) -> List[dict]:
    return [e for e in events if e.get("event_type") == "faq_feedback"]


def _is_escalation(ev: dict) -> bool:
    esc = (ev.get("escalation_type") or "").lower()
    if esc in ("escalated", "contact", "repetition"):
        return True
    if ev.get("staff_action_logged"):
        return True
    return False


def aggregate_marketing(
    events: List[dict],
    *,
    labor_cost_per_call: float,
    avg_call_minutes: float,
    happiness_threshold: int,
) -> Dict[str, Any]:
    routing = _routing_events(events)
    total_routed = len(routing)
    escalations = sum(1 for e in routing if _is_escalation(e))
    calls_avoided = max(0, total_routed - escalations)
    handled_without_staff_pct = (
        round((calls_avoided / total_routed) * 100, 1) if total_routed else 0.0
    )
    labor_saved = round(calls_avoided * labor_cost_per_call, 2)
    time_saved_minutes = round(calls_avoided * avg_call_minutes, 1)

    latencies = [
        float(e["total_latency_ms"])
        for e in routing
        if e.get("total_latency_ms") is not None
    ]
    avg_latency_ms = round(statistics.mean(latencies), 0) if latencies else 0
    p95_latency_ms = round(_percentile(latencies, 95), 0) if latencies else 0

    guest_scores: Dict[str, int] = {}
    for ev in events:
        gid = ev.get("guest_id")
        score = ev.get("happiness_score")
        if gid and score is not None:
            guest_scores[str(gid)] = int(score)

    sentiment_events = [e for e in events if e.get("event_type") == "sentiment"]
    for ev in sentiment_events:
        gid = ev.get("guest_id")
        score = ev.get("happiness_score")
        if gid and score is not None:
            guest_scores[str(gid)] = int(score)

    happy_count = sum(1 for s in guest_scores.values() if s >= happiness_threshold)
    guest_total = len(guest_scores)
    satisfaction_pct = (
        round((happy_count / guest_total) * 100, 1) if guest_total else 0.0
    )

    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    dau = len(
        {
            e.get("guest_id")
            for e in routing
            if e.get("guest_id") and (_parse_ts(e.get("created_at")) or now) >= day_ago
        }
    )
    wau = len(
        {
            e.get("guest_id")
            for e in routing
            if e.get("guest_id") and (_parse_ts(e.get("created_at")) or now) >= week_ago
        }
    )

    this_week = [e for e in routing if (_parse_ts(e.get("created_at")) or now) >= week_ago]
    prev_week_start = week_ago - timedelta(days=7)
    prev_week = [
        e
        for e in routing
        if prev_week_start <= (_parse_ts(e.get("created_at")) or now) < week_ago
    ]
    wow_growth = 0.0
    if prev_week:
        wow_growth = round(
            ((len(this_week) - len(prev_week)) / len(prev_week)) * 100, 1
        )
    elif this_week:
        wow_growth = 100.0

    total_messages = total_routed
    escalation_rate = (
        round((escalations / total_routed) * 100, 1) if total_routed else 0.0
    )

    return {
        "calls_avoided": calls_avoided,
        "labor_saved_usd": labor_saved,
        "time_saved_minutes": time_saved_minutes,
        "guest_satisfaction_pct": satisfaction_pct,
        "happy_guests": happy_count,
        "total_guests_scored": guest_total,
        "avg_response_ms": avg_latency_ms,
        "p95_response_ms": p95_latency_ms,
        "handled_without_staff_pct": handled_without_staff_pct,
        "escalation_rate_pct": escalation_rate,
        "total_messages": total_messages,
        "dau": dau,
        "wau": wau,
        "wow_growth_pct": wow_growth,
    }


def aggregate_dev(events: List[dict]) -> Dict[str, Any]:
    routing = _routing_events(events)
    faq = _faq_events(events)

    confidence_buckets = {"low": 0, "medium": 0, "high": 0}
    for ev in routing:
        c = ev.get("confidence")
        if c is None:
            continue
        if c < 0.39:
            confidence_buckets["low"] += 1
        elif c < 0.7:
            confidence_buckets["medium"] += 1
        else:
            confidence_buckets["high"] += 1

    ability_usage: Counter[str] = Counter()
    ability_errors: Counter[str] = Counter()
    ability_total: Counter[str] = Counter()
    for ev in routing:
        for ab in ev.get("abilities") or []:
            ability_usage[str(ab)] += 1
        executed = ev.get("ability_executed")
        if executed:
            ability_total[str(executed)] += 1
            if ev.get("success") is False:
                ability_errors[str(executed)] += 1

    request_types: Counter[str] = Counter()
    for ev in routing:
        rt = ev.get("request_type")
        if rt:
            request_types[str(rt)] += 1

    escalation_reasons: Counter[str] = Counter()
    for ev in routing:
        if _is_escalation(ev):
            esc = ev.get("escalation_type") or "staff_action"
            escalation_reasons[str(esc)] += 1

    faq_total = len(faq)
    faq_rejected = sum(
        1
        for e in faq
        if not e.get("success") and not (e.get("metadata") or {}).get("helpful", True)
    )
    faq_rejection_rate = (
        round((faq_rejected / faq_total) * 100, 1) if faq_total else 0.0
    )

    classifier_lat = [
        float(e["classifier_latency_ms"])
        for e in routing
        if e.get("classifier_latency_ms") is not None
    ]
    copy_lat = [
        float(e["copy_latency_ms"])
        for e in routing
        if e.get("copy_latency_ms") is not None
    ]
    total_lat = [
        float(e["total_latency_ms"])
        for e in routing
        if e.get("total_latency_ms") is not None
    ]

    fallback_count = sum(1 for e in routing if e.get("fallback_used"))
    cache_hits = sum(1 for e in routing if e.get("prompt_cache_hit"))
    cache_eligible = sum(
        1 for e in routing if e.get("classifier_latency_ms") is not None
    )

    p50 = _percentile(total_lat, 50) if total_lat else 0
    p95 = _percentile(total_lat, 95) if total_lat else 0
    consistency_ratio = round(p95 / p50, 2) if p50 > 0 else 0.0

    first_attempt = sum(
        1 for e in routing if (e.get("request_type") or "new") == "new"
    )
    first_attempt_rate = (
        round((first_attempt / len(routing)) * 100, 1) if routing else 0.0
    )

    repetition_rate = (
        round((request_types.get("repetition", 0) / len(routing)) * 100, 1)
        if routing
        else 0.0
    )

    multi_turn_guests = Counter()
    for ev in routing:
        gid = ev.get("guest_id")
        if gid:
            multi_turn_guests[str(gid)] += 1
    multi_turn_count = sum(1 for c in multi_turn_guests.values() if c > 1)

    return {
        "confidence_buckets": confidence_buckets,
        "ability_usage": dict(ability_usage),
        "ability_error_rates": {
            ab: round((ability_errors[ab] / ability_total[ab]) * 100, 1)
            for ab in ability_total
            if ability_total[ab] > 0
        },
        "request_types": dict(request_types),
        "escalation_reasons": dict(escalation_reasons),
        "faq_rejection_rate_pct": faq_rejection_rate,
        "faq_total": faq_total,
        "latency_avg_ms": {
            "classifier": round(statistics.mean(classifier_lat), 0) if classifier_lat else 0,
            "copy": round(statistics.mean(copy_lat), 0) if copy_lat else 0,
            "total": round(statistics.mean(total_lat), 0) if total_lat else 0,
        },
        "fallback_rate_pct": round(
            (fallback_count / len(routing)) * 100, 1
        ) if routing else 0.0,
        "prompt_cache_hit_rate_pct": round(
            (cache_hits / cache_eligible) * 100, 1
        ) if cache_eligible else 0.0,
        "response_consistency_ratio": consistency_ratio,
        "first_attempt_resolution_pct": first_attempt_rate,
        "repetition_rate_pct": repetition_rate,
        "multi_turn_guests": multi_turn_count,
        "total_routing_events": len(routing),
        "misclassification_proxy_pct": round(
            repetition_rate + faq_rejection_rate * 0.5, 1
        ),
    }


def build_timeseries(
    events: List[dict],
    metric: str,
    *,
    days: int = 30,
) -> List[Dict[str, Any]]:
    routing = _routing_events(events)
    end = datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=0)
    start = end - timedelta(days=days - 1)
    buckets: Dict[str, Dict[str, Any]] = {}

    for i in range(days):
        day = (start + timedelta(days=i)).date().isoformat()
        buckets[day] = {
            "date": day,
            "messages": 0,
            "escalations": 0,
            "avg_latency_ms": 0,
            "_latencies": [],
        }

    for ev in routing:
        ts = _parse_ts(ev.get("created_at"))
        if not ts:
            continue
        day = ts.date().isoformat()
        if day not in buckets:
            continue
        buckets[day]["messages"] += 1
        if _is_escalation(ev):
            buckets[day]["escalations"] += 1
        if ev.get("total_latency_ms") is not None:
            buckets[day]["_latencies"].append(float(ev["total_latency_ms"]))

    series: List[Dict[str, Any]] = []
    for day in sorted(buckets.keys()):
        row = buckets[day]
        lats = row.pop("_latencies")
        if metric == "latency":
            row["value"] = round(statistics.mean(lats), 0) if lats else 0
        elif metric == "escalations":
            row["value"] = row["escalations"]
        else:
            row["value"] = row["messages"]
        series.append(row)
    return series


def recent_wins(events: List[dict], limit: int = 10) -> List[Dict[str, Any]]:
    routing = _routing_events(events)
    wins: List[Dict[str, Any]] = []
    for ev in sorted(
        routing,
        key=lambda e: _parse_ts(e.get("created_at")) or datetime.min,
        reverse=True,
    ):
        if _is_escalation(ev):
            continue
        if ev.get("success") is False:
            continue
        meta = ev.get("metadata") or {}
        wins.append(
            {
                "guest_id": ev.get("guest_id"),
                "property_id": ev.get("property_id"),
                "ability": ev.get("ability_executed") or (ev.get("abilities") or ["?"])[0],
                "response_ms": ev.get("total_latency_ms"),
                "happiness_score": ev.get("happiness_score"),
                "summary": meta.get("user_message_preview", "Instant answer delivered"),
                "created_at": ev.get("created_at"),
            }
        )
        if len(wins) >= limit:
            break
    return wins
