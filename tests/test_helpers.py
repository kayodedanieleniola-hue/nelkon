import base64
import json
from datetime import datetime, timezone

import app as app_module


class TestGetAdminEmails:
    def test_empty_when_unset(self):
        assert app_module.get_admin_emails() == set()

    def test_single_admin_email(self, monkeypatch):
        monkeypatch.setenv("ADMIN_EMAIL", "  Boss@Example.COM ")
        assert app_module.get_admin_emails() == {"boss@example.com"}

    def test_multiple_admin_emails(self, monkeypatch):
        monkeypatch.setenv("ADMIN_EMAILS", "a@x.com, B@Y.com ,, c@z.com")
        assert app_module.get_admin_emails() == {"a@x.com", "b@y.com", "c@z.com"}

    def test_combines_both_sources(self, monkeypatch):
        monkeypatch.setenv("ADMIN_EMAIL", "one@x.com")
        monkeypatch.setenv("ADMIN_EMAILS", "two@x.com")
        assert app_module.get_admin_emails() == {"one@x.com", "two@x.com"}


class TestIsAdminUser:
    def test_none_user(self):
        assert app_module.is_admin_user(None) is False

    def test_user_without_email(self):
        assert app_module.is_admin_user({}) is False

    def test_non_admin_email(self, monkeypatch):
        monkeypatch.setenv("ADMIN_EMAIL", "admin@x.com")
        assert app_module.is_admin_user({"email": "user@x.com"}) is False

    def test_admin_email_case_insensitive(self, monkeypatch):
        monkeypatch.setenv("ADMIN_EMAIL", "admin@x.com")
        assert app_module.is_admin_user({"email": " Admin@X.com "}) is True


class TestGetTeamMember:
    def test_known_member(self):
        member = app_module.get_team_member("kayode-daniel")
        assert member is not None
        assert member["name"] == "Kayode Daniel E"

    def test_unknown_member(self):
        assert app_module.get_team_member("nobody") is None


class TestGetClientKey:
    def test_from_header(self, client):
        with app_module.app.test_request_context(headers={"X-NAK-Client-Id": "abc-123"}):
            assert app_module.get_client_key() == "abc-123"

    def test_strips_invalid_characters(self, client):
        with app_module.app.test_request_context(headers={"X-NAK-Client-Id": "a b<script>!#c"}):
            assert app_module.get_client_key() == "abscriptc"

    def test_falls_back_to_remote_addr(self, client):
        with app_module.app.test_request_context(environ_base={"REMOTE_ADDR": "10.0.0.1"}):
            assert app_module.get_client_key() == "10.0.0.1"

    def test_anonymous_when_all_invalid(self, client):
        with app_module.app.test_request_context(headers={"X-NAK-Client-Id": "$%^&*"}):
            assert app_module.get_client_key() == "anonymous"

    def test_truncated_to_120_chars(self, client):
        with app_module.app.test_request_context(headers={"X-NAK-Client-Id": "x" * 300}):
            assert len(app_module.get_client_key()) == 120


class TestParseFirebaseServiceAccountInfo:
    def test_none_input(self):
        assert app_module.parse_firebase_service_account_info(None) is None

    def test_non_string_input(self):
        assert app_module.parse_firebase_service_account_info(123) is None

    def test_plain_json(self):
        raw = json.dumps({"type": "service_account", "private_key": "line1\\nline2"})
        parsed = app_module.parse_firebase_service_account_info(raw)
        assert parsed["type"] == "service_account"
        assert parsed["private_key"] == "line1\nline2"

    def test_quoted_json(self):
        raw = "'" + json.dumps({"type": "service_account"}) + "'"
        parsed = app_module.parse_firebase_service_account_info(raw)
        assert parsed == {"type": "service_account"}

    def test_base64_json(self):
        encoded = base64.b64encode(json.dumps({"type": "service_account"}).encode()).decode()
        parsed = app_module.parse_firebase_service_account_info(encoded)
        assert parsed == {"type": "service_account"}

    def test_file_path(self, tmp_path):
        path = tmp_path / "sa.json"
        path.write_text(json.dumps({"type": "service_account"}))
        parsed = app_module.parse_firebase_service_account_info(str(path))
        assert parsed == {"type": "service_account"}

    def test_invalid_input(self):
        assert app_module.parse_firebase_service_account_info("not json at all") is None

    def test_json_array_returns_none(self):
        assert app_module.parse_firebase_service_account_info("[1, 2]") is None


class TestCheckRateLimit:
    def test_allows_under_limit(self):
        allowed, retry_after = app_module.check_rate_limit("key1", max_requests=3, window_seconds=60)
        assert allowed is True
        assert retry_after == 0

    def test_blocks_over_limit(self):
        for _ in range(3):
            app_module.check_rate_limit("key2", max_requests=3, window_seconds=60)
        allowed, retry_after = app_module.check_rate_limit("key2", max_requests=3, window_seconds=60)
        assert allowed is False
        assert retry_after > 0

    def test_window_expiry_allows_again(self, monkeypatch):
        timestamps = [0.0, 0.0, 0.0]
        app_module._RATE_LIMIT_STORE["key3"] = timestamps
        monkeypatch.setattr(app_module.time, "time", lambda: 120.0)
        allowed, _ = app_module.check_rate_limit("key3", max_requests=3, window_seconds=60)
        assert allowed is True

    def test_keys_are_independent(self):
        for _ in range(3):
            app_module.check_rate_limit("busy", max_requests=3, window_seconds=60)
        allowed, _ = app_module.check_rate_limit("idle", max_requests=3, window_seconds=60)
        assert allowed is True


class TestDateHelpers:
    def test_utc_today_format(self):
        assert app_module.utc_today() == datetime.now(timezone.utc).date().isoformat()

    def test_reset_at_iso_is_next_midnight_utc(self):
        reset = datetime.fromisoformat(app_module.reset_at_iso())
        assert reset.tzinfo is not None
        assert (reset.hour, reset.minute, reset.second) == (0, 0, 0)
        assert reset > datetime.now(timezone.utc)


class TestJsonSafe:
    def test_datetime_converted(self):
        dt = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        assert app_module.json_safe(dt) == dt.isoformat()

    def test_nested_structures(self):
        dt = datetime(2024, 1, 2, tzinfo=timezone.utc)
        result = app_module.json_safe({"a": [dt, {"b": dt}], "c": 1})
        assert result == {"a": [dt.isoformat(), {"b": dt.isoformat()}], "c": 1}

    def test_plain_values_passthrough(self):
        assert app_module.json_safe("text") == "text"
        assert app_module.json_safe(5) == 5
        assert app_module.json_safe(None) is None


class TestConversationIdFor:
    def test_basic(self):
        assert app_module.conversation_id_for("uid1", "member1") == "uid1__member1"

    def test_strips_special_characters(self):
        assert app_module.conversation_id_for("u!@#id", "m$%^em") == "uid__mem"

    def test_none_values(self):
        assert app_module.conversation_id_for(None, None) == "__"

    def test_truncates_long_ids(self):
        result = app_module.conversation_id_for("a" * 200, "b" * 200)
        assert result == "a" * 80 + "__" + "b" * 80


class TestGetChatMessagePayload:
    def test_strips_and_returns_text(self):
        assert app_module.get_chat_message_payload({"text": "  hi there  "}) == "hi there"

    def test_none_data(self):
        assert app_module.get_chat_message_payload(None) == ""

    def test_missing_text(self):
        assert app_module.get_chat_message_payload({}) == ""

    def test_truncates_to_max_len(self):
        assert app_module.get_chat_message_payload({"text": "x" * 2000}, max_len=100) == "x" * 100
