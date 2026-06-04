from __future__ import annotations

import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

_analyzer = None


def _get_analyzer():
    global _analyzer
    if _analyzer is None:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        _analyzer = SentimentIntensityAnalyzer()
    return _analyzer


def compute_happiness_score(messages: List[Dict[str, str]], window: int = 10) -> int:
    """Weighted VADER score of recent guest messages → 0–100. Default 72 if no messages.

    Recency weighting: weight = 0.85^(n-1-i), so newest message has weight=1.0
    and a message 10 slots back has weight≈0.20. Maps VADER compound [-1,+1] to [0,100].
    """
    user_msgs = [
        m for m in messages
        if m.get("role") == "user" and (m.get("content") or "").strip()
    ]
    if not user_msgs:
        return 72

    recent = user_msgs[-window:]
    n = len(recent)
    decay = 0.85
    total_w = 0.0
    weighted_sum = 0.0
    analyzer = _get_analyzer()

    for i, msg in enumerate(recent):
        w = decay ** (n - 1 - i)
        compound = analyzer.polarity_scores(msg["content"])["compound"]
        weighted_sum += w * compound
        total_w += w

    avg = weighted_sum / total_w
    return max(0, min(100, round((avg + 1.0) / 2.0 * 100.0)))
