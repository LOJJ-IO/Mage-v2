"""Standalone social phrases that may short-circuit to canned replies."""

import re

_STANDALONE_THANKS_PHRASES = frozenset(
    {
        "thanks",
        "thank you",
        "thanks for your help",
        "thanks for helping",
        "thank you for your help",
        "thank you so much",
        "many thanks",
        "thx",
        "ty",
        "much appreciated",
        "appreciate it",
    }
)


def normalize_social_message(message: str) -> str:
    lowered = message.lower().strip()
    lowered = re.sub(r"[^\w\s]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def is_standalone_thanks(message: str) -> bool:
    """True only when the whole message is a brief thanks (not thanks embedded in a longer request)."""
    if "thanksgiving" in message.lower():
        return False
    return normalize_social_message(message) in _STANDALONE_THANKS_PHRASES
