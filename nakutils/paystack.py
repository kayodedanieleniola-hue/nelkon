"""Paystack API helpers shared by the AI subscription, campaign and career flows."""

import os

import requests

API_BASE = "https://api.paystack.co"
DEFAULT_TIMEOUT = 15


def get_secret_key():
    return os.environ.get("PAYSTACK_SECRET_KEY")


def to_kobo(amount):
    """Convert an NGN amount to the subunit Paystack expects."""
    return round(float(amount) * 100)


def _auth_headers(secret_key, with_json=False):
    headers = {"Authorization": f"Bearer {secret_key}"}
    if with_json:
        headers["Content-Type"] = "application/json"
    return headers


def _request(method, path, secret_key, timeout=DEFAULT_TIMEOUT, json_body=None):
    """Call Paystack and return ({"ok", "payload", "data"}, error_message)."""
    try:
        response = requests.request(
            method,
            f"{API_BASE}{path}",
            headers=_auth_headers(secret_key, with_json=json_body is not None),
            json=json_body,
            timeout=timeout,
        )
        payload = response.json()
    except Exception as exc:
        return None, str(exc)
    return {"ok": response.ok, "payload": payload, "data": payload.get("data") or {}}, None


def initialize_transaction(secret_key, email, amount_kobo, callback_url, metadata=None, reference=None, currency="NGN", timeout=DEFAULT_TIMEOUT):
    body = {
        "email": email,
        "amount": int(amount_kobo),
        "currency": currency,
        "callback_url": callback_url,
    }
    if reference:
        body["reference"] = reference
    if metadata:
        body["metadata"] = metadata
    return _request("POST", "/transaction/initialize", secret_key, timeout=timeout, json_body=body)


def fetch_transaction(secret_key, reference, timeout=DEFAULT_TIMEOUT):
    return _request("GET", f"/transaction/verify/{reference}", secret_key, timeout=timeout)


def verify_reference(reference, expected_amount, expected_currency="NGN"):
    """Verify a transaction matches the expected amount/currency.

    Returns a (body, http_status) pair ready to be returned by a Flask view.
    """
    secret_key = get_secret_key()
    if not secret_key:
        return {"verified": False, "error": "Payment verification is not configured."}, 500

    if not reference:
        return {"verified": False, "error": "Missing payment reference."}, 400

    try:
        expected_amount_kobo = to_kobo(expected_amount)
    except (TypeError, ValueError):
        return {"verified": False, "error": "Invalid expected amount."}, 400

    result, error = fetch_transaction(secret_key, reference)
    if error:
        return {"verified": False, "error": "Could not reach Paystack verification."}, 502

    transaction = result["data"]
    verified = (
        result["ok"]
        and result["payload"].get("status") is True
        and transaction.get("status") == "success"
        and str(transaction.get("currency", "")).upper() == str(expected_currency).upper()
        and int(transaction.get("amount") or 0) == expected_amount_kobo
    )

    if not verified:
        return {
            "verified": False,
            "error": "Payment could not be verified.",
            "paystackStatus": transaction.get("status"),
        }, 400

    return {
        "verified": True,
        "reference": transaction.get("reference"),
        "amount": transaction.get("amount"),
        "currency": transaction.get("currency"),
        "paidAt": transaction.get("paid_at"),
    }, 200
