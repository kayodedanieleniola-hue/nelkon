import app as app_module

VALID_USERNAME = "kayode-daniel"
VALID_PASSWORD = app_module.ADMIN_CREDENTIALS[VALID_USERNAME]


class TestAdminLogin:
    def test_successful_login(self, client):
        resp = client.post("/api/admin-login", json={"username": VALID_USERNAME, "password": VALID_PASSWORD})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["success"] is True
        assert body["username"] == VALID_USERNAME
        assert body["name"] == "Kayode Daniel E"

    def test_wrong_password(self, client):
        resp = client.post("/api/admin-login", json={"username": VALID_USERNAME, "password": "wrong"})
        assert resp.status_code == 401

    def test_unknown_username(self, client):
        resp = client.post("/api/admin-login", json={"username": "ghost", "password": "x"})
        assert resp.status_code == 401

    def test_missing_credentials(self, client):
        resp = client.post("/api/admin-login", json={})
        assert resp.status_code == 400

    def test_login_sets_session(self, client):
        client.post("/api/admin-login", json={"username": VALID_USERNAME, "password": VALID_PASSWORD})
        resp = client.get("/api/admin/check-session")
        assert resp.status_code == 200
        assert resp.get_json()["loggedIn"] is True


class TestCheckSession:
    def test_not_logged_in(self, client):
        resp = client.get("/api/admin/check-session")
        assert resp.status_code == 401
        assert resp.get_json()["loggedIn"] is False

    def test_logged_in_returns_member_info(self, admin_client):
        resp = admin_client.get("/api/admin/check-session")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["loggedIn"] is True
        assert body["email"]


class TestSignOut:
    def test_sign_out_clears_session(self, client):
        client.post("/api/admin-login", json={"username": VALID_USERNAME, "password": VALID_PASSWORD})
        resp = client.post("/api/admin/sign-out")
        assert resp.status_code == 200
        assert client.get("/api/admin/check-session").status_code == 401


class TestRequireAdminSession:
    def test_protected_route_requires_login(self, client):
        resp = client.get("/api/admin/me")
        assert resp.status_code == 401

    def test_protected_route_rejects_unknown_session_user(self, client):
        with client.session_transaction() as sess:
            sess["admin_username"] = "not-a-real-admin"
        resp = client.get("/api/admin/me")
        assert resp.status_code == 403

    def test_admin_me_returns_profile(self, admin_client):
        resp = admin_client.get("/api/admin/me")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["admin"] is True
        assert body["configuredAdmins"] == len(app_module.ADMIN_TEAM)


class TestRequireStrictAuth:
    def test_unauthenticated_request_rejected(self, client):
        resp = client.get("/api/chat/conversations")
        assert resp.status_code == 401

    def test_authenticated_request_allowed(self, client, monkeypatch):
        monkeypatch.setattr(
            app_module, "verify_firebase_id_token", lambda token: {"uid": "user1", "email": "u@example.com"}
        )
        resp = client.get("/api/chat/conversations", headers={"Authorization": "Bearer token"})
        assert resp.status_code == 200
        assert resp.get_json() == {"conversations": []}


class TestChatTeamEndpoint:
    def test_returns_team(self, client):
        resp = client.get("/api/chat/team")
        assert resp.status_code == 200
        assert resp.get_json()["team"] == app_module.ADMIN_TEAM
