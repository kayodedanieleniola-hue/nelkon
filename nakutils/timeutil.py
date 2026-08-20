"""UTC time helpers and JSON-serialisation helpers."""

from datetime import datetime, timedelta, timezone


def utc_now():
    return datetime.now(timezone.utc)


def utc_now_iso():
    return utc_now().isoformat()


def utc_today():
    return utc_now().date().isoformat()


def next_utc_midnight_iso():
    """ISO timestamp of the upcoming UTC midnight (daily quota reset point)."""
    tomorrow = utc_now().date() + timedelta(days=1)
    return datetime.combine(tomorrow, datetime.min.time(), timezone.utc).isoformat()


def json_safe(value):
    """Recursively convert datetime-like values so the result is JSON serialisable."""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    return value
