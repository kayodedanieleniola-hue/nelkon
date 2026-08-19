from flask import Flask, render_template, request, jsonify, session, send_from_directory, redirect
import json
import os
import requests
import sqlite3
import re
import urllib.parse
import time
from datetime import datetime, timezone, timedelta
from functools import wraps
from collections import defaultdict

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    load_dotenv = None

try:
    import firebase_admin
    from firebase_admin import credentials, firestore, auth as firebase_auth
    HAS_FIREBASE_ADMIN = True
except ImportError:
    firebase_admin = None
    credentials = None
    firestore = None
    firebase_auth = None
    HAS_FIREBASE_ADMIN = False

app = Flask(__name__)

@app.route("/favicon.ico")
def favicon():
    return send_from_directory(os.path.join(app.root_path, "static", "image"), "logo.png", mimetype="image/png")

app.secret_key = os.environ.get("SECRET_KEY", "your-secret-key-change-this-in-production")
app.config["SESSION_COOKIE_SECURE"] = (
    os.environ.get("SESSION_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
    or os.environ.get("VERCEL_ENV") == "production"
    or os.environ.get("FLASK_ENV") == "production"
    or os.environ.get("RENDER", "").lower() == "true"
)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)
app.config["SESSION_COOKIE_NAME"] = "nakconel_admin_session"

_firebase_admin_ready = False
_firebase_public_keys = None
_firebase_public_keys_fetched_at = 0
_RATE_LIMIT_STORE = defaultdict(list)
FREE_DAILY_MESSAGES = int(os.environ.get("AI_FREE_DAILY_MESSAGES", "40"))
DAILY_BOOST_MESSAGES = int(os.environ.get("AI_DAILY_BOOST_MESSAGES", "5"))
AI_QUOTA_DB_PATH = os.environ.get("AI_QUOTA_DB_PATH", os.path.join("/tmp", "nakconel_ai_quota.sqlite3"))
NGN_TO_USD_RATE = float(os.environ.get("NGN_TO_USD_RATE", "0.00065"))
_NGN_USD_RATE_CACHE = {"rate": NGN_TO_USD_RATE, "fetched_at": 0}
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

# Admin Portal Credentials (username: password)
ADMIN_CREDENTIALS = {
    "samuel-akinomolafe": "AdminPass1!Samuel",
    "oreoluwa-farodoye": "AdminPass2!Oreoluwa",
    "kayode-daniel": "AdminPass3!Kayode",
    "segun": "AdminPass4!Segun",
    "samuel-design": "AdminPass5!Samuel",
    "wonuola": "AdminPass6!Wonuola",
    "marcus-tetteh": "AdminPass7!Marcus",
}


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


def require_admin_session(f):
    """Decorator to require admin login via username/password session."""
    @wraps(f)
    def decorated(*args, **kwargs):
        admin_username = session.get("admin_username")
        if not admin_username:
            return jsonify({"error": "Admin login required"}), 401
        if admin_username not in ADMIN_CREDENTIALS:
            return jsonify({"error": "Invalid admin session"}), 403
        request._admin_username = admin_username
        # Get admin info from ADMIN_TEAM
        admin_info = None
        for member in ADMIN_TEAM:
            if member["id"] == admin_username:
                admin_info = member
                break
        request._admin_info = admin_info
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


def parse_firebase_service_account_info(raw_val):
    if not raw_val or not isinstance(raw_val, str):
        return None
    val = raw_val.strip()
    if (val.startswith("'") and val.endswith("'")) or (val.startswith('"') and val.endswith('"')):
        val = val[1:-1].strip()

    try:
        data = json.loads(val)
    except Exception:
        try:
            fixed = val.replace("\\n", "\n")
            data = json.loads(fixed)
        except Exception:
            return None

    if isinstance(data, dict):
        if "private_key" in data and isinstance(data["private_key"], str):
            data["private_key"] = data["private_key"].replace("\\n", "\n")
        return data
    return None


def initialize_firebase_admin():
    global _firebase_admin_ready
    if not HAS_FIREBASE_ADMIN:
        return False

    if not _firebase_admin_ready:
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not service_account_json:
            return False
        service_account_info = parse_firebase_service_account_info(service_account_json)
        if not service_account_info:
            return False
        try:
            cred = credentials.Certificate(service_account_info)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            _firebase_admin_ready = True
        except Exception as exc:
            print(f"Firebase initialize app warning: {exc}")
            return False

    return _firebase_admin_ready


def get_firebase_auth():
    if not HAS_FIREBASE_ADMIN:
        return None
    if not initialize_firebase_admin():
        return None
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
    conn.execute(
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
        """
    )
    conn.execute(
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
        """
    )
    return conn


def utc_today():
    return datetime.now(timezone.utc).date().isoformat()


def reset_at_iso():
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)
    return datetime.combine(tomorrow, datetime.min.time(), timezone.utc).isoformat()


def get_ngn_to_usd_rate():
    global _NGN_USD_RATE_CACHE
    now = time.time()
    if now - _NGN_USD_RATE_CACHE["fetched_at"] < 3600:
        return _NGN_USD_RATE_CACHE["rate"]
    try:
        resp = requests.get("https://api.exchangerate-api.com/v4/latest/NGN", timeout=10)
        if resp.ok:
            data = resp.json()
            rate = float(data.get("rates", {}).get("USD", NGN_TO_USD_RATE))
            _NGN_USD_RATE_CACHE = {"rate": rate, "fetched_at": now}
            return rate
    except Exception:
        pass
    return _NGN_USD_RATE_CACHE["rate"]


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
@app.route("/team-chat")
@app.route("/teamchat")
def team_chat():
    return render_template("team-chat.html", admin_team=ADMIN_TEAM)

@app.route("/campaign")
@app.route("/nakconel-campaign.html")
def campaign():
    return render_template("campaign.html")

@app.route("/campaign-form")
@app.route("/campaign-qualify")
def campaign_form():
    return render_template("campaign-form.html")

@app.route("/career")
@app.route("/career.html")
def career():
    return render_template("career.html")

@app.route("/training-registration")
@app.route("/training-registration.html")
def training_registration():
    return render_template("training-registration.html")

@app.route("/internship-application")
@app.route("/internship-application.html")
def internship_application():
    return render_template("internship-application.html")

@app.route("/payment")
@app.route("/payment.html")
def payment_page():
    paystack_public_key = os.environ.get("PAYSTACK_PUBLIC_KEY", "pk_live_eefc2236ca35e9b3d72ee382cba858121bb8edd8")
    return render_template("payment.html", paystack_public_key=paystack_public_key)

@app.route("/thank-you")
@app.route("/thank-you.html")
def thank_you_page():
    return render_template("thank-you.html")

@app.route("/templates/<path:filename>")
def serve_template_direct(filename):
    return render_template(filename)

@app.route("/api/register-training", methods=["POST"])
def register_training_api():
    data = request.get_json(silent=True) or request.form.to_dict() or {}
    name = str(data.get("fullName") or data.get("name") or "").strip()
    email = str(data.get("email") or "").strip().lower()
    phone = str(data.get("phone") or "").strip()
    course = str(data.get("course") or data.get("program") or "Brand Strategy & Positioning").strip()
    age = str(data.get("age") or "").strip()
    gender = str(data.get("gender") or "").strip()
    address = str(data.get("address") or "").strip()
    social = str(data.get("social") or "").strip()
    comments = str(data.get("comments") or data.get("statement") or "").strip()
    guardian_name = str(data.get("guardianName") or "").strip()
    guardian_phone = str(data.get("guardianPhone") or "").strip()

    if not name or not email or not phone:
        return jsonify({"success": False, "error": "Full Name, Email, and Phone Number are required."}), 400

    now = datetime.now(timezone.utc).isoformat()
    reg_id = f"TRN-{int(time.time()*1000)}"
    details_str = json.dumps({
        "age": age, "gender": gender, "address": address, "social": social,
        "comments": comments, "guardianName": guardian_name, "guardianPhone": guardian_phone
    })

    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                INSERT INTO career_registrations 
                (id, type, name, email, phone, program, experience_level, statement, details, amount, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (reg_id, "training", name, email, phone, course, "", comments, details_str, 250000, "pending_payment", now, now)
            )
    except Exception as exc:
        print(f"Error saving training registration: {exc}")
        return jsonify({"success": False, "error": f"Database error: {exc}"}), 500

    db = get_firestore_client()
    if db:
        try:
            db.collection("careerRegistrations").document(reg_id).set({
                "id": reg_id, "type": "training", "name": name, "email": email, "phone": phone,
                "program": course, "amount": 250000, "status": "pending_payment",
                "details": details_str, "createdAt": now, "updatedAt": now
            })
        except Exception as exc:
            print(f"Firestore save warning: {exc}")

    return jsonify({
        "success": True,
        "id": reg_id,
        "amount": 250000,
        "redirect_url": f"/payment.html?id={reg_id}&type=training"
    })

@app.route("/api/apply-internship", methods=["POST"])
def apply_internship_api():
    data = request.get_json(silent=True) or request.form.to_dict() or {}
    name = str(data.get("fullName") or data.get("name") or data.get("from_name") or "").strip()
    email = str(data.get("email") or data.get("from_email") or "").strip().lower()
    phone = str(data.get("phone") or "").strip()
    track = str(data.get("service") or data.get("track") or data.get("program") or "General Internship").strip()
    experience = str(data.get("exp_level") or data.get("experience_level") or data.get("status") or "").strip()
    commitment = str(data.get("commitment") or "").strip()
    raw_days = data.get("available_days") or ""
    if isinstance(raw_days, list):
        available_days = ", ".join([str(d) for d in raw_days if d])
    else:
        available_days = str(raw_days).strip()
    statement = str(data.get("statement") or data.get("reason") or data.get("motivation") or "").strip()
    portfolio = str(data.get("portfolio") or data.get("portfolio_link") or "").strip()
    found_us = str(data.get("found_us") or data.get("source") or "").strip()
    location = str(data.get("location") or "").strip()
    start_date = str(data.get("start_date") or "").strip()
    duration = str(data.get("duration") or "").strip()
    mode = str(data.get("mode") or "").strip()

    if not name or not email or not phone:
        return jsonify({"success": False, "error": "Full Name, Email, and Phone Number are required."}), 400

    now = datetime.now(timezone.utc).isoformat()
    reg_id = f"INT-{int(time.time()*1000)}"
    details_str = json.dumps({
        "commitment": commitment, "availableDays": available_days,
        "portfolio": portfolio, "foundUs": found_us,
        "location": location, "startDate": start_date, "duration": duration, "mode": mode
    })

    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                INSERT INTO career_registrations 
                (id, type, name, email, phone, program, experience_level, statement, details, amount, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (reg_id, "internship", name, email, phone, track, experience, statement, details_str, 250000, "pending_payment", now, now)
            )
    except Exception as exc:
        print(f"Error saving internship application: {exc}")
        return jsonify({"success": False, "error": f"Database error: {exc}"}), 500

    db = get_firestore_client()
    if db:
        try:
            db.collection("careerRegistrations").document(reg_id).set({
                "id": reg_id, "type": "internship", "name": name, "email": email, "phone": phone,
                "program": track, "amount": 250000, "status": "pending_payment",
                "experienceLevel": experience, "statement": statement,
                "details": details_str, "createdAt": now, "updatedAt": now
            })
        except Exception as exc:
            print(f"Firestore save warning: {exc}")

    return jsonify({
        "success": True,
        "id": reg_id,
        "amount": 250000,
        "redirect_url": f"/payment.html?id={reg_id}&type=internship"
    })

@app.route("/api/registration/<reg_id>", methods=["GET"])
def get_registration_api(reg_id):
    try:
        with get_quota_db() as conn:
            row = conn.execute("SELECT * FROM career_registrations WHERE id = ?", (reg_id,)).fetchone()
            if row:
                res = dict(row)
                if res.get("details"):
                    try:
                        res["detailsParsed"] = json.loads(res["details"])
                    except Exception:
                        pass
                return jsonify({"success": True, "registration": res})
    except Exception as exc:
        print(f"Error fetching registration: {exc}")

    return jsonify({
        "success": True,
        "registration": {
            "id": reg_id,
            "type": "training" if reg_id.startswith("TRN") else "internship",
            "name": "Applicant",
            "email": "applicant@nakconel.com",
            "phone": "+234 800 000 0000",
            "program": "Nakconel Professional Program",
            "amount": 250000,
            "status": "pending_payment",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    })


@app.route("/api/registration/<reg_id>/initialize-paystack", methods=["POST"])
def initialize_paystack_registration(reg_id):
    PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY")
    if not PAYSTACK_SECRET_KEY:
        return jsonify({"success": False, "error": "PAYSTACK_SECRET_KEY is not configured in environment."}), 500

    reg = None
    try:
        with get_quota_db() as conn:
            row = conn.execute("SELECT * FROM career_registrations WHERE id = ?", (reg_id,)).fetchone()
            if row:
                reg = dict(row)
    except Exception as exc:
        print(f"Error fetching registration for Paystack init: {exc}")

    if not reg:
        reg = {
            "id": reg_id,
            "name": "Applicant",
            "email": "applicant@nakconel.com",
            "amount": 250000,
            "program": "Career Program"
        }

    email = str(reg.get("email") or "applicant@nakconel.com").strip().lower()
    if "@" not in email:
        email = "applicant@nakconel.com"

    amount_val = float(reg.get("amount") or 250000)
    amount_kobo = round(amount_val * 100)

    callback_url = request.host_url.rstrip("/") + f"/api/paystack/callback?id={reg_id}"

    try:
        response = requests.post(
            "https://api.paystack.co/transaction/initialize",
            headers={
                "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "email": email,
                "amount": amount_kobo,
                "currency": "NGN",
                "callback_url": callback_url,
                "reference": f"PAY-{reg_id}-{int(time.time()*1000)}",
                "metadata": {
                    "registration_id": reg_id,
                    "applicant_name": reg.get("name"),
                    "program": reg.get("program")
                }
            },
            timeout=15
        )
        payload = response.json()
    except Exception as exc:
        return jsonify({"success": False, "error": f"Could not reach Paystack gateway: {exc}"}), 502

    data = payload.get("data") or {}
    authorization_url = data.get("authorization_url")
    reference = data.get("reference")

    if not response.ok or payload.get("status") is not True or not authorization_url:
        return jsonify({"success": False, "error": payload.get("message") or "Paystack initialization failed."}), 400

    now = datetime.now(timezone.utc).isoformat()
    try:
        with get_quota_db() as conn:
            conn.execute(
                "UPDATE career_registrations SET payment_reference = ?, updated_at = ? WHERE id = ?",
                (reference, now, reg_id)
            )
    except Exception as exc:
        print(f"Error saving Paystack reference: {exc}")

    return jsonify({
        "success": True,
        "authorization_url": authorization_url,
        "reference": reference
    })


@app.route("/api/paystack/callback", methods=["GET", "POST"])
def paystack_callback():
    reference = request.args.get("reference") or request.args.get("trxref") or (request.get_json(silent=True) or {}).get("reference")
    reg_id = request.args.get("id") or (request.get_json(silent=True) or {}).get("id")

    if not reference:
        return redirect("/thank-you.html?error=missing_reference")

    PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY")
    if not PAYSTACK_SECRET_KEY:
        return redirect(f"/thank-you.html?id={reg_id or ''}&status=pending")

    try:
        response = requests.get(
            f"https://api.paystack.co/transaction/verify/{reference}",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"},
            timeout=15
        )
        payload = response.json()
    except Exception as exc:
        print(f"Callback verification error: {exc}")
        return redirect(f"/thank-you.html?id={reg_id or ''}&reference={reference}")

    data = payload.get("data") or {}
    if payload.get("status") is True and data.get("status") == "success":
        meta = data.get("metadata") or {}
        if not reg_id:
            reg_id = meta.get("registration_id")

        now = datetime.now(timezone.utc).isoformat()
        if reg_id:
            try:
                with get_quota_db() as conn:
                    conn.execute(
                        """
                        UPDATE career_registrations 
                        SET status = 'paid', payment_reference = ?, paid_at = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (reference, now, now, reg_id)
                    )
            except Exception as exc:
                print(f"Error updating payment on callback: {exc}")

            db = get_firestore_client()
            if db:
                try:
                    db.collection("careerRegistrations").document(reg_id).set({
                        "status": "paid", "paymentReference": reference, "paidAt": now, "updatedAt": now
                    }, merge=True)
                except Exception as exc:
                    print(f"Firestore callback update warning: {exc}")

            return redirect(f"/thank-you.html?id={reg_id}&status=paid&reference={reference}")
        else:
            return redirect(f"/thank-you.html?status=paid&reference={reference}")

    return redirect(f"/payment.html?id={reg_id or ''}&error=payment_unverified")


@app.route("/api/registration/<reg_id>/complete-payment", methods=["POST"])
def complete_payment_api(reg_id):
    data = request.get_json(silent=True) or {}
    payment_method = str(data.get("paymentMethod") or "paystack").strip()
    reference = str(data.get("reference") or f"PAY-{int(time.time()*1000)}").strip()
    now = datetime.now(timezone.utc).isoformat()

    # Optional Paystack verification if reference provided
    if os.environ.get("PAYSTACK_SECRET_KEY") and reference and not reference.startswith("MANUAL-"):
        try:
            reg_amount = 250000
            with get_quota_db() as conn:
                r = conn.execute("SELECT amount FROM career_registrations WHERE id = ?", (reg_id,)).fetchone()
                if r and r["amount"]:
                    reg_amount = r["amount"]
            ver_res, ver_status = verify_paystack_reference(reference, reg_amount, "NGN")
            if ver_status != 200:
                print(f"Paystack warning for registration {reg_id}: {ver_res}")
        except Exception as exc:
            print(f"Paystack verification check exception: {exc}")

    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                UPDATE career_registrations 
                SET status = 'paid', payment_reference = ?, paid_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (reference, now, now, reg_id)
            )
    except Exception as exc:
        print(f"Error completing payment: {exc}")

    db = get_firestore_client()
    if db:
        try:
            db.collection("careerRegistrations").document(reg_id).set({
                "status": "paid", "paymentReference": reference, "paidAt": now, "updatedAt": now
            }, merge=True)
        except Exception as exc:
            print(f"Firestore update warning: {exc}")

    return jsonify({
        "success": True,
        "id": reg_id,
        "paymentReference": reference,
        "redirect_url": f"/thank-you.html?id={reg_id}"
    })

@app.route("/api/admin/career-registrations", methods=["GET"])
@require_admin_session
def admin_career_registrations():
    registrations = []
    total_paid_revenue = 0
    try:
        with get_quota_db() as conn:
            rows = conn.execute("SELECT * FROM career_registrations ORDER BY created_at DESC").fetchall()
            for row in rows:
                item = dict(row)
                if item.get("status") == "paid":
                    total_paid_revenue += int(item.get("amount") or 250000)
                registrations.append(item)
    except Exception as exc:
        print(f"Error loading career registrations: {exc}")

    return jsonify({
        "registrations": registrations,
        "total": len(registrations),
        "totalRevenueNgn": total_paid_revenue
    })

@app.route("/api/admin/career-registrations/<reg_id>/status", methods=["POST"])
@require_admin_session
def admin_update_career_status(reg_id):
    data = request.get_json(silent=True) or {}
    new_status = str(data.get("status", "")).strip().lower()
    if new_status not in ["pending_payment", "paid", "approved", "rejected"]:
        return jsonify({"error": "Invalid status value."}), 400

    now = datetime.now(timezone.utc).isoformat()
    try:
        with get_quota_db() as conn:
            conn.execute("UPDATE career_registrations SET status = ?, updated_at = ? WHERE id = ?", (new_status, now, reg_id))
    except Exception as exc:
        print(f"Error updating career status: {exc}")

    db = get_firestore_client()
    if db:
        try:
            db.collection("careerRegistrations").document(reg_id).set({"status": new_status, "updatedAt": now}, merge=True)
        except Exception as exc:
            print(f"Firestore status update warning: {exc}")

    return jsonify({"success": True, "id": reg_id, "status": new_status})



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

@app.route("/admin-login")
def admin_login_page():
    return render_template("admin-login.html")

@app.route("/admin")
def admin_page():
    return render_template("admin.html", admin_team=ADMIN_TEAM)

@app.route("/api/admin-login", methods=["POST"])
def api_admin_login():
    """Admin portal login with username/password."""
    try:
        data = request.get_json() or {}
        username = (data.get("username") or "").strip()
        password = (data.get("password") or "").strip()

        if not username or not password:
            return jsonify({"error": "Username and password required"}), 400

        # Check credentials
        if username not in ADMIN_CREDENTIALS or ADMIN_CREDENTIALS[username] != password:
            return jsonify({"error": "Invalid username or password"}), 401

        # Set admin session
        session.clear()
        session["admin_username"] = username
        session.permanent = True
        session.modified = True
        
        # Find admin info
        admin_info = None
        for member in ADMIN_TEAM:
            if member["id"] == username:
                admin_info = member
                break
        
        return jsonify({
            "success": True,
            "username": username,
            "name": admin_info.get("name") if admin_info else username,
            "message": "Login successful"
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/check-session", methods=["GET"])
def api_admin_check_session():
    """Check if admin is logged in via session."""
    admin_username = session.get("admin_username")
    if not admin_username:
        return jsonify({"loggedIn": False}), 401
    
    # Find admin info
    admin_info = None
    for member in ADMIN_TEAM:
        if member["id"] == admin_username:
            admin_info = member
            break
    
    return jsonify({
        "loggedIn": True,
        "username": admin_username,
        "name": admin_info.get("name") if admin_info else admin_username,
        "email": admin_info.get("email") if admin_info else None,
        "role": admin_info.get("role") if admin_info else None
    }), 200

@app.route("/api/admin/sign-out", methods=["POST"])
def api_admin_sign_out():
    """Sign out the admin user."""
    session.clear()
    return jsonify({"message": "Signed out successfully"}), 200

@app.route("/api/admin/me", methods=["GET"])
@require_admin_session
def admin_me():
    admin_info = request._admin_info or {}
    return jsonify({
        "admin": True,
        "username": request._admin_username,
        "name": admin_info.get("name"),
        "email": admin_info.get("email"),
        "role": admin_info.get("role"),
        "team": ADMIN_TEAM,
        "configuredAdmins": len(ADMIN_TEAM)
    })

@app.route("/api/admin/summary", methods=["GET"])
@require_admin_session
def admin_summary():
    registrations = []
    users = []
    strategy_calls = []
    error = None

    db = get_firestore_client()
    if db is not None:
        try:
            registrations = [doc.to_dict() for doc in db.collection("campaignRegistrations").stream()]
        except Exception as exc:
            error = f"campaignRegistrations: {exc}"

        try:
            users = [doc.to_dict() for doc in db.collection("users").stream()]
        except Exception as exc:
            error = f"{error}; users: {exc}" if error else f"users: {exc}"

        try:
            strategy_calls = [doc.to_dict() for doc in db.collection("strategyCalls").stream()]
        except Exception as exc:
            error = f"{error}; strategyCalls: {exc}" if error else f"strategyCalls: {exc}"
    else:
        error = "Firebase Firestore is unconfigured or offline (FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid)."
        # Fallback local strategy calls count
        try:
            with get_quota_db() as conn:
                count_row = conn.execute("SELECT COUNT(*) FROM strategy_calls").fetchone()
                if count_row:
                    strategy_calls = [1] * count_row[0]
        except Exception:
            pass

    total_revenue = 0
    pending_payments = 0
    paid_registrations = 0
    package_counts = {}
    for item in registrations:
        package = item.get("package") or {}
        package_name = package.get("name") or "Unknown"
        package_counts[package_name] = package_counts.get(package_name, 0) + 1
        if (item.get("status") or "").lower() == "pending_payment":
            pending_payments += 1
            continue
        paid_registrations += 1
        try:
            total_revenue += int(package.get("ngn") or 0)
        except (TypeError, ValueError):
            pass

    result = {
        "campaignRegistrations": len(registrations),
        "paidCampaignRegistrations": paid_registrations,
        "pendingCampaignPayments": pending_payments,
        "registeredUsers": len(users),
        "strategyCalls": len(strategy_calls),
        "totalRevenueNgn": total_revenue,
        "packageCounts": package_counts,
        "adminTeam": ADMIN_TEAM
    }
    if error:
        result["warning"] = error
    return jsonify(result)


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
    conversations = []
    try:
        db = get_firestore_client()
        if db:
            docs = db.collection("teamConversations").where("visitorId", "==", user["uid"]).stream()
            conversations = [json_safe({"id": doc.id, **doc.to_dict()}) for doc in docs]
    except Exception as exc:
        print(f"Visitor conversations warning: {exc}")

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

    db = get_firestore_client()
    if not db:
        return jsonify({"error": "Live chat service is temporarily unavailable."}), 503

    try:
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
    db = get_firestore_client()
    if not db:
        return jsonify({"messages": []})
    try:
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
    attachment = data.get("attachment")
    if not text and not attachment:
        return jsonify({"error": "Message text or attachment is required."}), 400

    now = datetime.now(timezone.utc).isoformat()
    last_msg = text if text else f"📎 {attachment.get('name', 'Attachment') if isinstance(attachment, dict) else 'Attachment'}"
    msg_data = {
        "sender": "visitor",
        "senderName": data.get("visitorName") or user.get("email") or "Website visitor",
        "text": text,
        "time": now
    }
    if attachment and isinstance(attachment, dict):
        msg_data["attachment"] = {
            "url": str(attachment.get("url") or ""),
            "name": str(attachment.get("name") or "File")[:100],
            "type": str(attachment.get("type") or "file")[:50],
            "size": attachment.get("size")
        }

    db = get_firestore_client()
    if not db:
        return jsonify({"error": "Live chat is temporarily offline."}), 503

    try:
        conv_ref = db.collection("teamConversations").document(conversation_id)
        conv = conv_ref.get()
        if not conv.exists or conv.to_dict().get("visitorId") != user["uid"]:
            return jsonify({"error": "Conversation was not found."}), 404
        msg_ref = conv_ref.collection("messages").document()
        msg_ref.set(msg_data)
        conv_ref.set({"lastMessage": last_msg, "lastSender": "visitor", "lastUpdated": now, "status": "open"}, merge=True)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify({"sent": True, "message": {"id": msg_ref.id, **msg_data}})


@app.route("/api/admin/chat/conversations", methods=["GET"])
@require_admin_session
def admin_chat_conversations():
    conversations = []
    try:
        db = get_firestore_client()
        if db:
            docs = db.collection("teamConversations").stream()
            conversations = [json_safe({"id": doc.id, **doc.to_dict()}) for doc in docs]
    except Exception as exc:
        print(f"Admin chat conversations warning: {exc}")

    conversations.sort(key=lambda item: item.get("lastUpdated", ""), reverse=True)
    return jsonify({"conversations": conversations})


@app.route("/api/admin/chat/conversations/<conversation_id>/messages", methods=["GET"])
@require_admin_session
def admin_chat_messages(conversation_id):
    db = get_firestore_client()
    if not db:
        return jsonify({"messages": [], "conversation": None, "warning": "Firebase Firestore is unconfigured."})
    try:
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
@require_admin_session
def admin_send_chat_message(conversation_id):
    data = request.get_json(silent=True) or {}
    text = get_chat_message_payload(data)
    attachment = data.get("attachment")
    if not text and not attachment:
        return jsonify({"error": "Message text or attachment is required."}), 400

    admin_info = request._admin_info or {}
    admin_name = admin_info.get("name") or admin_info.get("email") or request._admin_username or "Nakconel Team"
    now = datetime.now(timezone.utc).isoformat()
    last_msg = text if text else f"📎 {attachment.get('name', 'Attachment') if isinstance(attachment, dict) else 'Attachment'}"
    msg_data = {
        "sender": "team",
        "senderName": admin_name,
        "text": text,
        "time": now
    }
    if attachment and isinstance(attachment, dict):
        msg_data["attachment"] = {
            "url": str(attachment.get("url") or ""),
            "name": str(attachment.get("name") or "File")[:100],
            "type": str(attachment.get("type") or "file")[:50],
            "size": attachment.get("size")
        }

    db = get_firestore_client()
    if not db:
        return jsonify({"error": "Firebase Firestore is unconfigured."}), 503

    try:
        conv_ref = db.collection("teamConversations").document(conversation_id)
        conv = conv_ref.get()
        if not conv.exists:
            return jsonify({"error": "Conversation was not found."}), 404
        msg_ref = conv_ref.collection("messages").document()
        msg_ref.set(msg_data)
        conv_ref.set({"lastMessage": last_msg, "lastSender": "team", "lastUpdated": now, "status": "open"}, merge=True)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify({"sent": True, "message": {"id": msg_ref.id, **msg_data}})


@app.route("/api/admin/campaign-registrations", methods=["GET"])
@require_admin_session
def admin_campaign_registrations():
    registrations = []
    warning = None
    try:
        db = get_firestore_client()
        if db:
            docs = db.collection("campaignRegistrations").stream()
            for doc in docs:
                data = doc.to_dict()
                data["id"] = doc.id
                registrations.append(json_safe(data))
        else:
            warning = "Firebase Firestore is unconfigured or offline (FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid)."
    except Exception as exc:
        print(f"Failed to load campaign registrations: {exc}")
        warning = f"Failed to load campaign registrations: {exc}"

    registrations.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    res = {"registrations": registrations}
    if warning:
        res["warning"] = warning
    return jsonify(res)


@app.route("/api/admin/users", methods=["GET"])
@require_admin_session
def admin_users():
    users = []
    warning = None
    try:
        db = get_firestore_client()
        if db:
            docs = db.collection("users").stream()
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
        else:
            warning = "Firebase Firestore is unconfigured or offline (FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid)."
    except Exception as exc:
        print(f"Failed to load users: {exc}")
        warning = f"Failed to load users: {exc}"

    users.sort(key=lambda item: item.get("createdAt") or item.get("updatedAt") or "", reverse=True)
    res = {"users": users}
    if warning:
        res["warning"] = warning
    return jsonify(res)

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
    pollinations_key = os.environ.get("POLLINATIONS_API_KEY") or POLLINATIONS_KEY
    groq_key = os.environ.get("GROQ_API_KEY") or GROQ_KEY

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
    if groq_key:
        try:
            r = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {groq_key}"},
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
        if pollinations_key:
            r = requests.post(
                "https://gen.pollinations.ai/v1/images/generations",
                headers={"Authorization": f"Bearer {pollinations_key}", "Content-Type": "application/json"},
                json={"model": "flux", "prompt": final_prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json"},
                timeout=30
            )
            item = r.json().get("data", [{}])[0]
            if item.get("b64_json"):
                return jsonify({"image": f"data:image/jpeg;base64,{item['b64_json']}", "promptUsed": final_prompt, "quota": quota})
        
        # Fallback to public Pollinations URL
        encoded_prompt = urllib.parse.quote(final_prompt)
        image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?model=flux&width=1024&height=1024&nologo=true"
        return jsonify({"image": image_url, "promptUsed": final_prompt, "quota": quota})
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
        expected_amount_kobo = round(float(expected_amount) * 100)
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
        and str(transaction.get("currency", "")).upper() == str(expected_currency).upper()
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
    if not HAS_FIREBASE_ADMIN:
        return None
    if not initialize_firebase_admin():
        return None
    try:
        return firestore.client()
    except Exception as exc:
        print(f"Firestore client initialization warning: {exc}")
        return None


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

    if not package.get("name") or not (package.get("amount") or package.get("usd") or package.get("ngn")):
        return jsonify({"saved": False, "error": "Package selection is incomplete."}), 400

    campaign_packages = {
        "Brand AI Discovery Session": {"amount": 20, "currency": "USD", "ngn": 32000, "usd": 20},
        "Brand Evolution Session": {"amount": 60, "currency": "USD", "ngn": 96000, "usd": 60},
        "Premium Brand Transformation": {"amount": 250, "currency": "USD", "ngn": 400000, "usd": 250},
    }
    selected_package = campaign_packages.get(str(package["name"]))
    if not selected_package:
        return jsonify({"saved": False, "error": "Unknown campaign package."}), 400

    package_currency = selected_package["currency"]
    package_amount = selected_package["amount"]
    payment, payment_status = verify_paystack_reference(
        str(data.get("paymentReference", "")).strip(),
        package_amount,
        package_currency
    )
    if payment_status != 200:
        return jsonify({"saved": False, **payment}), payment_status

    pending_id = str(data.get("pendingRegistrationId", "")).strip()
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
            "amount": float(package_amount),
            "currency": package_currency,
            "ngn": selected_package["ngn"],
            "usd": selected_package["usd"],
            "time": package.get("time")
        },
        "payment": {
            "reference": payment["reference"],
            "amount": payment["amount"],
            "currency": payment["currency"],
            "paidAt": payment["paidAt"]
        },
        "status": "paid",
        "createdAt": datetime.now(timezone.utc).isoformat()
    }

    try:
        db = get_firestore_client()
        doc_ref = db.collection("campaignRegistrations").document(pending_id or payment["reference"])
        doc_ref.set(registration, merge=True)
    except Exception as exc:
        return jsonify({"saved": False, "error": str(exc)}), 500

    return jsonify({"saved": True, "reference": payment["reference"]})


@app.route("/api/campaign/pending", methods=["POST"])
def save_pending_campaign():
    data = request.get_json(silent=True) or {}
    required_fields = ["uid", "email", "questions"]
    missing_fields = [field for field in required_fields if not data.get(field)]
    if missing_fields:
        return jsonify({"saved": False, "error": f"Missing fields: {', '.join(missing_fields)}"}), 400

    questions = data.get("questions") or {}
    if not all(str(questions.get(field, "")).strip() for field in ["fullName", "business", "challenge"]):
        return jsonify({"saved": False, "error": "Campaign questions are incomplete."}), 400

    now = datetime.now(timezone.utc).isoformat()
    doc_id = f"pending-{str(data['uid']).strip()}"
    registration = {
        "uid": str(data["uid"]),
        "email": str(data["email"]).strip().lower(),
        "questions": {
            "fullName": str(questions["fullName"]).strip(),
            "business": str(questions["business"]).strip(),
            "challenge": str(questions["challenge"]).strip()
        },
        "status": "pending_payment",
        "payment": {
            "reference": None,
            "amount": 0,
            "currency": None,
            "paidAt": None
        },
        "updatedAt": now
    }
    package = data.get("package") or {}
    if package.get("name"):
        campaign_packages = {
            "Brand AI Discovery Session": {"amount": 20, "currency": "USD", "ngn": 32000, "usd": 20},
            "Brand Evolution Session": {"amount": 60, "currency": "USD", "ngn": 96000, "usd": 60},
            "Premium Brand Transformation": {"amount": 250, "currency": "USD", "ngn": 400000, "usd": 250},
        }
        selected_package = campaign_packages.get(str(package["name"]))
        if selected_package:
            registration["package"] = {
                "name": str(package["name"]),
                "amount": selected_package["amount"],
                "currency": selected_package["currency"],
                "ngn": selected_package["ngn"],
                "usd": selected_package["usd"],
                "time": package.get("time")
            }

    try:
        db = get_firestore_client()
        doc_ref = db.collection("campaignRegistrations").document(doc_id)
        existing = doc_ref.get()
        if existing.exists:
            existing_data = existing.to_dict() or {}
            if (existing_data.get("status") or "").lower() == "paid":
                return jsonify({"saved": True, "id": doc_id, "status": "paid"})
        else:
            registration["createdAt"] = now
        doc_ref.set(registration, merge=True)
    except Exception as exc:
        return jsonify({"saved": False, "error": str(exc)}), 500

    return jsonify({"saved": True, "id": doc_id, "status": "pending_payment"})


@app.route("/api/strategy-call", methods=["POST"])
def submit_strategy_call():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or data.get("from_name") or "").strip()
    email = str(data.get("email") or data.get("from_email") or "").strip().lower()
    message = str(data.get("message") or data.get("usrMsg") or "").strip()
    phone = str(data.get("phone") or "").strip()

    if not name or not email or not message:
        return jsonify({"saved": False, "error": "Name, email, and operational focus/message are required."}), 400

    now = datetime.now(timezone.utc).isoformat()
    doc_id = f"CALL-{int(time.time()*1000)}"
    entry = {
        "id": doc_id,
        "name": name[:100],
        "email": email[:120],
        "phone": phone[:50],
        "message": message[:2000],
        "status": "new",
        "createdAt": now
    }

    # Always persist locally to SQLite
    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO strategy_calls (id, name, email, phone, message, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (doc_id, entry["name"], entry["email"], entry["phone"], entry["message"], entry["status"], now)
            )
    except Exception as exc:
        print(f"Strategy call SQLite save warning: {exc}")

    # Also persist to Firestore if available
    db = get_firestore_client()
    if db:
        try:
            db.collection("strategyCalls").document(doc_id).set(entry)
        except Exception as exc:
            print(f"Strategy call Firestore save warning: {exc}")

    return jsonify({"saved": True, "id": doc_id, "message": "Strategy call request submitted successfully!"})


@app.route("/api/admin/strategy-calls", methods=["GET"])
@require_admin_session
def admin_strategy_calls():
    calls = []
    db = get_firestore_client()
    if db:
        try:
            docs = db.collection("strategyCalls").stream()
            calls = [json_safe({"id": doc.id, **doc.to_dict()}) for doc in docs]
        except Exception as exc:
            print(f"Admin strategy calls Firestore fetch warning: {exc}")

    if not calls:
        # Fallback to local SQLite strategy calls
        try:
            with get_quota_db() as conn:
                rows = conn.execute("SELECT * FROM strategy_calls ORDER BY created_at DESC").fetchall()
                for row in rows:
                    r = dict(row)
                    calls.append({
                        "id": r["id"],
                        "name": r["name"],
                        "email": r["email"],
                        "phone": r["phone"],
                        "message": r["message"],
                        "status": r["status"],
                        "createdAt": r["created_at"]
                    })
        except Exception as exc:
            print(f"Admin strategy calls SQLite fetch warning: {exc}")

    calls.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return jsonify({"strategyCalls": calls})


@app.route("/api/admin/strategy-calls/<call_id>/status", methods=["POST"])
@require_admin_session
def admin_update_strategy_call_status(call_id):
    data = request.get_json(silent=True) or {}
    new_status = str(data.get("status", "")).strip().lower()
    if new_status not in ["new", "contacted", "completed"]:
        return jsonify({"error": "Invalid status value."}), 400

    now = datetime.now(timezone.utc).isoformat()

    # Update SQLite
    try:
        with get_quota_db() as conn:
            conn.execute("UPDATE strategy_calls SET status = ?, updated_at = ? WHERE id = ?", (new_status, now, call_id))
    except Exception as exc:
        print(f"Update call status SQLite warning: {exc}")

    # Update Firestore if available
    db = get_firestore_client()
    if db:
        try:
            doc_ref = db.collection("strategyCalls").document(call_id)
            doc_ref.set({"status": new_status, "updatedAt": now}, merge=True)
        except Exception as exc:
            print(f"Update call status Firestore warning: {exc}")

    return jsonify({"success": True, "id": call_id, "status": new_status})


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
