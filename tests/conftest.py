import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

import app as app_module


@pytest.fixture(autouse=True)
def isolated_quota_db(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "AI_QUOTA_DB_PATH", str(tmp_path / "quota.sqlite3"))
    yield


@pytest.fixture(autouse=True)
def clear_rate_limit_store():
    app_module._RATE_LIMIT_STORE.clear()
    yield
    app_module._RATE_LIMIT_STORE.clear()


@pytest.fixture(autouse=True)
def no_external_services(monkeypatch):
    monkeypatch.setattr(app_module, "get_firestore_client", lambda: None)
    monkeypatch.delenv("PAYSTACK_SECRET_KEY", raising=False)
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    yield


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as test_client:
        yield test_client


@pytest.fixture
def admin_client(client):
    username = next(iter(app_module.ADMIN_CREDENTIALS))
    with client.session_transaction() as sess:
        sess["admin_username"] = username
    return client
