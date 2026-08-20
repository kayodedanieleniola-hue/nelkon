from datetime import datetime, timezone, timedelta

import app as app_module


def insert_active_subscription(client_key, days=7):
    now = datetime.now(timezone.utc)
    with app_module.get_quota_db() as conn:
        conn.execute(
            """
            INSERT INTO ai_subscriptions
            (reference, client_key, email, plan_id, plan_name, amount, status, paid_at, starts_at, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
            """,
            (
                f"REF-{client_key}",
                client_key,
                "user@example.com",
                "weekly",
                "Weekly",
                2500,
                now.isoformat(),
                now.isoformat(),
                (now + timedelta(days=days)).isoformat(),
                now.isoformat(),
            ),
        )


class TestGetActiveSubscription:
    def test_none_without_rows(self):
        assert app_module.get_active_subscription("nobody") is None

    def test_returns_active_subscription(self):
        insert_active_subscription("subscriber")
        sub = app_module.get_active_subscription("subscriber")
        assert sub is not None
        assert sub["plan_id"] == "weekly"

    def test_ignores_expired_subscription(self):
        insert_active_subscription("expired-user", days=-1)
        assert app_module.get_active_subscription("expired-user") is None


class TestGetQuotaState:
    def test_new_client_gets_full_quota(self):
        state = app_module.get_quota_state("fresh-client")
        assert state["used"] == 0
        assert state["limit"] == app_module.FREE_DAILY_MESSAGES
        assert state["remaining"] == app_module.FREE_DAILY_MESSAGES
        assert state["boostClaimed"] is False

    def test_subscriber_is_unlimited(self):
        insert_active_subscription("subscriber")
        state = app_module.get_quota_state("subscriber")
        assert state["unlimited"] is True
        assert state["plan"]["id"] == "weekly"

    def test_resets_on_new_day(self):
        with app_module.get_quota_db() as conn:
            conn.execute(
                "INSERT INTO ai_quotas (client_key, period_start, used, boost_claimed_on) VALUES (?, ?, ?, ?)",
                ("stale-client", "2000-01-01", 30, "2000-01-01"),
            )
        state = app_module.get_quota_state("stale-client")
        assert state["used"] == 0
        assert state["boostClaimed"] is False

    def test_boost_extends_limit(self):
        today = app_module.utc_today()
        with app_module.get_quota_db() as conn:
            conn.execute(
                "INSERT INTO ai_quotas (client_key, period_start, used, boost_claimed_on) VALUES (?, ?, ?, ?)",
                ("boosted", today, 10, today),
            )
        state = app_module.get_quota_state("boosted")
        assert state["limit"] == app_module.FREE_DAILY_MESSAGES + app_module.DAILY_BOOST_MESSAGES
        assert state["used"] == 10
        assert state["boostClaimed"] is True


class TestConsumeAiMessage:
    def test_consumes_one_message(self):
        ok, state = app_module.consume_ai_message("consumer")
        assert ok is True
        assert state["used"] == 1

    def test_blocks_at_limit(self):
        today = app_module.utc_today()
        with app_module.get_quota_db() as conn:
            conn.execute(
                "INSERT INTO ai_quotas (client_key, period_start, used, boost_claimed_on) VALUES (?, ?, ?, NULL)",
                ("maxed", today, app_module.FREE_DAILY_MESSAGES),
            )
        ok, state = app_module.consume_ai_message("maxed")
        assert ok is False
        assert state["remaining"] == 0

    def test_subscriber_never_blocked(self):
        insert_active_subscription("subscriber")
        ok, state = app_module.consume_ai_message("subscriber")
        assert ok is True
        assert state["unlimited"] is True

    def test_boost_allows_extra_messages(self):
        today = app_module.utc_today()
        with app_module.get_quota_db() as conn:
            conn.execute(
                "INSERT INTO ai_quotas (client_key, period_start, used, boost_claimed_on) VALUES (?, ?, ?, ?)",
                ("boosted", today, app_module.FREE_DAILY_MESSAGES, today),
            )
        ok, _ = app_module.consume_ai_message("boosted")
        assert ok is True


class TestQuotaEndpoints:
    def test_quota_endpoint(self, client):
        resp = client.get("/api/ai/quota", headers={"X-NAK-Client-Id": "api-client"})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["remaining"] == app_module.FREE_DAILY_MESSAGES

    def test_boost_claim(self, client):
        resp = client.post("/api/ai/boost", headers={"X-NAK-Client-Id": "api-client"})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["claimed"] is True
        assert body["quota"]["boostClaimed"] is True
        assert body["quota"]["limit"] == app_module.FREE_DAILY_MESSAGES + app_module.DAILY_BOOST_MESSAGES

    def test_boost_cannot_be_claimed_twice(self, client):
        client.post("/api/ai/boost", headers={"X-NAK-Client-Id": "api-client"})
        resp = client.post("/api/ai/boost", headers={"X-NAK-Client-Id": "api-client"})
        assert resp.status_code == 409
        assert resp.get_json()["claimed"] is False

    def test_boost_rate_limited(self, client):
        for _ in range(5):
            app_module.check_rate_limit("api-client", max_requests=5, window_seconds=60)
        resp = client.post("/api/ai/boost", headers={"X-NAK-Client-Id": "api-client"})
        assert resp.status_code == 429
