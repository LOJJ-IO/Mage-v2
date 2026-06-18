"""Internal measurement-type metadata for dashboard metrics (REAL vs PROXY)."""
from __future__ import annotations

from typing import Any, Dict, List

# measurement_type: "real" | "proxy"
# client_reportable: whether safe to cite in hotel/advisor conversations
# not_for_client_reporting: explicit internal-only guardrail

OVERVIEW_METRIC_LABELS: Dict[str, Dict[str, Any]] = {
    "resolved_without_escalation_pct": {
        "measurement_type": "real",
        "client_reportable": True,
        "label": "Handled without escalation (pilot data)",
    },
    "request_type_coverage_count": {
        "measurement_type": "real",
        "client_reportable": True,
        "label": "Request type coverage (pilot data)",
    },
    "ability_coverage_count": {
        "measurement_type": "real",
        "client_reportable": True,
        "label": "Ability coverage (pilot data)",
    },
    "conversation_completion_rate_pct": {
        "measurement_type": "real",
        "client_reportable": True,
        "label": "Conversation completion rate (pilot data)",
    },
    "calls_avoided": {
        "measurement_type": "proxy",
        "client_reportable": False,
        "not_for_client_reporting": True,
        "label": "Legacy simulation — routing count without escalation",
    },
    "labor_saved_usd": {
        "measurement_type": "proxy",
        "client_reportable": False,
        "not_for_client_reporting": True,
        "label": "Simulation artifact — no real front desk",
    },
    "time_saved_minutes": {
        "measurement_type": "proxy",
        "client_reportable": False,
        "not_for_client_reporting": True,
        "label": "Simulation artifact — no real labor cost",
    },
    "guest_satisfaction_pct": {
        "measurement_type": "proxy",
        "client_reportable": False,
        "not_for_client_reporting": True,
        "label": "VADER-inferred sentiment — internal trend only",
    },
    "avg_response_ms": {
        "measurement_type": "real",
        "client_reportable": False,
        "label": "End-to-end route latency",
    },
    "total_messages": {
        "measurement_type": "real",
        "client_reportable": False,
        "label": "Routing events (pilot data)",
    },
    "dau": {
        "measurement_type": "real",
        "client_reportable": False,
        "label": "Daily active pilot testers",
    },
    "wau": {
        "measurement_type": "real",
        "client_reportable": False,
        "label": "Weekly active pilot testers",
    },
}

DEV_METRIC_LABELS: Dict[str, Dict[str, Any]] = {
    "first_attempt_resolution_pct": {
        "measurement_type": "proxy",
        "client_reportable": False,
        "label": "Classifier request_type=new proxy",
    },
    "repetition_rate_pct": {
        "measurement_type": "proxy",
        "client_reportable": False,
        "label": "Re-ask proxy",
    },
    "misclassification_proxy_pct": {
        "measurement_type": "proxy",
        "client_reportable": False,
        "not_for_client_reporting": True,
        "label": "Dev health only",
    },
    "confidence_buckets": {
        "measurement_type": "real",
        "client_reportable": False,
        "not_for_client_reporting": True,
        "label": "Classifier confidence — dev health only",
    },
    "latency_avg_ms": {
        "measurement_type": "real",
        "client_reportable": False,
        "not_for_client_reporting": True,
        "label": "Latency breakdown — dev health only",
    },
    "faq_rejection_rate_pct": {
        "measurement_type": "real",
        "client_reportable": False,
        "label": "FAQ thumbs down rate",
    },
}


def metric_labels_for_overview() -> Dict[str, Dict[str, Any]]:
    return dict(OVERVIEW_METRIC_LABELS)


def metric_labels_for_dev() -> Dict[str, Dict[str, Any]]:
    return dict(DEV_METRIC_LABELS)
