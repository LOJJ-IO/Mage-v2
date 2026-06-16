"""Tests for UTC-naive stay window comparisons."""
from datetime import datetime, timedelta, timezone

from app.services.datetime_helpers import (
    is_within_stay_window,
    stay_has_ended,
    stay_has_not_started,
    utc_naive,
)


def test_utc_naive_from_aware():
    aware = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    assert utc_naive(aware) == datetime(2026, 6, 15, 12, 0)


def test_is_within_stay_window_mixed_naive_and_aware():
    now = datetime.utcnow()
    check_in = datetime(2026, 1, 1, 15, 0, tzinfo=timezone.utc)
    check_out = datetime(2026, 12, 31, 11, 0)
    assert is_within_stay_window(now, check_in, check_out)


def test_stay_has_not_started_with_mixed_timezones():
    now = datetime(2025, 1, 1)
    check_in = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert stay_has_not_started(now, check_in, grace=timedelta(hours=12))


def test_stay_has_ended_with_mixed_timezones():
    now = datetime(2027, 1, 1)
    check_out = datetime(2026, 12, 31, 11, 0, tzinfo=timezone.utc)
    assert stay_has_ended(now, check_out, grace=timedelta(hours=12))
