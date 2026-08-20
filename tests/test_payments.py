import app as app_module


class FakeResponse:
    def __init__(self, payload, ok=True):
        self._payload = payload
        self.ok = ok

    def json(self):
        return self._payload


def paystack_verify_payload(status="success", amount=250000, currency="NGN", reference="REF-1"):
    return {
        "status": True,
        "data": {
            "status": status,
            "amount": amount,
            "currency": currency,
            "reference": reference,
            "paid_at": "2024-01-01T00:00:00Z",
        },
    }


class TestVerifyPaystackReference:
    def test_unconfigured_secret_key(self):
        result, status = app_module.verify_paystack_reference("REF-1", 2500)
        assert status == 500
        assert result["verified"] is False

    def test_missing_reference(self, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        result, status = app_module.verify_paystack_reference("", 2500)
        assert status == 400

    def test_invalid_amount(self, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        result, status = app_module.verify_paystack_reference("REF-1", "not-a-number")
        assert status == 400
        assert result["error"] == "Invalid expected amount."

    def test_network_failure(self, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")

        def boom(*args, **kwargs):
            raise ConnectionError("down")

        monkeypatch.setattr(app_module.requests, "get", boom)
        result, status = app_module.verify_paystack_reference("REF-1", 2500)
        assert status == 502

    def test_successful_verification(self, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        monkeypatch.setattr(
            app_module.requests,
            "get",
            lambda *a, **k: FakeResponse(paystack_verify_payload(amount=250000)),
        )
        result, status = app_module.verify_paystack_reference("REF-1", 2500)
        assert status == 200
        assert result["verified"] is True
        assert result["amount"] == 250000

    def test_amount_mismatch_rejected(self, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        monkeypatch.setattr(
            app_module.requests,
            "get",
            lambda *a, **k: FakeResponse(paystack_verify_payload(amount=100)),
        )
        result, status = app_module.verify_paystack_reference("REF-1", 2500)
        assert status == 400
        assert result["verified"] is False

    def test_currency_mismatch_rejected(self, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        monkeypatch.setattr(
            app_module.requests,
            "get",
            lambda *a, **k: FakeResponse(paystack_verify_payload(currency="USD")),
        )
        result, status = app_module.verify_paystack_reference("REF-1", 2500)
        assert status == 400

    def test_failed_transaction_rejected(self, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        monkeypatch.setattr(
            app_module.requests,
            "get",
            lambda *a, **k: FakeResponse(paystack_verify_payload(status="failed")),
        )
        result, status = app_module.verify_paystack_reference("REF-1", 2500)
        assert status == 400
        assert result["paystackStatus"] == "failed"


class TestVerifyPaystackEndpoint:
    def test_endpoint_returns_verification_result(self, client, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        monkeypatch.setattr(
            app_module.requests,
            "get",
            lambda *a, **k: FakeResponse(paystack_verify_payload(amount=250000)),
        )
        resp = client.post("/api/paystack/verify", json={"reference": "REF-1", "expectedAmount": 2500})
        assert resp.status_code == 200
        assert resp.get_json()["verified"] is True


class TestInitializeAiSubscription:
    def test_requires_secret_key(self, client):
        resp = client.post("/api/ai/subscription/initialize", json={"planId": "weekly"})
        assert resp.status_code == 500

    def test_invalid_plan(self, client, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        resp = client.post("/api/ai/subscription/initialize", json={"planId": "lifetime"})
        assert resp.status_code == 400

    def test_successful_initialization_converts_to_kobo(self, client, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        captured = {}

        def fake_post(url, headers=None, json=None, timeout=None):
            captured["json"] = json
            return FakeResponse(
                {"status": True, "data": {"reference": "SUB-REF", "authorization_url": "https://pay.example"}}
            )

        monkeypatch.setattr(app_module.requests, "post", fake_post)
        resp = client.post(
            "/api/ai/subscription/initialize",
            json={"planId": "weekly", "email": "user@example.com"},
            headers={"X-NAK-Client-Id": "sub-client"},
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["reference"] == "SUB-REF"
        assert body["authorizationUrl"] == "https://pay.example"
        assert captured["json"]["amount"] == 2500 * 100

        with app_module.get_quota_db() as conn:
            row = conn.execute("SELECT * FROM ai_subscriptions WHERE reference = 'SUB-REF'").fetchone()
        assert row["status"] == "pending"
        assert row["client_key"] == "sub-client"

    def test_paystack_failure_returns_error(self, client, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        monkeypatch.setattr(
            app_module.requests,
            "post",
            lambda *a, **k: FakeResponse({"status": False, "message": "Declined"}, ok=False),
        )
        resp = client.post("/api/ai/subscription/initialize", json={"planId": "weekly"})
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "Declined"


class TestVerifyAiSubscription:
    def test_missing_reference(self, client):
        resp = client.post("/api/ai/subscription/verify", json={})
        assert resp.status_code == 400

    def test_unknown_reference(self, client):
        resp = client.post("/api/ai/subscription/verify", json={"reference": "NOPE"})
        assert resp.status_code == 404

    def test_successful_verification_activates_subscription(self, client, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        monkeypatch.setattr(
            app_module.requests,
            "post",
            lambda *a, **k: FakeResponse(
                {"status": True, "data": {"reference": "SUB-REF", "authorization_url": "https://pay.example"}}
            ),
        )
        client.post(
            "/api/ai/subscription/initialize",
            json={"planId": "weekly", "email": "user@example.com"},
            headers={"X-NAK-Client-Id": "sub-client"},
        )
        monkeypatch.setattr(
            app_module.requests,
            "get",
            lambda *a, **k: FakeResponse(paystack_verify_payload(amount=2500 * 100, reference="SUB-REF")),
        )
        resp = client.post(
            "/api/ai/subscription/verify",
            json={"reference": "SUB-REF"},
            headers={"X-NAK-Client-Id": "sub-client"},
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["verified"] is True
        assert body["quota"]["unlimited"] is True
        assert app_module.get_active_subscription("sub-client") is not None


class TestPaystackCallback:
    def test_missing_reference_redirects_with_error(self, client):
        resp = client.get("/api/paystack/callback")
        assert resp.status_code == 302
        assert "error=missing_reference" in resp.headers["Location"]

    def test_unconfigured_key_redirects_pending(self, client):
        resp = client.get("/api/paystack/callback?reference=REF-1&id=TRN-1")
        assert resp.status_code == 302
        assert "status=pending" in resp.headers["Location"]

    def test_successful_payment_marks_registration_paid(self, client, monkeypatch):
        created = client.post(
            "/api/register-training", json={"fullName": "Jane", "email": "j@x.com", "phone": "080"}
        ).get_json()
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        monkeypatch.setattr(
            app_module.requests,
            "get",
            lambda *a, **k: FakeResponse(paystack_verify_payload(reference="REF-OK")),
        )
        resp = client.get(f"/api/paystack/callback?reference=REF-OK&id={created['id']}")
        assert resp.status_code == 302
        assert "status=paid" in resp.headers["Location"]

        with app_module.get_quota_db() as conn:
            row = conn.execute("SELECT * FROM career_registrations WHERE id = ?", (created["id"],)).fetchone()
        assert row["status"] == "paid"
        assert row["payment_reference"] == "REF-OK"

    def test_unverified_payment_redirects_to_payment_page(self, client, monkeypatch):
        monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")
        monkeypatch.setattr(
            app_module.requests,
            "get",
            lambda *a, **k: FakeResponse(paystack_verify_payload(status="failed")),
        )
        resp = client.get("/api/paystack/callback?reference=REF-BAD&id=TRN-1")
        assert resp.status_code == 302
        assert "error=payment_unverified" in resp.headers["Location"]
