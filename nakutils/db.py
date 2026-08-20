"""SQLite persistence helpers for quotas, subscriptions and registrations."""

import json
import os
import sqlite3

AI_QUOTA_DB_PATH = os.environ.get("AI_QUOTA_DB_PATH", os.path.join("/tmp", "nakconel_ai_quota.sqlite3"))

SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS ai_quotas (
        client_key TEXT PRIMARY KEY,
        period_start TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        boost_claimed_on TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_subscriptions (
        reference TEXT PRIMARY KEY,
        client_key TEXT NOT NULL,
        email TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        authorization_url TEXT,
        paid_at TEXT,
        starts_at TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS strategy_calls (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL,
        updated_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS career_registrations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        program TEXT NOT NULL,
        experience_level TEXT,
        statement TEXT,
        details TEXT,
        amount INTEGER NOT NULL DEFAULT 250000,
        status TEXT NOT NULL DEFAULT 'pending_payment',
        payment_reference TEXT,
        paid_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS campaign_registrations (
        id TEXT PRIMARY KEY,
        uid TEXT NOT NULL,
        email TEXT NOT NULL,
        full_name TEXT,
        business TEXT,
        challenge TEXT,
        package_name TEXT,
        amount REAL,
        currency TEXT,
        status TEXT NOT NULL DEFAULT 'pending_payment',
        payment_reference TEXT,
        created_at TEXT NOT NULL,
        raw_json TEXT
    )
    """,
)


def get_db():
    """Open a connection to the local SQLite database, creating missing tables."""
    db_dir = os.path.dirname(AI_QUOTA_DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(AI_QUOTA_DB_PATH)
    conn.row_factory = sqlite3.Row
    for statement in SCHEMA_STATEMENTS:
        conn.execute(statement)
    return conn


def execute_write(sql, params=(), context="SQLite write"):
    """Run a write statement, logging (instead of raising) on failure."""
    try:
        with get_db() as conn:
            conn.execute(sql, params)
        return True
    except Exception as exc:
        print(f"{context} warning: {exc}")
        return False


def fetch_all(sql, params=(), context="SQLite read"):
    try:
        with get_db() as conn:
            return [dict(row) for row in conn.execute(sql, params).fetchall()]
    except Exception as exc:
        print(f"{context} warning: {exc}")
        return []


def fetch_one(sql, params=(), context="SQLite read"):
    try:
        with get_db() as conn:
            row = conn.execute(sql, params).fetchone()
        return dict(row) if row else None
    except Exception as exc:
        print(f"{context} warning: {exc}")
        return None


def attach_parsed_details(item, fallback=None, key="details", parsed_key="detailsParsed"):
    """Decode a JSON text column into `parsed_key`, using `fallback` when unavailable."""
    raw = item.get(key)
    if raw:
        try:
            item[parsed_key] = json.loads(raw)
            return item
        except Exception:
            pass
    if fallback is not None:
        item[parsed_key] = fallback
    return item


def registration_from_row(row, key="raw_json"):
    """Prefer the stored JSON snapshot of a registration, falling back to the row."""
    raw = row.get(key)
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass
    return row
