from flask import Flask, render_template, request, jsonify
import json
import os
import requests
import sqlite3
from datetime import datetime, timezone, timedelta
from functools import wraps

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import re
import time
from collections import defaultdict

app = Flask(__name__)

_firebase_admin_ready = False
_firebase_public_keys = None
_firebase_public_keys_fetched_at = 0
_RATE_LIMIT_STORE = defaultdict(list)
FREE_DAILY_MESSAGES = int(os.environ.get("AI_FREE_DAILY_MESSAGES", "40"))
DAILY_BOOST_MESSAGES = int(os.environ.get("AI_DAILY_BOOST_MESSAGES", "5"))
AI_QUOTA_DB_PATH = os.environ.get("AI_QUOTA_DB_PATH", os.path.join("/tmp", "nakconel_ai_quota.sqlite3"))
AI_SUBSCRIPTION_PLANS = {
    "weekly": {"name": "Weekly", "amount": 2500, "days": 7},
    "monthly": {"name": "Monthly", "amount": 7500, "days": 30},
    "six_months": {"name": "6 Months", "amount": 40000, "days": 180},
    "yearly": {"name": "Yearly", "amount": 70000, "days": 365},
}
ADMIN_TEAM = [
    {"id": "samuel-akinomolafe", "email": "samuel.akinomolafe@nakconel.com", "name": "Samuel Akinomolafe", "role": "Founder"},
    {"id": "oreoluwa-farodoye", "email": "oreoluwa@nakconel.com", "name": "Oreoluwa Farodoye A", "role": "Project Manager - Nakconel"},
    {"id": "kayode-daniel", "email": "kayode@nakconel.com", "name": "Kayode Daniel E", "role": "Full-Stack Developer"},
    {"id": "segun", "email": "segun@nakconel.com", "name": "Segun", "role": "Content Designer"},
    {"id": "samuel-design", "email": "samuel.d@nakconel.com", "name": "Samuel", "role": "Content and Graphics Designer"},
    {"id": "wonuola", "email": "wonuola@nakconel.com", "name": "Wonuola", "role": "Intern-Content Design"},
    {"id": "marcus-tetteh", "email": "marcus@nakconel.com", "name": "Marcus Tetteh", "role": "DevOps Specialist"},
]


def get_admin_emails():
    emails = set()

    single_admin = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    if single_admin:
        emails.add(single_admin)

    raw = os.environ.get("ADMIN_EMAILS", "")
    emails.update(email.strip().lower() for email in raw.split(",") if email.strip())

    return emails


def is_admin_user(user):
    email = (user or {}).get("email", "").strip().lower()
    return bool(email and email in get_admin_emails())


def get_team_member(member_id):
    for member in ADMIN_TEAM:
        if member["id"] == member_id:
            return member
    return None


def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_authenticated_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        if not is_admin_user(user):
            email = (user or {}).get("email") or "unknown"
            return jsonify({"error": f"Admin access required. Signed in as {email}."}), 403
        request._user = user
        return f(*args, **kwargs)
    return decorated


def get_client_key():
    """Get client identifier from request headers or cookies."""
    client_id = request.headers.get("X-NAK-Client-Id") or request.cookies.get("nak_client_id")
    if not client_id:
        client_id = request.remote_addr or "anonymous"
    cleaned = re.sub(r"[^a-zA-Z0-9_\-@.]", "", str(client_id).strip())
    if not cleaned:
        cleaned = "anonymous"
    return cleaned[:120]


def get_firebase_public_keys():
    """Fetch Firebase public keys for JWT verification (cached for 1 hour)."""
    global _firebase_public_keys, _firebase_public_keys_fetched_at
    now = time.time()
    if _firebase_public_keys and (now - _firebase_public_keys_fetched_at) < 3600:
        return _firebase_public_keys
    try:
        resp = requests.get("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com", timeout=10)
        if resp.ok:
            _firebase_public_keys = resp.json()
            _firebase_public_keys_fetched_at = now
            return _firebase_public_keys
    except Exception:
        pass
    return None


def verify_firebase_id_token(id_token):
    """Verify a Firebase ID token and return the decoded uid/email or None."""
    if not id_token:
        return None
    try:
        decoded = get_firebase_auth().verify_id_token(id_token)
        return {"uid": decoded.get("uid"), "email": decoded.get("email")}
    except Exception:
        return None


def initialize_firebase_admin():
    global _firebase_admin_ready
    import firebase_admin
    from firebase_admin import credentials

    if not _firebase_admin_ready:
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not service_account_json:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.")
        service_account_info = json.loads(service_account_json)
        cred = credentials.Certificate(service_account_info)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        _firebase_admin_ready = True


def get_firebase_auth():
    try:
        from firebase_admin import auth as firebase_auth
    except ImportError as exc:
        raise RuntimeError("Firebase Admin SDK is not installed.") from exc

    initialize_firebase_admin()
    return firebase_auth


def get_authenticated_user():
    """Get authenticated user from Authorization header (optional)."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        return verify_firebase_id_token(token)
    return None


def require_strict_auth(f):
    """Decorator to require authentication (use on protected routes)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_authenticated_user()
        if not user:
            return jsonify({"error": "Authentication required", "reply": "Please sign in to continue."}), 401
        request._user = user
        return f(*args, **kwargs)
    return decorated


def optional_auth(f):
    """Decorator that makes auth optional but available to the endpoint."""
    @wraps(f)
    def decorated(*args, **kwargs):
        request._user = get_authenticated_user()
        return f(*args, **kwargs)
    return decorated


def check_rate_limit(client_key, max_requests=15, window_seconds=60):
    now = time.time()
    timestamps = _RATE_LIMIT_STORE[client_key]
    _RATE_LIMIT_STORE[client_key] = [t for t in timestamps if now - t < window_seconds]
    if len(_RATE_LIMIT_STORE[client_key]) >= max_requests:
        oldest = _RATE_LIMIT_STORE[client_key][0]
        retry_after = int(window_seconds - (now - oldest)) + 1
        return False, retry_after
    _RATE_LIMIT_STORE[client_key].append(now)
    return True, 0


def get_quota_db():
    db_dir = os.path.dirname(AI_QUOTA_DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(AI_QUOTA_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_quotas (
            client_key TEXT PRIMARY KEY,
            period_start TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            boost_claimed_on TEXT
        )
        """
    )
    conn.execute(
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
        """
    )
    return conn


def utc_today():
    return datetime.now(timezone.utc).date().isoformat()


def reset_at_iso():
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)
    return datetime.combine(tomorrow, datetime.min.time(), timezone.utc).isoformat()


def get_active_subscription(client_key):
    now = datetime.now(timezone.utc).isoformat()
    with get_quota_db() as conn:
        row = conn.execute(
            """
            SELECT * FROM ai_subscriptions
            WHERE client_key = ? AND status = 'active' AND expires_at > ?
            ORDER BY expires_at DESC
            LIMIT 1
            """,
            (client_key, now)
        ).fetchone()
    return dict(row) if row else None


def get_quota_state(client_key):
    subscription = get_active_subscription(client_key)
    if subscription:
        return {
            "limit": 999999,
            "baseLimit": FREE_DAILY_MESSAGES,
            "boostMessages": DAILY_BOOST_MESSAGES,
            "used": 0,
            "remaining": 999999,
            "boostClaimed": True,
            "resetAt": subscription["expires_at"],
            "unlimited": True,
            "plan": {
                "id": subscription["plan_id"],
                "name": subscription["plan_name"],
                "expiresAt": subscription["expires_at"]
            }
        }

    today = utc_today()
    with get_quota_db() as conn:
        row = conn.execute("SELECT * FROM ai_quotas WHERE client_key = ?", (client_key,)).fetchone()
        if not row:
            conn.execute(
                "INSERT INTO ai_quotas (client_key, period_start, used, boost_claimed_on) VALUES (?, ?, 0, NULL)",
                (client_key, today)
            )
            used = 0
            boost_claimed_on = None
        elif row["period_start"] != today:
            conn.execute(
                "UPDATE ai_quotas SET period_start = ?, used = 0, boost_claimed_on = NULL WHERE client_key = ?",
                (today, client_key)
            )
            used = 0
            boost_claimed_on = None
        else:
            used = int(row["used"] or 0)
            boost_claimed_on = row["boost_claimed_on"]

    limit = FREE_DAILY_MESSAGES + (DAILY_BOOST_MESSAGES if boost_claimed_on == today else 0)
    remaining = max(limit - used, 0)
    return {
        "limit": limit,
        "baseLimit": FREE_DAILY_MESSAGES,
        "boostMessages": DAILY_BOOST_MESSAGES,
        "used": used,
        "remaining": remaining,
        "boostClaimed": boost_claimed_on == today,
        "resetAt": reset_at_iso()
    }


def consume_ai_message(client_key):
    if get_active_subscription(client_key):
        return True, get_quota_state(client_key)

    today = utc_today()
    with get_quota_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM ai_quotas WHERE client_key = ?", (client_key,)).fetchone()
        if not row:
            conn.execute(
                "INSERT INTO ai_quotas (client_key, period_start, used, boost_claimed_on) VALUES (?, ?, 0, NULL)",
                (client_key, today)
            )
            used = 0
            boost_claimed_on = None
        elif row["period_start"] != today:
            conn.execute(
                "UPDATE ai_quotas SET period_start = ?, used = 0, boost_claimed_on = NULL WHERE client_key = ?",
                (today, client_key)
            )
            used = 0
            boost_claimed_on = None
        else:
            used = int(row["used"] or 0)
            boost_claimed_on = row["boost_claimed_on"]

        limit = FREE_DAILY_MESSAGES + (DAILY_BOOST_MESSAGES if boost_claimed_on == today else 0)
        if used >= limit:
            conn.rollback()
            return False, get_quota_state(client_key)

        used += 1
        conn.execute("UPDATE ai_quotas SET used = ? WHERE client_key = ?", (used, client_key))
        conn.commit()

    return True, get_quota_state(client_key)


@app.route("/api/ai/quota", methods=["GET"])
def ai_quota():
    return jsonify(get_quota_state(get_client_key()))


@app.route("/api/ai/boost", methods=["POST"])
def ai_boost():
    client_key = get_client_key()
    allowed, retry_after = check_rate_limit(client_key, max_requests=5, window_seconds=60)
    if not allowed:
        return jsonify({"claimed": False, "error": f"Rate limit exceeded. Please wait {retry_after} seconds."}), 429, {"Retry-After": str(retry_after)}
    today = utc_today()
    with get_quota_db() as conn:
        state = get_quota_state(client_key)
        if state["boostClaimed"]:
            return jsonify({"claimed": False, "error": "Daily boost already claimed.", "quota": state}), 409
        conn.execute("UPDATE ai_quotas SET boost_claimed_on = ? WHERE client_key = ?", (today, client_key))
    return jsonify({"claimed": True, "quota": get_quota_state(client_key)})


@app.route("/api/ai/subscription/initialize", methods=["POST"])
def initialize_ai_subscription():
    PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY")
    if not PAYSTACK_SECRET_KEY:
        return jsonify({"error": "Payment initialization is not configured."}), 500

    data = request.get_json(silent=True) or {}
    plan_id = str(data.get("planId", "")).strip()
    plan = AI_SUBSCRIPTION_PLANS.get(plan_id)
    if not plan:
        return jsonify({"error": "Invalid subscription plan."}), 400

    client_key = get_client_key()
    email = str(data.get("email") or "").strip().lower()
    if "@" not in email:
        email = f"{client_key.replace('@', '_')[:40]}@nakconel.local"

    try:
        response = requests.post(
            "https://api.paystack.co/transaction/initialize",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}", "Content-Type": "application/json"},
            json={
                "email": email,
                "amount": int(plan["amount"]) * 100,
                "currency": "NGN",
                "callback_url": request.host_url.rstrip("/") + "/ai-chat",
                "metadata": {
                    "client_key": client_key,
                    "plan_id": plan_id,
                    "plan_name": plan["name"],
                    "kind": "ai_subscription"
                }
            },
            timeout=15
        )
        payload = response.json()
    except Exception:
        return jsonify({"error": "Could not reach Paystack."}), 502

    data_payload = payload.get("data") or {}
    reference = data_payload.get("reference")
    authorization_url = data_payload.get("authorization_url")
    if not response.ok or payload.get("status") is not True or not reference or not authorization_url:
        return jsonify({"error": payload.get("message") or "Payment could not be initialized."}), 400

    now = datetime.now(timezone.utc).isoformat()
    with get_quota_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO ai_subscriptions
            (reference, client_key, email, plan_id, plan_name, amount, status, authorization_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            """,
            (reference, client_key, email, plan_id, plan["name"], int(plan["amount"]), authorization_url, now)
        )

    return jsonify({
        "reference": reference,
        "authorizationUrl": authorization_url,
        "plan": {"id": plan_id, **plan}
    })


@app.route("/api/ai/subscription/verify", methods=["POST"])
def verify_ai_subscription():
    data = request.get_json(silent=True) or {}
    reference = str(data.get("reference", "")).strip()
    if not reference:
        return jsonify({"verified": False, "error": "Missing payment reference."}), 400

    client_key = get_client_key()
    with get_quota_db() as conn:
        row = conn.execute(
            "SELECT * FROM ai_subscriptions WHERE reference = ? AND client_key = ?",
            (reference, client_key)
        ).fetchone()
    if not row:
        return jsonify({"verified": False, "error": "Subscription payment was not found."}), 404

    plan = AI_SUBSCRIPTION_PLANS.get(row["plan_id"])
    if not plan:
        return jsonify({"verified": False, "error": "Subscription plan is no longer available."}), 400

    payment, payment_status = verify_paystack_reference(reference, plan["amount"], "NGN")
    if payment_status != 200:
        return jsonify({"verified": False, **payment}), payment_status

    starts_at = datetime.now(timezone.utc)
    expires_at = starts_at + timedelta(days=int(plan["days"]))
    with get_quota_db() as conn:
        conn.execute(
            """
            UPDATE ai_subscriptions
            SET status = 'active', paid_at = ?, starts_at = ?, expires_at = ?
            WHERE reference = ? AND client_key = ?
            """,
            (payment["paidAt"], starts_at.isoformat(), expires_at.isoformat(), reference, client_key)
        )

    return jsonify({
        "verified": True,
        "reference": reference,
        "plan": {"id": row["plan_id"], "name": row["plan_name"], "expiresAt": expires_at.isoformat()},
        "quota": get_quota_state(client_key)
    })

@app.route("/")
@app.route("/home")
def home():
    return render_template("home.html")

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/meet-the-team")
def meet_the_team():
    return render_template("meet_the_team.html")

@app.route("/ai-chat")
def ai_chat():
    return render_template("ai-chat.html")

@app.route("/chat")
def team_chat():
    return render_template("team-chat.html", admin_team=ADMIN_TEAM)

@app.route("/campaign")
def campaign():
    return render_template("campaign.html")

@app.route("/nakconel-campaign.html")
def nakconel_campaign():
    return render_template("nakconel-campaign.html")

@app.route("/contact")
def contact():
    return render_template("contact.html")

@app.route("/voice")
def voice():
    return render_template("voice.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/register")
def register_page():
    return render_template("register.html")

@app.route("/account")
def account_page():
    return render_template("account.html")

@app.route("/admin")
def admin_page():
    return render_template("admin.html", admin_team=ADMIN_TEAM)

@app.route("/api/admin/me", methods=["GET"])
@require_admin
def admin_me():
    return jsonify({
        "admin": True,
        "user": request._user,
        "team": ADMIN_TEAM,
        "configuredAdmins": len(get_admin_emails())
    })

@app.route("/api/admin/summary", methods=["GET"])
@require_admin
def admin_summary():
    try:
        db = get_firestore_client()
        registrations = [doc.to_dict() for doc in db.collection("campaignRegistrations").stream()]
        users = [doc.to_dict() for doc in db.collection("users").stream()]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    total_revenue = 0
    package_counts = {}
    for item in registrations:
        package = item.get("package") or {}
        package_name = package.get("name") or "Unknown"
        package_counts[package_name] = package_counts.get(package_name, 0) + 1
        try:
            total_revenue += int(package.get("ngn") or 0)
        except (TypeError, ValueError):
            pass

    return jsonify({
        "campaignRegistrations": len(registrations),
        "registeredUsers": len(users),
        "totalRevenueNgn": total_revenue,
        "packageCounts": package_counts,
        "adminTeam": ADMIN_TEAM
    })


def json_safe(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    return value


def conversation_id_for(uid, team_member_id):
    cleaned_uid = re.sub(r"[^a-zA-Z0-9_\-]", "", str(uid or ""))[:80]
    cleaned_member = re.sub(r"[^a-zA-Z0-9_\-]", "", str(team_member_id or ""))[:80]
    return f"{cleaned_uid}__{cleaned_member}"


def get_chat_message_payload(data, max_len=1200):
    text = str((data or {}).get("text", "")).strip()
    return text[:max_len]


@app.route("/api/chat/team", methods=["GET"])
def chat_team():
    return jsonify({"team": ADMIN_TEAM})


@app.route("/api/chat/conversations", methods=["GET"])
@require_strict_auth
def visitor_conversations():
    user = request._user
    try:
        db = get_firestore_client()
        docs = db.collection("teamConversations").where("visitorId", "==", user["uid"]).stream()
        conversations = [json_safe({"id": doc.id, **doc.to_dict()}) for doc in docs]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    conversations.sort(key=lambda item: item.get("lastUpdated", ""), reverse=True)
    return jsonify({"conversations": conversations})


@app.route("/api/chat/conversations", methods=["POST"])
@require_strict_auth
def start_visitor_conversation():
    data = request.get_json(silent=True) or {}
    member_id = str(data.get("teamMemberId", "")).strip()
    member = get_team_member(member_id)
    if not member:
        return jsonify({"error": "Team member was not found."}), 404

    user = request._user
    conversation_id = conversation_id_for(user["uid"], member_id)
    visitor_name = str(data.get("visitorName") or user.get("email") or "Website visitor").strip()[:80]
    now = datetime.now(timezone.utc).isoformat()
    conversation = {
        "visitorId": user["uid"],
        "visitorEmail": user.get("email"),
        "visitorName": visitor_name,
        "teamMemberId": member["id"],
        "teamMemberName": member["name"],
        "teamMemberRole": member["role"],
        "status": "open",
        "lastMessage": "",
        "lastSender": "",
        "lastUpdated": now,
        "createdAt": now
    }

    try:
        db = get_firestore_client()
        doc_ref = db.collection("teamConversations").document(conversation_id)
        existing = doc_ref.get()
        if existing.exists:
            doc_ref.set({
                "visitorName": visitor_name,
                "visitorEmail": user.get("email"),
                "teamMemberName": member["name"],
                "teamMemberRole": member["role"],
                "lastUpdated": now
            }, merge=True)
            conversation = {"id": conversation_id, **existing.to_dict(), **conversation}
        else:
            doc_ref.set(conversation)
            conversation["id"] = conversation_id
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify({"conversation": json_safe(conversation)})


@app.route("/api/chat/conversations/<conversation_id>/messages", methods=["GET"])
@require_strict_auth
def visitor_messages(conversation_id):
    user = request._user
    try:
        db = get_firestore_client()
        conv = db.collection("teamConversations").document(conversation_id).get()
        if not conv.exists or conv.to_dict().get("visitorId") != user["uid"]:
            return jsonify({"error": "Conversation was not found."}), 404
        docs = db.collection("teamConversations").document(conversation_id).collection("messages").stream()
        messages = [json_safe({"id": doc.id, **doc.to_dict()}) for doc in docs]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    messages.sort(key=lambda item: item.get("time", ""))
    return jsonify({"messages": messages})


@app.route("/api/chat/conversations/<conversation_id>/messages", methods=["POST"])
@require_strict_auth
def visitor_send_message(conversation_id):
    user = request._user
    data = request.get_json(silent=True) or {}
    text = get_chat_message_payload(data)
    if not text:
        return jsonify({"error": "Message cannot be empty."}), 400

    now = datetime.now(timezone.utc).isoformat()
    try:
        db = get_firestore_client()
        conv_ref = db.collection("teamConversations").document(conversation_id)
        conv = conv_ref.get()
        if not conv.exists or conv.to_dict().get("visitorId") != user["uid"]:
            return jsonify({"error": "Conversation was not found."}), 404
        msg_ref = conv_ref.collection("messages").document()
        msg_ref.set({
            "sender": "visitor",
            "senderName": data.get("visitorName") or user.get("email") or "Website visitor",
            "text": text,
            "time": now
        })
        conv_ref.set({"lastMessage": text, "lastSender": "visitor", "lastUpdated": now, "status": "open"}, merge=True)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify({"sent": True, "message": {"id": msg_ref.id, "sender": "visitor", "text": text, "time": now}})


@app.route("/api/admin/chat/conversations", methods=["GET"])
@require_admin
def admin_chat_conversations():
    try:
        db = get_firestore_client()
        docs = db.collection("teamConversations").stream()
        conversations = [json_safe({"id": doc.id, **doc.to_dict()}) for doc in docs]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    conversations.sort(key=lambda item: item.get("lastUpdated", ""), reverse=True)
    return jsonify({"conversations": conversations})


@app.route("/api/admin/chat/conversations/<conversation_id>/messages", methods=["GET"])
@require_admin
def admin_chat_messages(conversation_id):
    try:
        db = get_firestore_client()
        conv = db.collection("teamConversations").document(conversation_id).get()
        if not conv.exists:
            return jsonify({"error": "Conversation was not found."}), 404
        docs = db.collection("teamConversations").document(conversation_id).collection("messages").stream()
        messages = [json_safe({"id": doc.id, **doc.to_dict()}) for doc in docs]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    messages.sort(key=lambda item: item.get("time", ""))
    return jsonify({"messages": messages, "conversation": json_safe({"id": conv.id, **conv.to_dict()})})


@app.route("/api/admin/chat/conversations/<conversation_id>/messages", methods=["POST"])
@require_admin
def admin_send_chat_message(conversation_id):
    data = request.get_json(silent=True) or {}
    text = get_chat_message_payload(data)
    if not text:
        return jsonify({"error": "Message cannot be empty."}), 400

    admin_user = request._user
    now = datetime.now(timezone.utc).isoformat()
    try:
        db = get_firestore_client()
        conv_ref = db.collection("teamConversations").document(conversation_id)
        conv = conv_ref.get()
        if not conv.exists:
            return jsonify({"error": "Conversation was not found."}), 404
        msg_ref = conv_ref.collection("messages").document()
        msg_ref.set({
            "sender": "team",
            "senderName": admin_user.get("email") or "Nakconel Team",
            "text": text,
            "time": now
        })
        conv_ref.set({"lastMessage": text, "lastSender": "team", "lastUpdated": now, "status": "open"}, merge=True)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify({"sent": True, "message": {"id": msg_ref.id, "sender": "team", "text": text, "time": now}})


@app.route("/api/admin/campaign-registrations", methods=["GET"])
@require_admin
def admin_campaign_registrations():
    try:
        db = get_firestore_client()
        docs = db.collection("campaignRegistrations").stream()
        registrations = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            registrations.append(json_safe(data))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    registrations.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return jsonify({"registrations": registrations})

@app.route("/api/admin/users", methods=["GET"])
@require_admin
def admin_users():
    try:
        db = get_firestore_client()
        docs = db.collection("users").stream()
        users = []
        for doc in docs:
            data = doc.to_dict()
            users.append({
                "uid": doc.id,
                "username": data.get("username"),
                "email": data.get("email"),
                "photoURL": data.get("photoURL"),
                "createdAt": json_safe(data.get("createdAt")),
                "updatedAt": json_safe(data.get("updatedAt"))
            })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    users.sort(key=lambda item: item.get("createdAt") or item.get("updatedAt") or "", reverse=True)
    return jsonify({"users": users})

def call_gemini_text(gemini_key, sys_prompt, messages):
    try:
        contents = []
        for m in messages:
            if m.get("content"):
                role = "model" if m.get("role") == "assistant" else "user"
                contents.append({"role": role, "parts": [{"text": m["content"]}]})
        if not contents:
            contents.append({"role": "user", "parts": [{"text": "Hello"}]})
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
        payload = {
            "system_instruction": {"parts": [{"text": sys_prompt}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.7}
        }
        r = requests.post(url, json=payload, timeout=20)
        if r.ok:
            d = r.json()
            return d.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
    except Exception as exc:
        print(f"Gemini call exception: {exc}")
    return None


@app.route("/api/chat", methods=["POST"])
@optional_auth
def chat():
    GROQ_KEY = os.environ.get("GROQ_API_KEY")
    GEMINI_KEY = os.environ.get("GEMINI_API_KEY")

    # Identify client (authenticated user gets higher rate limits)
    user = getattr(request, '_user', None)
    client_key = user.get('uid') if user else get_client_key()
    
    # Rate limiting: authenticated users get higher limits
    max_requests = 30 if user else 15
    allowed, retry_after = check_rate_limit(client_key, max_requests=max_requests, window_seconds=60)
    if not allowed:
        return jsonify({
            "error": f"Rate limit exceeded. Please wait {retry_after} seconds.",
            "reply": f"You are sending messages too quickly. Please wait {retry_after} seconds."
        }), 429, {"Retry-After": str(retry_after)}

    quota_ok, quota = consume_ai_message(client_key)
    if not quota_ok:
        return jsonify({
            "error": "Daily message limit reached.",
            "reply": "Daily message limit reached. Upgrade or wait for reset.",
            "quota": quota
        }), 429

    data = request.get_json(silent=True) or {}
    raw_messages = data.get("messages", [])
    if not isinstance(raw_messages, list):
        raw_messages = []

    messages = []
    for m in raw_messages[-20:]:
        if isinstance(m, dict) and "role" in m and "content" in m:
            messages.append({
                "role": "assistant" if m.get("role") == "assistant" else "user",
                "content": str(m.get("content", ""))[:2000]
            })

    user_name = str(data.get("userName", "there")).strip()[:50] or "there"
    has_image = bool(data.get("hasImage", False))
    image_data = data.get("imageData")
    image_type = str(data.get("imageType", "image/jpeg")).strip()[:50]
    raw_memory = data.get("memoryContext", [])
    memory_context = raw_memory[:10] if isinstance(raw_memory, list) else []

    memory_note = ""
    if memory_context:
        summary = "\n".join([f"{'User' if m.get('role')=='user' else 'You'}: {str(m.get('content',''))[:200]}" for m in memory_context if isinstance(m, dict)])
        memory_note = f"\n\nContext from earlier conversations:\n{summary}"

    sys_prompt = f"""You are Nakconel AI, the brand intelligence assistant for Nakconel — a brand management and AI strategy company. You speak with clarity, confidence, and cultural respect: strategic not vague, premium not distant, intelligent not complicated, global not generic, helpful not hype-driven.

Your job is to help people build stronger brands. You specialize in Nakconel's five pillars:
1. Brand Strategy — positioning, market clarity, audience intelligence, brand architecture, naming, messaging, growth planning.
2. Content & Design — visual identity direction, campaign concepts, social content systems, editorial/storytelling, design briefs.
3. IT & Technology — websites, client portals, workflow tools, automation, digital transformation guidance.
4. AI Enablement — AI adoption roadmaps, prompt systems, AI content workflows, brand intelligence dashboards.
5. Cultural Intelligence — market-aware branding for Africa, United States, Australia, and Gulf countries.

Only use code blocks for genuine programming help, not design mockups. User's name: {user_name}.{memory_note}"""

    # Image Vision Chat via Gemini
    if has_image and image_data and GEMINI_KEY:
        last_msg = messages[-1]["content"] if messages else "What is in this image?"
        contents = []
        for m in messages[:-1]:
            if m.get("content"):
                contents.append({"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]})
        contents.append({"role": "user", "parts": [{"inline_data": {"mime_type": image_type, "data": image_data}}, {"text": last_msg}]})
        for model in ["gemini-1.5-flash-8b", "gemini-1.5-flash"]:
            try:
                r = requests.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_KEY}",
                    json={"system_instruction": {"parts": [{"text": sys_prompt}]}, "contents": contents, "generationConfig": {"maxOutputTokens": 1000, "temperature": 0.7}},
                    timeout=20
                )
                d = r.json()
                if d.get("error", {}).get("code") == 429:
                    continue
                reply = d.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
                if reply:
                    return jsonify({"reply": reply, "model": "gemini-vision", "quota": quota})
            except Exception:
                continue
        return jsonify({"reply": "Image analysis is temporarily unavailable. Please try again.", "quota": quota})

    # Primary Text Chat via Groq
    if GROQ_KEY:
        try:
            r = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_KEY}"},
                json={"model": "llama-3.3-70b-versatile", "max_tokens": 1024, "messages": [{"role": "system", "content": sys_prompt}] + messages},
                timeout=20
            )
            if r.ok:
                d = r.json()
                reply = d.get("choices", [{}])[0].get("message", {}).get("content")
                if reply:
                    return jsonify({"reply": reply, "model": "groq", "quota": quota})
        except Exception as e:
            print(f"Groq API call error: {e}")

    # Fallback Text Chat via Gemini
    if GEMINI_KEY:
        gemini_reply = call_gemini_text(GEMINI_KEY, sys_prompt, messages)
        if gemini_reply:
            return jsonify({"reply": gemini_reply, "model": "gemini", "quota": quota})

    if not GROQ_KEY and not GEMINI_KEY:
        return jsonify({
            "reply": "AI service environment key is missing. Please add GROQ_API_KEY or GEMINI_API_KEY under Vercel Project Settings → Environment Variables.",
            "error": "Missing GROQ_API_KEY / GEMINI_API_KEY",
            "quota": quota
        }), 500

    return jsonify({
        "reply": "AI service is currently experiencing high demand. Please try again in a moment.",
        "quota": quota
    })


@app.route("/api/generate-image", methods=["POST"])
@optional_auth
def generate_image():
    POLLINATIONS_KEY = os.environ.get("POLLINATIONS_API_KEY")
    GROQ_KEY = os.environ.get("GROQ_API_KEY")
    if not POLLINATIONS_KEY:
        return jsonify({"error": "Image generation is not configured."})

    # Identify client (authenticated user gets higher rate limits)
    user = getattr(request, '_user', None)
    client_key = user.get('uid') if user else get_client_key()
    
    # Rate limiting: authenticated users get higher limits
    max_requests = 20 if user else 10
    allowed, retry_after = check_rate_limit(client_key, max_requests=max_requests, window_seconds=60)
    if not allowed:
        return jsonify({"error": f"Rate limit exceeded. Please wait {retry_after} seconds."}), 429, {"Retry-After": str(retry_after)}

    quota_ok, quota = consume_ai_message(client_key)
    if not quota_ok:
        return jsonify({"error": "Daily message limit reached.", "quota": quota}), 429

    data = request.get_json(silent=True) or {}
    prompt = str(data.get("prompt", "")).strip()[:500]
    if not prompt:
        return jsonify({"error": "Missing prompt"}), 400

    final_prompt = prompt
    if GROQ_KEY:
        try:
            r = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_KEY}"},
                json={"model": "llama-3.3-70b-versatile", "max_tokens": 120, "temperature": 0.8,
                      "messages": [
                          {"role": "system", "content": "You write vivid, detailed text-to-image prompts in 2-3 sentences max. Output ONLY the prompt text, nothing else. Keep it under 60 words."},
                          {"role": "user", "content": prompt}
                      ]}
            )
            expanded = r.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            if expanded:
                final_prompt = expanded[:600]
        except Exception:
            pass

    try:
        r = requests.post(
            "https://gen.pollinations.ai/v1/images/generations",
            headers={"Authorization": f"Bearer {POLLINATIONS_KEY}", "Content-Type": "application/json"},
            json={"model": "flux", "prompt": final_prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json"}
        )
        item = r.json().get("data", [{}])[0]
        if item.get("b64_json"):
            return jsonify({"image": f"data:image/jpeg;base64,{item['b64_json']}", "promptUsed": final_prompt, "quota": quota})
        return jsonify({"error": "No image returned — please try again."})
    except Exception as e:
        return jsonify({"error": "Connection error. Please try again."})


@app.route("/api/music", methods=["POST"])
@optional_auth
def generate_music():
    user = getattr(request, '_user', None)
    client_key = user.get('uid') if user else get_client_key()
    
    max_requests = 20 if user else 10
    allowed, retry_after = check_rate_limit(client_key, max_requests=max_requests, window_seconds=60)
    if not allowed:
        return jsonify({"error": f"Rate limit exceeded. Please wait {retry_after} seconds."}), 429, {"Retry-After": str(retry_after)}

    MUSIC_API_KEY = os.environ.get("MUSIC_API_KEY") or os.environ.get("REPLICATE_API_KEY") or os.environ.get("SUNO_API_KEY")
    quota_ok, quota = consume_ai_message(client_key)
    if not quota_ok:
        return jsonify({"error": "Daily message limit reached.", "quota": quota}), 429

    data = request.get_json(silent=True) or {}
    prompt = str(data.get("prompt", "")).strip()[:500]
    if not prompt:
        return jsonify({"error": "Missing music prompt.", "quota": quota}), 400

    if not MUSIC_API_KEY:
        return jsonify({
            "error": "AI Music Generation is currently in preview and requires a configured music API key.",
            "quota": quota
        }), 503

    return jsonify({
        "error": "Music generation provider connection pending. Please try again later.",
        "quota": quota
    }), 503


def verify_paystack_reference(reference, expected_amount, expected_currency="NGN"):
    PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY")
    if not PAYSTACK_SECRET_KEY:
        return {"verified": False, "error": "Payment verification is not configured."}, 500

    if not reference:
        return {"verified": False, "error": "Missing payment reference."}, 400

    try:
        expected_amount_kobo = int(expected_amount) * 100
    except (TypeError, ValueError):
        return {"verified": False, "error": "Invalid expected amount."}, 400

    try:
        response = requests.get(
            f"https://api.paystack.co/transaction/verify/{reference}",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"},
            timeout=15
        )
        payload = response.json()
    except Exception:
        return {"verified": False, "error": "Could not reach Paystack verification."}, 502

    transaction = payload.get("data") or {}
    verified = (
        response.ok
        and payload.get("status") is True
        and transaction.get("status") == "success"
        and transaction.get("currency") == expected_currency
        and int(transaction.get("amount") or 0) == expected_amount_kobo
    )

    if not verified:
        return {
            "verified": False,
            "error": "Payment could not be verified.",
            "paystackStatus": transaction.get("status")
        }, 400

    return {
        "verified": True,
        "reference": transaction.get("reference"),
        "amount": transaction.get("amount"),
        "currency": transaction.get("currency"),
        "paidAt": transaction.get("paid_at")
    }, 200


def get_firestore_client():
    global _firebase_admin_ready
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError as exc:
        raise RuntimeError("Firebase Admin SDK is not installed.") from exc

    if not _firebase_admin_ready:
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not service_account_json:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.")
        service_account_info = json.loads(service_account_json)
        cred = credentials.Certificate(service_account_info)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        _firebase_admin_ready = True

    return firestore.client()


@app.route("/api/paystack/verify", methods=["POST"])
def verify_paystack_payment():
    data = request.get_json(silent=True) or {}
    result, status_code = verify_paystack_reference(
        str(data.get("reference", "")).strip(),
        data.get("expectedAmount"),
        str(data.get("currency", "NGN")).upper()
    )
    return jsonify(result), status_code


@app.route("/api/campaign/register", methods=["POST"])
def register_campaign():
    data = request.get_json(silent=True) or {}
    required_fields = ["uid", "email", "questions", "package", "paymentReference"]
    missing_fields = [field for field in required_fields if not data.get(field)]
    if missing_fields:
        return jsonify({"saved": False, "error": f"Missing fields: {', '.join(missing_fields)}"}), 400

    questions = data.get("questions") or {}
    package = data.get("package") or {}
    if not all(str(questions.get(field, "")).strip() for field in ["fullName", "business", "challenge"]):
        return jsonify({"saved": False, "error": "Campaign questions are incomplete."}), 400

    if not package.get("name") or not package.get("ngn"):
        return jsonify({"saved": False, "error": "Package selection is incomplete."}), 400

    payment, payment_status = verify_paystack_reference(
        str(data.get("paymentReference", "")).strip(),
        package.get("ngn"),
        "NGN"
    )
    if payment_status != 200:
        return jsonify({"saved": False, **payment}), payment_status

    registration = {
        "uid": str(data["uid"]),
        "email": str(data["email"]).strip().lower(),
        "questions": {
            "fullName": str(questions["fullName"]).strip(),
            "business": str(questions["business"]).strip(),
            "challenge": str(questions["challenge"]).strip()
        },
        "package": {
            "name": str(package["name"]),
            "usd": package.get("usd"),
            "ngn": int(package["ngn"]),
            "time": package.get("time")
        },
        "payment": {
            "reference": payment["reference"],
            "amount": payment["amount"],
            "currency": payment["currency"],
            "paidAt": payment["paidAt"]
        },
        "createdAt": datetime.now(timezone.utc).isoformat()
    }

    try:
        db = get_firestore_client()
        doc_ref = db.collection("campaignRegistrations").document(payment["reference"])
        doc_ref.set(registration, merge=True)
    except Exception as exc:
        return jsonify({"saved": False, "error": str(exc)}), 500

    return jsonify({"saved": True, "reference": payment["reference"]})


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
