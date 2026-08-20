import app as app_module


class TestRegisterTraining:
    def test_successful_registration(self, client):
        resp = client.post(
            "/api/register-training",
            json={"fullName": "Jane Doe", "email": "Jane@Example.com", "phone": "08012345678", "course": "Brand Strategy"},
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["success"] is True
        assert body["id"].startswith("TRN-")
        assert body["amount"] == 250000

        with app_module.get_quota_db() as conn:
            row = conn.execute("SELECT * FROM career_registrations WHERE id = ?", (body["id"],)).fetchone()
        assert row["email"] == "jane@example.com"
        assert row["status"] == "pending_payment"

    def test_missing_required_fields(self, client):
        resp = client.post("/api/register-training", json={"fullName": "Jane"})
        assert resp.status_code == 400
        assert resp.get_json()["success"] is False


class TestApplyInternship:
    def test_successful_application(self, client):
        resp = client.post(
            "/api/apply-internship",
            json={
                "fullName": "John Doe",
                "email": "john@example.com",
                "phone": "08011111111",
                "track": "Full-Stack Development",
                "available_days": ["Monday", "Wednesday"],
            },
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["success"] is True
        assert body["id"].startswith("INT-")
        assert body["amount"] == 0

        with app_module.get_quota_db() as conn:
            row = conn.execute("SELECT * FROM career_registrations WHERE id = ?", (body["id"],)).fetchone()
        assert row["status"] == "submitted"
        assert "Monday, Wednesday" in row["details"]

    def test_missing_required_fields(self, client):
        resp = client.post("/api/apply-internship", json={"email": "a@b.com"})
        assert resp.status_code == 400


class TestGetRegistration:
    def test_existing_registration(self, client):
        created = client.post(
            "/api/register-training",
            json={"fullName": "Jane", "email": "j@x.com", "phone": "080"},
        ).get_json()
        resp = client.get(f"/api/registration/{created['id']}")
        assert resp.status_code == 200
        reg = resp.get_json()["registration"]
        assert reg["id"] == created["id"]
        assert "detailsParsed" in reg

    def test_unknown_internship_id_fallback(self, client):
        resp = client.get("/api/registration/INT-000")
        reg = resp.get_json()["registration"]
        assert reg["type"] == "internship"
        assert reg["amount"] == 0

    def test_unknown_training_id_fallback(self, client):
        resp = client.get("/api/registration/TRN-000")
        reg = resp.get_json()["registration"]
        assert reg["type"] == "training"
        assert reg["amount"] == 250000


class TestCompletePayment:
    def test_marks_registration_paid(self, client):
        created = client.post(
            "/api/register-training",
            json={"fullName": "Jane", "email": "j@x.com", "phone": "080"},
        ).get_json()
        resp = client.post(
            f"/api/registration/{created['id']}/complete-payment",
            json={"reference": "MANUAL-123"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["success"] is True

        with app_module.get_quota_db() as conn:
            row = conn.execute("SELECT * FROM career_registrations WHERE id = ?", (created["id"],)).fetchone()
        assert row["status"] == "paid"
        assert row["payment_reference"] == "MANUAL-123"


class TestAdminCareerRegistrations:
    def test_requires_admin_session(self, client):
        assert client.get("/api/admin/career-registrations").status_code == 401

    def test_lists_registrations_with_counts(self, admin_client):
        admin_client.post("/api/register-training", json={"fullName": "A", "email": "a@x.com", "phone": "1"})
        created = admin_client.post(
            "/api/register-training", json={"fullName": "B", "email": "b@x.com", "phone": "2"}
        ).get_json()
        admin_client.post(f"/api/registration/{created['id']}/complete-payment", json={"reference": "MANUAL-1"})

        resp = admin_client.get("/api/admin/career-registrations")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["total"] == 2
        assert body["pendingCount"] == 1
        assert body["approvedCount"] == 1
        assert body["totalRevenueNgn"] == 250000

    def test_update_status(self, admin_client):
        created = admin_client.post(
            "/api/register-training", json={"fullName": "A", "email": "a@x.com", "phone": "1"}
        ).get_json()
        resp = admin_client.post(
            f"/api/admin/career-registrations/{created['id']}/status", json={"status": "approved"}
        )
        assert resp.status_code == 200
        with app_module.get_quota_db() as conn:
            row = conn.execute("SELECT status FROM career_registrations WHERE id = ?", (created["id"],)).fetchone()
        assert row["status"] == "approved"

    def test_update_status_rejects_invalid_value(self, admin_client):
        resp = admin_client.post("/api/admin/career-registrations/TRN-1/status", json={"status": "bogus"})
        assert resp.status_code == 400


class TestStrategyCall:
    def test_submit_strategy_call(self, client):
        resp = client.post(
            "/api/strategy-call",
            json={"name": "Jane", "email": "Jane@X.com", "message": "Help my brand", "phone": "080"},
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["saved"] is True
        assert body["id"].startswith("CALL-")

        with app_module.get_quota_db() as conn:
            row = conn.execute("SELECT * FROM strategy_calls WHERE id = ?", (body["id"],)).fetchone()
        assert row["email"] == "jane@x.com"
        assert row["status"] == "new"

    def test_missing_fields_rejected(self, client):
        resp = client.post("/api/strategy-call", json={"name": "Jane"})
        assert resp.status_code == 400
        assert resp.get_json()["saved"] is False

    def test_admin_lists_calls_from_sqlite(self, admin_client):
        admin_client.post(
            "/api/strategy-call", json={"name": "Jane", "email": "j@x.com", "message": "Hello"}
        )
        resp = admin_client.get("/api/admin/strategy-calls")
        assert resp.status_code == 200
        calls = resp.get_json()["strategyCalls"]
        assert len(calls) == 1
        assert calls[0]["name"] == "Jane"

    def test_admin_updates_call_status(self, admin_client):
        created = admin_client.post(
            "/api/strategy-call", json={"name": "Jane", "email": "j@x.com", "message": "Hello"}
        ).get_json()
        resp = admin_client.post(f"/api/admin/strategy-calls/{created['id']}/status", json={"status": "contacted"})
        assert resp.status_code == 200
        with app_module.get_quota_db() as conn:
            row = conn.execute("SELECT status FROM strategy_calls WHERE id = ?", (created["id"],)).fetchone()
        assert row["status"] == "contacted"

    def test_admin_rejects_invalid_call_status(self, admin_client):
        resp = admin_client.post("/api/admin/strategy-calls/CALL-1/status", json={"status": "bogus"})
        assert resp.status_code == 400
