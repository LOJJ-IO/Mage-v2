"""UTC-naive datetime normalization for comparisons with datetime.utcnow()."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utc_naive(dt: datetime) -> datetime:
    """Normalize to UTC naive so mixed aware/naive values compare safely."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def is_within_stay_window(
    moment: datetime,
    check_in: datetime,
    check_out: datetime,
    *,
    grace: timedelta = timedelta(0),
) -> bool:
    """True when moment falls within [check_in - grace, check_out + grace]."""
    m = utc_naive(moment)
    start = utc_naive(check_in) - grace
    end = utc_naive(check_out) + grace
    return start <= m <= end


def stay_has_not_started(
    moment: datetime,
    check_in: datetime,
    *,
    grace: timedelta = timedelta(0),
) -> bool:
    return utc_naive(moment) < utc_naive(check_in) - grace


def stay_has_ended(
    moment: datetime,
    check_out: datetime,
    *,
    grace: timedelta = timedelta(0),
) -> bool:
    return utc_naive(moment) > utc_naive(check_out) + grace
