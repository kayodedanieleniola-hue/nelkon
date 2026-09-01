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
import base64
import jwt
import uuid
from cryptography import x509

try:
    import psycopg
    from psycopg.rows import dict_row
    HAS_POSTGRES = True
except ImportError:
    psycopg = None
    dict_row = None
    HAS_POSTGRES = False

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


@app.teardown_request
def log_unhandled_request_error(error):
    """Write unexpected server failures to Vercel Function Logs without request data."""
    if error is not None:
        app.logger.exception("[NAKCONEL] Unhandled server error during %s %s", request.method, request.path)

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
IS_VERCEL_DEPLOYMENT = bool(os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV"))
NGN_TO_USD_RATE = float(os.environ.get("NGN_TO_USD_RATE", "0.00065"))
_NGN_USD_RATE_CACHE = {"rate": NGN_TO_USD_RATE, "fetched_at": 0}
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
_database_schema_ready = False
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
    {"id": "oluwasegun", "email": "oluwasegun@nakconel.com", "name": "Oluwasegun", "role": "Content Designer"},
    {"id": "samuel-design", "email": "samuel.d@nakconel.com", "name": "Samuel", "role": "Content and Graphics Designer"},
    {"id": "akinwonuola", "email": "akinwonuola@nakconel.com", "name": "Akinwonuola", "role": "Intern-Content Design"},
    {"id": "marcus-tetteh", "email": "marcus@nakconel.com", "name": "Marcus Tetteh", "role": "DevOps Specialist"},
]

# Admin Portal Credentials (username: password)
ADMIN_CREDENTIALS = {
    "samuel-akinomolafe": "AdminPass1!Samuel",
    "oreoluwa-farodoye": "AdminPass2!Oreoluwa",
    "kayode-daniel": "AdminPass3!Kayode",
    "oluwasegun": "AdminPass4!Segun",
    "samuel-design": "AdminPass5!Samuel",
    "akinwonuola": "AdminPass6!Wonuola",
    "marcus-tetteh": "AdminPass7!Marcus",
}


def get_admin_account(username):
    if not username:
        return None
    username_clean = str(username).strip().lower()
    try:
        with get_quota_db() as conn:
            row = conn.execute("SELECT * FROM admin_accounts WHERE LOWER(username) = ?", (username_clean,)).fetchone()
            if row:
                return dict(row)
    except Exception as exc:
        print(f"Error fetching admin account from DB: {exc}")

    for member in ADMIN_TEAM:
        if member["id"].lower() == username_clean:
            role_level = "master" if username_clean == "samuel-akinomolafe" else "restricted"
            return {
                "username": member["id"],
                "password": ADMIN_CREDENTIALS.get(member["id"], ""),
                "name": member["name"],
                "email": member["email"],
                "role": member["role"],
                "role_level": role_level,
                "is_active": 1,
                "is_restricted": 1 if role_level == "restricted" else 0,
            }
    return None


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
    account = get_admin_account(member_id)
    if account:
        return {
            "id": account["username"],
            "name": account["name"],
            "email": account["email"],
            "role": account["role"],
            "role_level": account.get("role_level", "restricted")
        }
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

        admin_acc = get_admin_account(admin_username)
        if not admin_acc:
            return jsonify({"error": "Invalid admin session"}), 403

        if admin_acc.get("is_active") == 0:
            return jsonify({"error": "This admin account has been deactivated by Master Admin."}), 403

        request._admin_username = admin_acc["username"]
        request._admin_info = admin_acc
        request._is_master = (admin_acc.get("role_level") == "master")
        request._is_restricted = bool(admin_acc.get("is_restricted"))
        return f(*args, **kwargs)
    return decorated


def require_master_admin(f):
    """Decorator to require Master Admin access for sensitive operations."""
    @wraps(f)
    def decorated(*args, **kwargs):
        admin_username = session.get("admin_username")
        if not admin_username:
            return jsonify({"error": "Admin login required"}), 401

        admin_acc = get_admin_account(admin_username)
        if not admin_acc or admin_acc.get("is_active") == 0:
            return jsonify({"error": "Invalid admin session"}), 403

        if admin_acc.get("role_level") != "master":
            return jsonify({"error": "Master Admin access required to view registrations or manage admins."}), 403

        request._admin_username = admin_acc["username"]
        request._admin_info = admin_acc
        request._is_master = True
        request._is_restricted = False
        return f(*args, **kwargs)
    return decorated


def log_user_activity(uid, activity_type, description, ip_address=None):
    """Record user activity for monitoring suspicious or normal behavior."""
    if not uid:
        return
    now = datetime.now(timezone.utc).isoformat()
    act_id = f"ACT-{uuid.uuid4().hex[:12]}"
    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                INSERT INTO user_activities (id, uid, activity_type, description, ip_address, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (act_id, str(uid), str(activity_type), str(description), ip_address or get_client_key(), now)
            )
    except Exception as exc:
        print(f"Error logging user activity: {exc}")


def check_user_deactivation(uid):
    """Check if a registered user's account is currently deactivated."""
    if not uid:
        return True, None
    try:
        with get_quota_db() as conn:
            row = conn.execute("SELECT is_deactivated, deactivated_until, deactivation_reason FROM website_users WHERE uid = ?", (str(uid),)).fetchone()
            if row and row["is_deactivated"] == 1:
                until = row["deactivated_until"]
                now_str = datetime.now(timezone.utc).isoformat()
                if until and now_str > until:
                    # Deactivation duration expired: auto-reactivate!
                    conn.execute("UPDATE website_users SET is_deactivated = 0, deactivated_until = NULL WHERE uid = ?", (str(uid),))
                    return True, None
                reason = row["deactivation_reason"] or "Suspicious or administrative deactivation"
                until_fmt = until[:10] if until else "indefinitely"
                return False, f"Your account has been deactivated until {until_fmt}. Reason: {reason}"
    except Exception as exc:
        print(f"Error checking user deactivation: {exc}")
    return True, None


def require_shared_database(f):
    """Prevent Vercel from accepting submissions into instance-local storage."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if IS_VERCEL_DEPLOYMENT and not DATABASE_URL:
            return jsonify({"error": "Shared database is not configured. Add DATABASE_URL in Vercel and redeploy."}), 503
        try:
            with get_quota_db() as conn:
                conn.execute("SELECT 1")
        except Exception:
            return jsonify({"error": "Shared database is unavailable. Check DATABASE_URL and the deployment logs."}), 503
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
        firebase_auth_client = get_firebase_auth()
        if not firebase_auth_client:
            raise RuntimeError("Firebase Admin is not configured")
        decoded = firebase_auth_client.verify_id_token(id_token)
        return {"uid": decoded.get("uid"), "email": decoded.get("email")}
    except Exception:
        # Firebase Authentication can still be verified without a Firestore
        # service-account key. This keeps existing Google/email sign-in working
        # after the data layer moves to Neon.
        try:
            header = jwt.get_unverified_header(id_token)
            certificate = (get_firebase_public_keys() or {}).get(header.get("kid"))
            project_id = os.environ.get("FIREBASE_PROJECT_ID", "nakconel-3dfaa")
            if not certificate:
                return None
            public_key = x509.load_pem_x509_certificate(certificate.encode("utf-8")).public_key()
            decoded = jwt.decode(
                id_token,
                public_key,
                algorithms=["RS256"],
                audience=project_id,
                issuer=f"https://securetoken.google.com/{project_id}",
            )
            return {"uid": decoded.get("user_id") or decoded.get("sub"), "email": decoded.get("email")}
        except Exception:
            return None


def parse_firebase_service_account_info(raw_val):
    if not raw_val or not isinstance(raw_val, str):
        return None
    val = raw_val.strip()
    if (val.startswith("'") and val.endswith("'")) or (val.startswith('"') and val.endswith('"')):
        val = val[1:-1].strip()

    if os.path.exists(val):
        try:
            with open(val, "r", encoding="utf-8") as f:
                val = f.read().strip()
        except Exception:
            pass

    data = None
    try:
        data = json.loads(val)
    except Exception:
        try:
            fixed = val.replace("\\n", "\n")
            data = json.loads(fixed)
        except Exception:
            try:
                decoded = base64.b64decode(val).decode("utf-8")
                data = json.loads(decoded)
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
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON") or os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH")
        if not service_account_json:
            for potential_filename in ["firebase-service-account.json", "firebase-key.json", "service-account.json"]:
                full_p = os.path.join(app.root_path, potential_filename)
                if os.path.exists(full_p):
                    service_account_json = full_p
                    break

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
        
        is_ok, deact_msg = check_user_deactivation(user.get("uid"))
        if not is_ok:
            return jsonify({"error": "Account Deactivated", "reply": deact_msg}), 403

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


def convert_sqlite_to_pg_sql(sql):
    """Translate the SQLite-style placeholders used by this app for psycopg.

    psycopg performs parameter binding with ``%s`` placeholders. PostgreSQL
    itself supports ``$1`` placeholders, but passing those to psycopg with a
    parameter tuple causes a runtime ProgrammingError, which previously made
    public registration submissions fail with HTTP 500 on Vercel.
    """
    if "?" not in sql:
        return sql
    return sql.replace("?", "%s")


class PostgresConnection:
    """Compatibility wrapper for existing parameterized SQLite-style queries."""
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=None):
        if sql.strip().upper() == "BEGIN IMMEDIATE":
            return self.conn.execute("SELECT 1")
        pg_sql = convert_sqlite_to_pg_sql(sql)
        if params is not None and len(params) > 0:
            return self.conn.execute(pg_sql, params)
        return self.conn.execute(pg_sql)

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            self.conn.rollback() if exc_type else self.conn.commit()
        finally:
            self.conn.close()


MASTER_ADMIN_USERNAMES = {"samuel-akinomolafe", "oreoluwa-farodoye", "kayode-daniel"}


def seed_default_admins(conn):
    """Seed initial admin accounts into admin_accounts table if empty, and ensure master admins are elevated."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        for member in ADMIN_TEAM:
            uname = member["id"]
            row = conn.execute("SELECT username FROM admin_accounts WHERE LOWER(username) = ?", (uname.lower(),)).fetchone()
            role_level = "master" if uname.lower() in MASTER_ADMIN_USERNAMES else "restricted"
            is_restricted = 0 if role_level == "master" else 1

            if not row:
                pwd = ADMIN_CREDENTIALS.get(uname, "AdminPass123!")
                conn.execute(
                    """
                    INSERT INTO admin_accounts (username, password, name, email, role, role_level, is_active, is_restricted, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                    """,
                    (uname, pwd, member["name"], member["email"], member["role"], role_level, is_restricted, now, now)
                )
            elif uname.lower() in MASTER_ADMIN_USERNAMES:
                # Ensure specified master admins have master access level in existing databases
                conn.execute(
                    "UPDATE admin_accounts SET role_level = 'master', is_restricted = 0, updated_at = ? WHERE LOWER(username) = ?",
                    (now, uname.lower())
                )
        conn.commit()
    except Exception as exc:
        try:
            conn.rollback()
        except Exception:
            pass
        print(f"Seed default admins warning: {exc}")


def initialize_postgres_schema(conn):
    """Create the shared Neon schema on each new serverless instance."""
    global _database_schema_ready
    if _database_schema_ready:
        return
    statements = [
        "CREATE TABLE IF NOT EXISTS ai_quotas (client_key TEXT PRIMARY KEY, period_start TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, boost_claimed_on TEXT)",
        "CREATE TABLE IF NOT EXISTS ai_subscriptions (reference TEXT PRIMARY KEY, client_key TEXT NOT NULL, email TEXT NOT NULL, plan_id TEXT NOT NULL, plan_name TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, authorization_url TEXT, paid_at TEXT, starts_at TEXT, expires_at TEXT, created_at TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS strategy_calls (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL, updated_at TEXT)",
        "CREATE TABLE IF NOT EXISTS career_registrations (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, program TEXT NOT NULL, experience_level TEXT, statement TEXT, details TEXT, amount INTEGER NOT NULL DEFAULT 250000, status TEXT NOT NULL DEFAULT 'pending_payment', payment_reference TEXT, paid_at TEXT, created_at TEXT NOT NULL, updated_at TEXT)",
        "CREATE TABLE IF NOT EXISTS campaign_registrations (id TEXT PRIMARY KEY, uid TEXT NOT NULL, email TEXT NOT NULL, full_name TEXT, business TEXT, challenge TEXT, package_name TEXT, amount DOUBLE PRECISION, currency TEXT, status TEXT NOT NULL DEFAULT 'pending_payment', payment_reference TEXT, created_at TEXT NOT NULL, raw_json TEXT)",
        "CREATE TABLE IF NOT EXISTS website_users (uid TEXT PRIMARY KEY, email TEXT, username TEXT, photo_url TEXT, email_verified INTEGER NOT NULL DEFAULT 0, is_deactivated INTEGER NOT NULL DEFAULT 0, deactivated_until TEXT, deactivation_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS admin_accounts (username TEXT PRIMARY KEY, password TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, role_level TEXT NOT NULL DEFAULT 'restricted', is_active INTEGER NOT NULL DEFAULT 1, is_restricted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS user_activities (id TEXT PRIMARY KEY, uid TEXT NOT NULL, activity_type TEXT NOT NULL, description TEXT NOT NULL, ip_address TEXT, created_at TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS admin_portal_sessions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, username TEXT NOT NULL, created_at TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS team_conversations (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, visitor_email TEXT, visitor_name TEXT, team_member_id TEXT NOT NULL, team_member_name TEXT, team_member_role TEXT, status TEXT NOT NULL DEFAULT 'open', last_message TEXT, last_sender TEXT, last_updated TEXT NOT NULL, created_at TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS team_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES team_conversations(id) ON DELETE CASCADE, sender TEXT NOT NULL, sender_name TEXT, text TEXT, attachment_json TEXT, time TEXT NOT NULL)",
        "CREATE INDEX IF NOT EXISTS team_conversations_visitor_idx ON team_conversations(visitor_id)",
        "CREATE INDEX IF NOT EXISTS team_messages_conversation_idx ON team_messages(conversation_id, time)",
        "CREATE INDEX IF NOT EXISTS user_activities_uid_idx ON user_activities(uid, created_at DESC)",
        "ALTER TABLE website_users ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE website_users ADD COLUMN IF NOT EXISTS is_deactivated INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE website_users ADD COLUMN IF NOT EXISTS deactivated_until TEXT",
        "ALTER TABLE website_users ADD COLUMN IF NOT EXISTS deactivation_reason TEXT",
    ]
    for statement in statements:
        try:
            conn.execute(statement)
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass

    seed_default_admins(conn)
    _database_schema_ready = True


def get_quota_db():
    """Use Neon whenever DATABASE_URL is configured; retain SQLite for local fallback."""
    if DATABASE_URL:
        if not HAS_POSTGRES:
            raise RuntimeError("PostgreSQL support is not installed. Redeploy with the updated requirements.txt.")
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        initialize_postgres_schema(conn)
        return PostgresConnection(conn)

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
    conn.execute(
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
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS website_users (
            uid TEXT PRIMARY KEY,
            email TEXT,
            username TEXT,
            photo_url TEXT,
            email_verified INTEGER NOT NULL DEFAULT 0,
            is_deactivated INTEGER NOT NULL DEFAULT 0,
            deactivated_until TEXT,
            deactivation_reason TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_accounts (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL,
            role_level TEXT NOT NULL DEFAULT 'restricted',
            is_active INTEGER NOT NULL DEFAULT 1,
            is_restricted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_activities (
            id TEXT PRIMARY KEY,
            uid TEXT NOT NULL,
            activity_type TEXT NOT NULL,
            description TEXT NOT NULL,
            ip_address TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    for col_def in [
        "ALTER TABLE website_users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE website_users ADD COLUMN is_deactivated INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE website_users ADD COLUMN deactivated_until TEXT",
        "ALTER TABLE website_users ADD COLUMN deactivation_reason TEXT"
    ]:
        try:
            conn.execute(col_def)
        except Exception:
            pass

    seed_default_admins(conn)
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
@require_shared_database
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
@require_shared_database
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
                (reg_id, "internship", name, email, phone, track, experience, statement, details_str, 0, "submitted", now, now)
            )
    except Exception as exc:
        print(f"Error saving internship application: {exc}")
        return jsonify({"success": False, "error": f"Database error: {exc}"}), 500

    db = get_firestore_client()
    if db:
        try:
            db.collection("careerRegistrations").document(reg_id).set({
                "id": reg_id, "type": "internship", "name": name, "email": email, "phone": phone,
                "program": track, "amount": 0, "status": "submitted",
                "experienceLevel": experience, "statement": statement,
                "details": details_str, "createdAt": now, "updatedAt": now
            })
        except Exception as exc:
            print(f"Firestore save warning: {exc}")

    return jsonify({
        "success": True,
        "id": reg_id,
        "amount": 0,
        "redirect_url": f"/thank-you.html?id={reg_id}&type=internship"
    })

@app.route("/api/registration/<reg_id>", methods=["GET"])
@require_shared_database
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

    is_int = reg_id.startswith("INT")
    return jsonify({
        "success": True,
        "registration": {
            "id": reg_id,
            "type": "internship" if is_int else "training",
            "name": "Applicant",
            "email": "applicant@nakconel.com",
            "phone": "+234 800 000 0000",
            "program": "Nakconel Internship Program" if is_int else "Nakconel Professional Program",
            "amount": 0 if is_int else 250000,
            "status": "submitted" if is_int else "pending_payment",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    })


@app.route("/api/registration/<reg_id>/initialize-paystack", methods=["POST"])
@require_shared_database
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
@require_shared_database
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
@require_master_admin
@require_shared_database
def admin_career_registrations():
    registrations_map = {}
    warning = None
    db = None if DATABASE_URL else get_firestore_client()
    if db:
        try:
            docs = db.collection("careerRegistrations").stream()
            for doc in docs:
                item = doc.to_dict()
                item["id"] = doc.id
                registrations_map[doc.id] = item
        except Exception as exc:
            warning = f"Failed to load career registrations from Firestore: {exc}"
    elif not DATABASE_URL:
        warning = "Firebase Firestore is unconfigured or offline (FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid)."

    if DATABASE_URL or not IS_VERCEL_DEPLOYMENT:
        try:
            with get_quota_db() as conn:
                rows = conn.execute("SELECT * FROM career_registrations ORDER BY created_at DESC").fetchall()
                for row in rows:
                    item = dict(row)
                    registrations_map.setdefault(item["id"], item)
        except Exception as exc:
            print(f"Error loading local career registrations: {exc}")

    registrations = list(registrations_map.values())
    total_paid_revenue = 0
    pending_count = 0
    approved_count = 0
    for item in registrations:
        if item.get("details"):
            try:
                item["detailsParsed"] = json.loads(item["details"])
            except Exception:
                item["detailsParsed"] = {}
        else:
            item["detailsParsed"] = {}
        if (item.get("status") or "").lower() in ["paid", "approved"]:
            total_paid_revenue += int(item.get("amount") or 250000)
            approved_count += 1
        else:
            pending_count += 1

    registrations.sort(key=lambda item: item.get("createdAt") or item.get("created_at") or "", reverse=True)
    result = {
        "registrations": registrations,
        "total": len(registrations),
        "pendingCount": pending_count,
        "approvedCount": approved_count,
        "totalRevenueNgn": total_paid_revenue
    }
    if warning:
        result["warning"] = warning
    return jsonify(result)

@app.route("/api/admin/career-registrations/<reg_id>/status", methods=["POST"])
@require_admin_session
@require_shared_database
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
    # The old Contact page used Supabase and placeholder replies. Route visitors
    # to the authenticated team chat, which is stored in the shared Neon database.
    return redirect("/team-chat")

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
@app.route("/admin/login")
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

        admin_acc = get_admin_account(username)
        if not admin_acc or admin_acc.get("password") != password:
            return jsonify({"error": "Invalid username or password"}), 401

        if admin_acc.get("is_active") == 0:
            return jsonify({"error": "This admin account has been deactivated by Master Admin."}), 403

        # Set admin session
        session.clear()
        session["admin_username"] = admin_acc["username"]
        session.permanent = True
        session.modified = True

        return jsonify({
            "success": True,
            "username": admin_acc["username"],
            "name": admin_acc.get("name"),
            "role_level": admin_acc.get("role_level"),
            "is_master": (admin_acc.get("role_level") == "master"),
            "is_restricted": bool(admin_acc.get("is_restricted")),
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

    admin_acc = get_admin_account(admin_username)
    if not admin_acc or admin_acc.get("is_active") == 0:
        session.clear()
        return jsonify({"loggedIn": False, "error": "Session expired or account deactivated."}), 401

    return jsonify({
        "loggedIn": True,
        "username": admin_acc["username"],
        "name": admin_acc.get("name"),
        "email": admin_acc.get("email"),
        "role": admin_acc.get("role"),
        "role_level": admin_acc.get("role_level"),
        "is_master": (admin_acc.get("role_level") == "master"),
        "is_restricted": bool(admin_acc.get("is_restricted"))
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
    team_accounts = []
    try:
        with get_quota_db() as conn:
            rows = conn.execute("SELECT username as id, name, email, role, role_level, is_active, is_restricted FROM admin_accounts ORDER BY created_at ASC").fetchall()
            team_accounts = [dict(r) for r in rows]
    except Exception:
        team_accounts = ADMIN_TEAM

    return jsonify({
        "admin": True,
        "username": request._admin_username,
        "name": admin_info.get("name"),
        "email": admin_info.get("email"),
        "role": admin_info.get("role"),
        "role_level": admin_info.get("role_level", "restricted"),
        "is_master": request._is_master,
        "is_restricted": request._is_restricted,
        "team": team_accounts,
        "configuredAdmins": len(team_accounts)
    })


@app.route("/api/admin/team", methods=["GET"])
@require_master_admin
@require_shared_database
def admin_get_team():
    """Get full list of registered admin accounts (Master Admin only)."""
    try:
        with get_quota_db() as conn:
            rows = conn.execute("SELECT username, name, email, role, role_level, is_active, is_restricted, created_at FROM admin_accounts ORDER BY created_at ASC").fetchall()
        return jsonify({"team": [dict(r) for r in rows]})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/admin/team/register", methods=["POST"])
@require_master_admin
@require_shared_database
def admin_register_new_admin():
    """Master Admin route to register a new admin account."""
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip().lower()
    password = str(data.get("password", "")).strip()
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    role = str(data.get("role", "Admin")).strip()
    role_level = str(data.get("role_level", "restricted")).strip().lower()

    if not username or not password or not name or not email:
        return jsonify({"success": False, "error": "Username, password, name, and email are required."}), 400

    if role_level not in ["master", "restricted"]:
        role_level = "restricted"

    is_restricted = 0 if role_level == "master" else 1
    now = datetime.now(timezone.utc).isoformat()

    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                INSERT INTO admin_accounts (username, password, name, email, role, role_level, is_active, is_restricted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                """,
                (username, password, name, email, role, role_level, is_restricted, now, now)
            )
        return jsonify({"success": True, "message": f"Admin '{name}' registered successfully as {role_level.upper()} admin!"})
    except Exception as exc:
        return jsonify({"success": False, "error": f"Registration failed: Username or email may already exist. Details: {exc}"}), 400


@app.route("/api/admin/team/<target_username>/status", methods=["POST"])
@require_master_admin
@require_shared_database
def admin_update_team_status(target_username):
    """Master Admin route to activate/deactivate, restrict/unrestrict, or change access tier of an admin."""
    target_username = str(target_username).strip().lower()
    if target_username == request._admin_username:
        return jsonify({"error": "You cannot modify your own active Master Admin session."}), 400

    data = request.get_json(silent=True) or {}
    now = datetime.now(timezone.utc).isoformat()
    updates = []
    params = []

    if "is_active" in data:
        is_act = 1 if data["is_active"] else 0
        updates.append("is_active = ?")
        params.append(is_act)

    if "is_restricted" in data:
        is_res = 1 if data["is_restricted"] else 0
        updates.append("is_restricted = ?")
        params.append(is_res)

    if "role_level" in data:
        rl = str(data["role_level"]).strip().lower()
        if rl in ["master", "restricted"]:
            updates.append("role_level = ?")
            params.append(rl)
            updates.append("is_restricted = ?")
            params.append(0 if rl == "master" else 1)

    if not updates:
        return jsonify({"error": "No update parameters provided."}), 400

    updates.append("updated_at = ?")
    params.append(now)
    params.append(target_username)

    try:
        with get_quota_db() as conn:
            existing = conn.execute(
                "SELECT username FROM admin_accounts WHERE LOWER(username) = ?",
                (target_username,)
            ).fetchone()
            if not existing:
                return jsonify({"error": "Admin account not found."}), 404
            conn.execute(f"UPDATE admin_accounts SET {', '.join(updates)} WHERE LOWER(username) = ?", params)
        return jsonify({"success": True, "username": target_username})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/admin/team/<target_username>", methods=["DELETE"])
@require_master_admin
@require_shared_database
def admin_delete_team_member(target_username):
    """Master Admin route to delete an admin account."""
    target_username = str(target_username).strip().lower()
    if target_username == request._admin_username:
        return jsonify({"error": "You cannot delete your own Master Admin account."}), 400

    try:
        with get_quota_db() as conn:
            conn.execute("DELETE FROM admin_accounts WHERE LOWER(username) = ?", (target_username,))
        return jsonify({"success": True, "message": f"Admin account '{target_username}' deleted."})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/admin/summary", methods=["GET"])
@require_admin_session
@require_shared_database
def admin_summary():
    # Requirement 1 & 5: If non-master admin, return restricted summary without registration details and revenue
    if not request._is_master:
        user_count = 0
        try:
            with get_quota_db() as conn:
                r = conn.execute("SELECT COUNT(*) as cnt FROM website_users").fetchone()
                user_count = r["cnt"] if isinstance(r, dict) else (r[0] if r else 0)
        except Exception:
            pass

        return jsonify({
            "campaignRegistrations": 0,
            "paidCampaignRegistrations": 0,
            "pendingCampaignPayments": 0,
            "careerRegistrations": 0,
            "pendingCareerPayments": 0,
            "approvedCareerRegistrations": 0,
            "registeredUsers": user_count,
            "strategyCalls": 0,
            "totalRevenueNgn": None, # Hidden for restricted non-master admin
            "packageCounts": {},
            "adminTeam": [],
            "is_master": False,
            "is_restricted": True,
            "warning": "Restricted Admin access mode. Submissions and Estimated Revenue are accessible to Master Admin only."
        })

    registrations_map = {}
    users_map = {}
    strategy_calls_map = {}
    career_registrations_map = {}
    error = None

    db = None if DATABASE_URL else get_firestore_client()
    if db is not None:
        try:
            for doc in db.collection("campaignRegistrations").stream():
                d = doc.to_dict()
                d["id"] = doc.id
                registrations_map[doc.id] = d
        except Exception as exc:
            error = f"campaignRegistrations: {exc}"

        try:
            for doc in db.collection("users").stream():
                d = doc.to_dict()
                d["uid"] = doc.id
                users_map[doc.id] = d
        except Exception as exc:
            error = f"{error}; users: {exc}" if error else f"users: {exc}"

        try:
            for doc in db.collection("strategyCalls").stream():
                d = doc.to_dict()
                d["id"] = doc.id
                strategy_calls_map[doc.id] = d
        except Exception as exc:
            error = f"{error}; strategyCalls: {exc}" if error else f"strategyCalls: {exc}"

        try:
            for doc in db.collection("careerRegistrations").stream():
                d = doc.to_dict()
                d["id"] = doc.id
                career_registrations_map[doc.id] = d
        except Exception as exc:
            error = f"{error}; careerRegistrations: {exc}" if error else f"careerRegistrations: {exc}"
    elif not DATABASE_URL:
        error = "Firebase Firestore is unconfigured or offline (FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid)."

    if DATABASE_URL or not IS_VERCEL_DEPLOYMENT:
      try:
        with get_quota_db() as conn:
            c_rows = conn.execute("SELECT * FROM campaign_registrations").fetchall()
            for r in c_rows:
                row_dict = dict(r)
                reg_id = row_dict["id"]
                if reg_id not in registrations_map:
                    raw = row_dict.get("raw_json")
                    if raw:
                        try:
                            registrations_map[reg_id] = json.loads(raw)
                        except Exception:
                            registrations_map[reg_id] = row_dict
                    else:
                        registrations_map[reg_id] = row_dict

            sc_rows = conn.execute("SELECT * FROM strategy_calls").fetchall()
            for r in sc_rows:
                row_dict = dict(r)
                sc_id = row_dict["id"]
                if sc_id not in strategy_calls_map:
                    strategy_calls_map[sc_id] = row_dict

            career_rows = conn.execute("SELECT * FROM career_registrations").fetchall()
            for r in career_rows:
                row_dict = dict(r)
                career_registrations_map.setdefault(row_dict["id"], row_dict)

            user_rows = conn.execute("SELECT * FROM website_users").fetchall()
            for r in user_rows:
                row_dict = dict(r)
                users_map.setdefault(row_dict["uid"], {
                    "uid": row_dict["uid"], "email": row_dict["email"],
                    "username": row_dict["username"], "photoURL": row_dict["photo_url"],
                    "createdAt": row_dict["created_at"], "updatedAt": row_dict["updated_at"],
                })
      except Exception as exc:
          print(f"SQLite summary merge error: {exc}")

    registrations = list(registrations_map.values())
    users = list(users_map.values())
    strategy_calls = list(strategy_calls_map.values())

    total_revenue = 0
    pending_payments = 0
    paid_registrations = 0
    package_counts = {}
    for item in registrations:
        package = item.get("package") or {}
        package_name = package.get("name") or item.get("package_name") or "Unknown"
        package_counts[package_name] = package_counts.get(package_name, 0) + 1
        if (item.get("status") or "").lower() == "pending_payment":
            pending_payments += 1
            continue
        paid_registrations += 1
        try:
            total_revenue += int(package.get("ngn") or item.get("amount") or 0)
        except (TypeError, ValueError):
            pass

    career_registrations_list = list(career_registrations_map.values())
    career_pending = 0
    career_approved = 0
    for c_item in career_registrations_list:
        st = (c_item.get("status") or "").lower()
        if st in ["paid", "approved"]:
            career_approved += 1
            try:
                total_revenue += int(c_item.get("amount") or 250000)
            except (TypeError, ValueError):
                pass
        else:
            career_pending += 1

    team_accounts = []
    try:
        with get_quota_db() as conn:
            rows = conn.execute("SELECT username as id, name, email, role, role_level, is_active, is_restricted FROM admin_accounts ORDER BY created_at ASC").fetchall()
            team_accounts = [dict(r) for r in rows]
    except Exception:
        team_accounts = ADMIN_TEAM

    result = {
        "campaignRegistrations": len(registrations),
        "paidCampaignRegistrations": paid_registrations,
        "pendingCampaignPayments": pending_payments,
        "careerRegistrations": len(career_registrations_list),
        "pendingCareerPayments": career_pending,
        "approvedCareerRegistrations": career_approved,
        "registeredUsers": len(users),
        "strategyCalls": len(strategy_calls),
        "totalRevenueNgn": total_revenue,
        "packageCounts": package_counts,
        "adminTeam": team_accounts,
        "is_master": True,
        "is_restricted": False
    }
    if error and not (registrations or users or strategy_calls or career_registrations_list):
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


def chat_conversation_from_row(row):
    return {
        "id": row["id"], "visitorId": row["visitor_id"], "visitorEmail": row["visitor_email"],
        "visitorName": row["visitor_name"], "teamMemberId": row["team_member_id"],
        "teamMemberName": row["team_member_name"], "teamMemberRole": row["team_member_role"],
        "status": row["status"], "lastMessage": row["last_message"], "lastSender": row["last_sender"],
        "lastUpdated": row["last_updated"], "createdAt": row["created_at"],
    }


def chat_message_from_row(row):
    message = {"id": row["id"], "sender": row["sender"], "senderName": row["sender_name"], "text": row["text"], "time": row["time"]}
    if row["attachment_json"]:
        try:
            message["attachment"] = json.loads(row["attachment_json"])
        except Exception:
            pass
    return message


@app.route("/api/chat/team", methods=["GET"])
def chat_team():
    return jsonify({"team": ADMIN_TEAM})


@app.route("/api/chat/conversations", methods=["GET"])
@require_strict_auth
@require_shared_database
def visitor_conversations():
    user = request._user
    try:
        with get_quota_db() as conn:
            rows = conn.execute("SELECT * FROM team_conversations WHERE visitor_id = ? ORDER BY last_updated DESC", (user["uid"],)).fetchall()
        conversations = [chat_conversation_from_row(row) for row in rows]
    except Exception:
        return jsonify({"error": "Live chat is temporarily unavailable."}), 503
    return jsonify({"conversations": conversations})


@app.route("/api/chat/conversations", methods=["POST"])
@require_strict_auth
@require_shared_database
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
        with get_quota_db() as conn:
            conn.execute(
                """INSERT INTO team_conversations (id, visitor_id, visitor_email, visitor_name, team_member_id, team_member_name, team_member_role, status, last_message, last_sender, last_updated, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (id) DO UPDATE SET visitor_email = EXCLUDED.visitor_email, visitor_name = EXCLUDED.visitor_name,
                   team_member_name = EXCLUDED.team_member_name, team_member_role = EXCLUDED.team_member_role, last_updated = EXCLUDED.last_updated""",
                (conversation_id, user["uid"], user.get("email"), visitor_name, member["id"], member["name"], member["role"], "open", "", "", now, now),
            )
        conversation["id"] = conversation_id
    except Exception:
        return jsonify({"error": "Could not start the conversation."}), 503

    return jsonify({"conversation": json_safe(conversation)})


@app.route("/api/chat/conversations/<conversation_id>/messages", methods=["GET"])
@require_strict_auth
@require_shared_database
def visitor_messages(conversation_id):
    user = request._user
    try:
        with get_quota_db() as conn:
            conv = conn.execute("SELECT * FROM team_conversations WHERE id = ?", (conversation_id,)).fetchone()
            if not conv or conv["visitor_id"] != user["uid"]:
                return jsonify({"error": "Conversation was not found."}), 404
            rows = conn.execute("SELECT * FROM team_messages WHERE conversation_id = ? ORDER BY time", (conversation_id,)).fetchall()
        messages = [chat_message_from_row(row) for row in rows]
    except Exception:
        return jsonify({"error": "Could not load messages."}), 503
    return jsonify({"messages": messages})


@app.route("/api/chat/conversations/<conversation_id>/messages", methods=["POST"])
@require_strict_auth
@require_shared_database
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

    try:
        with get_quota_db() as conn:
            conv = conn.execute("SELECT visitor_id FROM team_conversations WHERE id = ?", (conversation_id,)).fetchone()
            if not conv or conv["visitor_id"] != user["uid"]:
                return jsonify({"error": "Conversation was not found."}), 404
            message_id = f"MSG-{uuid.uuid4().hex}"
            conn.execute("INSERT INTO team_messages (id, conversation_id, sender, sender_name, text, attachment_json, time) VALUES (?, ?, ?, ?, ?, ?, ?)",
                         (message_id, conversation_id, msg_data["sender"], msg_data["senderName"], msg_data["text"], json.dumps(msg_data.get("attachment")) if msg_data.get("attachment") else None, now))
            conn.execute("UPDATE team_conversations SET last_message = ?, last_sender = ?, last_updated = ?, status = 'open' WHERE id = ?", (last_msg, "visitor", now, conversation_id))
    except Exception:
        return jsonify({"error": "Could not send the message."}), 503

    return jsonify({"sent": True, "message": {"id": message_id, **msg_data}})


@app.route("/api/admin/chat/conversations", methods=["GET"])
@require_admin_session
@require_shared_database
def admin_chat_conversations():
    try:
        with get_quota_db() as conn:
            rows = conn.execute("SELECT * FROM team_conversations ORDER BY last_updated DESC").fetchall()
        conversations = [chat_conversation_from_row(row) for row in rows]
    except Exception:
        return jsonify({"error": "Could not load conversations."}), 503
    return jsonify({"conversations": conversations})


@app.route("/api/admin/chat/conversations/<conversation_id>/messages", methods=["GET"])
@require_admin_session
@require_shared_database
def admin_chat_messages(conversation_id):
    try:
        with get_quota_db() as conn:
            conv = conn.execute("SELECT * FROM team_conversations WHERE id = ?", (conversation_id,)).fetchone()
            if not conv:
                return jsonify({"error": "Conversation was not found."}), 404
            rows = conn.execute("SELECT * FROM team_messages WHERE conversation_id = ? ORDER BY time", (conversation_id,)).fetchall()
        return jsonify({"messages": [chat_message_from_row(row) for row in rows], "conversation": chat_conversation_from_row(conv)})
    except Exception:
        return jsonify({"error": "Could not load messages."}), 503


@app.route("/api/admin/chat/conversations/<conversation_id>/messages", methods=["POST"])
@require_admin_session
@require_shared_database
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

    try:
        with get_quota_db() as conn:
            conv = conn.execute("SELECT id FROM team_conversations WHERE id = ?", (conversation_id,)).fetchone()
            if not conv:
                return jsonify({"error": "Conversation was not found."}), 404
            message_id = f"MSG-{uuid.uuid4().hex}"
            conn.execute("INSERT INTO team_messages (id, conversation_id, sender, sender_name, text, attachment_json, time) VALUES (?, ?, ?, ?, ?, ?, ?)",
                         (message_id, conversation_id, msg_data["sender"], msg_data["senderName"], msg_data["text"], json.dumps(msg_data.get("attachment")) if msg_data.get("attachment") else None, now))
            conn.execute("UPDATE team_conversations SET last_message = ?, last_sender = ?, last_updated = ?, status = 'open' WHERE id = ?", (last_msg, "team", now, conversation_id))
    except Exception:
        return jsonify({"error": "Could not send the message."}), 503

    return jsonify({"sent": True, "message": {"id": message_id, **msg_data}})


@app.route("/api/admin/campaign-registrations", methods=["GET"])
@require_master_admin
@require_shared_database
def admin_campaign_registrations():
    registrations_map = {}
    warning = None
    try:
        db = None if DATABASE_URL else get_firestore_client()
        if db:
            docs = db.collection("campaignRegistrations").stream()
            for doc in docs:
                data = doc.to_dict()
                data["id"] = doc.id
                registrations_map[doc.id] = json_safe(data)
        elif not DATABASE_URL:
            warning = "Firebase Firestore is unconfigured or offline (FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid)."
    except Exception as exc:
        print(f"Failed to load campaign registrations from Firestore: {exc}")
        warning = f"Failed to load campaign registrations from Firestore: {exc}"

    # Vercel's /tmp SQLite storage is per-instance. Only use this local
    # development fallback outside Vercel, where Firestore is the shared source.
    if DATABASE_URL or not IS_VERCEL_DEPLOYMENT:
      try:
        with get_quota_db() as conn:
            rows = conn.execute("SELECT * FROM campaign_registrations ORDER BY created_at DESC").fetchall()
            for row in rows:
                r = dict(row)
                reg_id = r["id"]
                if reg_id not in registrations_map:
                    raw = r.get("raw_json")
                    if raw:
                        try:
                            registrations_map[reg_id] = json.loads(raw)
                        except Exception:
                            registrations_map[reg_id] = r
                    else:
                        registrations_map[reg_id] = r
      except Exception as exc:
          print(f"SQLite campaign registrations fallback error: {exc}")

    registrations = list(registrations_map.values())
    registrations.sort(key=lambda item: item.get("createdAt") or item.get("created_at") or "", reverse=True)
    res = {"registrations": registrations}
    if warning and not registrations:
        res["warning"] = warning
    return jsonify(res)


@app.route("/api/admin/users", methods=["GET"])
@require_admin_session
@require_shared_database
def admin_users():
    try:
        with get_quota_db() as conn:
            rows = conn.execute("SELECT uid, username, email, photo_url, email_verified, is_deactivated, deactivated_until, deactivation_reason, created_at, updated_at FROM website_users ORDER BY created_at DESC").fetchall()
        users = [{
            "uid": row["uid"],
            "username": row["username"] or row["email"],
            "email": row["email"],
            "photoURL": row["photo_url"],
            "emailVerified": bool(row["email_verified"] if "email_verified" in row.keys() else 1),
            "isDeactivated": bool(row["is_deactivated"] if "is_deactivated" in row.keys() else 0),
            "deactivatedUntil": row["deactivated_until"] if "deactivated_until" in row.keys() else None,
            "deactivationReason": row["deactivation_reason"] if "deactivation_reason" in row.keys() else None,
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"]
        } for row in rows]
    except Exception as exc:
        return jsonify({"error": f"Could not load users from database: {exc}"}), 503
    return jsonify({"users": users})


@app.route("/api/admin/users/<uid>/activities", methods=["GET"])
@require_admin_session
@require_shared_database
def admin_user_activities(uid):
    """Retrieve activity log for a specific registered user."""
    try:
        with get_quota_db() as conn:
            rows = conn.execute("SELECT id, uid, activity_type, description, ip_address, created_at FROM user_activities WHERE uid = ? ORDER BY created_at DESC LIMIT 50", (str(uid),)).fetchall()
        return jsonify({"activities": [dict(r) for r in rows]})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/admin/users/<uid>/deactivate", methods=["POST"])
@require_master_admin
@require_shared_database
def admin_deactivate_user(uid):
    """Deactivate a user account for a specified number of days."""
    data = request.get_json(silent=True) or {}
    try:
        days = int(data.get("days") or 7)
    except (ValueError, TypeError):
        days = 7

    if days < 1:
        days = 1

    reason = str(data.get("reason") or "Administrative or suspicious activity deactivation").strip()[:200]
    deactivated_until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    now = datetime.now(timezone.utc).isoformat()

    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                UPDATE website_users
                SET is_deactivated = 1, deactivated_until = ?, deactivation_reason = ?, updated_at = ?
                WHERE uid = ?
                """,
                (deactivated_until, reason, now, str(uid))
            )
        log_user_activity(str(uid), "ACCOUNT_DEACTIVATED", f"Account deactivated for {days} days by Master Admin ({request._admin_username}). Reason: {reason}")
        return jsonify({"success": True, "uid": uid, "days": days, "deactivatedUntil": deactivated_until})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/admin/users/<uid>/reactivate", methods=["POST"])
@require_master_admin
@require_shared_database
def admin_reactivate_user(uid):
    """Reactivate a user account."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                UPDATE website_users
                SET is_deactivated = 0, deactivated_until = NULL, deactivation_reason = NULL, updated_at = ?
                WHERE uid = ?
                """,
                (now, str(uid))
            )
        log_user_activity(str(uid), "ACCOUNT_REACTIVATED", f"Account reactivated by Master Admin ({request._admin_username}).")
        return jsonify({"success": True, "uid": uid})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/admin/users/<uid>", methods=["DELETE"])
@require_master_admin
@require_shared_database
def admin_delete_user(uid):
    """Delete a registered user account and its activity logs."""
    try:
        with get_quota_db() as conn:
            conn.execute("DELETE FROM website_users WHERE uid = ?", (str(uid),))
            conn.execute("DELETE FROM user_activities WHERE uid = ?", (str(uid),))
        return jsonify({"success": True, "uid": uid, "message": "User account and activity log deleted."})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/users/sync", methods=["POST"])
@require_strict_auth
@require_shared_database
def sync_website_user():
    """Mirror Firebase-authenticated users into Neon for the admin directory."""
    data = request.get_json(silent=True) or {}
    user = request._user
    now = datetime.now(timezone.utc).isoformat()
    username = str(data.get("username") or user.get("email") or "User").strip()[:120]
    photo_url = str(data.get("photoURL") or "").strip()[:1000]
    email_verified = 1 if data.get("emailVerified") else 1

    try:
        with get_quota_db() as conn:
            conn.execute(
                """INSERT INTO website_users (uid, email, username, photo_url, email_verified, is_deactivated, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 0, ?, ?)
                   ON CONFLICT (uid) DO UPDATE SET email = EXCLUDED.email, username = EXCLUDED.username,
                   photo_url = EXCLUDED.photo_url, email_verified = EXCLUDED.email_verified, updated_at = EXCLUDED.updated_at""",
                (user["uid"], user.get("email"), username, photo_url, email_verified, now, now),
            )
        log_user_activity(user["uid"], "LOGIN_SYNC", f"User profile synced / Logged in as {username}")
    except Exception:
        return jsonify({"error": "Could not save user profile."}), 503
    return jsonify({"saved": True})

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
                          {"role": "system", "content": "You write vivid, detailed text-to-image prompts in 2-3 sentences max. IMPORTANT: Output clean prompts without any text, logos, or watermarks. Output ONLY the prompt text, nothing else. Keep it under 60 words."},
                          {"role": "user", "content": prompt}
                      ]}
            )
            expanded = r.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            if expanded:
                final_prompt = expanded[:600]
        except Exception:
            pass

    # Ensure negative prompting instructions for watermark removal
    clean_prompt = f"{final_prompt}, no watermark, no logo, no signature, clean background, ultra-high resolution"

    try:
        if pollinations_key:
            r = requests.post(
                "https://gen.pollinations.ai/v1/images/generations",
                headers={"Authorization": f"Bearer {pollinations_key}", "Content-Type": "application/json"},
                json={"model": "flux", "prompt": clean_prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json"},
                timeout=30
            )
            item = r.json().get("data", [{}])[0]
            if item.get("b64_json"):
                return jsonify({"image": f"data:image/jpeg;base64,{item['b64_json']}", "promptUsed": final_prompt, "quota": quota})
        
        # Fallback to public Pollinations URL with explicit watermark removal parameters
        encoded_prompt = urllib.parse.quote(clean_prompt)
        image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?model=flux&width=1024&height=1024&nologo=true&private=true&enhance=false"
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
@require_shared_database
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

    reg_id = pending_id or payment["reference"]
    registration["id"] = reg_id

    # Always save locally to SQLite
    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                INSERT INTO campaign_registrations
                (id, uid, email, full_name, business, challenge, package_name, amount, currency, status, payment_reference, created_at, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    uid = EXCLUDED.uid, email = EXCLUDED.email, full_name = EXCLUDED.full_name,
                    business = EXCLUDED.business, challenge = EXCLUDED.challenge,
                    package_name = EXCLUDED.package_name, amount = EXCLUDED.amount,
                    currency = EXCLUDED.currency, status = EXCLUDED.status,
                    payment_reference = EXCLUDED.payment_reference, created_at = EXCLUDED.created_at,
                    raw_json = EXCLUDED.raw_json
                """,
                (
                    reg_id,
                    registration["uid"],
                    registration["email"],
                    registration.get("questions", {}).get("fullName"),
                    registration.get("questions", {}).get("business"),
                    registration.get("questions", {}).get("challenge"),
                    registration.get("package", {}).get("name"),
                    registration.get("package", {}).get("amount", 0),
                    registration.get("package", {}).get("currency"),
                    registration.get("status", "paid"),
                    registration.get("payment", {}).get("reference"),
                    registration.get("createdAt"),
                    json.dumps(registration)
                )
            )
    except Exception as exc:
        print(f"Campaign registration SQLite save warning: {exc}")

    # Also save to Firestore if available
    db = get_firestore_client()
    if db:
        try:
            doc_ref = db.collection("campaignRegistrations").document(reg_id)
            doc_ref.set(registration, merge=True)
        except Exception as exc:
            print(f"Campaign registration Firestore save warning: {exc}")

    return jsonify({"saved": True, "reference": payment["reference"]})


@app.route("/api/campaign/pending", methods=["POST"])
@require_shared_database
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
    doc_id = f"cmp-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}"
    registration = {
        "id": doc_id,
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
        "createdAt": now,
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

    # Save to SQLite
    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                INSERT INTO campaign_registrations
                (id, uid, email, full_name, business, challenge, package_name, amount, currency, status, payment_reference, created_at, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    uid = EXCLUDED.uid, email = EXCLUDED.email, full_name = EXCLUDED.full_name,
                    business = EXCLUDED.business, challenge = EXCLUDED.challenge,
                    package_name = EXCLUDED.package_name, amount = EXCLUDED.amount,
                    currency = EXCLUDED.currency, status = EXCLUDED.status,
                    payment_reference = EXCLUDED.payment_reference, created_at = EXCLUDED.created_at,
                    raw_json = EXCLUDED.raw_json
                """,
                (
                    doc_id,
                    registration["uid"],
                    registration["email"],
                    registration.get("questions", {}).get("fullName"),
                    registration.get("questions", {}).get("business"),
                    registration.get("questions", {}).get("challenge"),
                    registration.get("package", {}).get("name"),
                    registration.get("package", {}).get("amount", 0),
                    registration.get("package", {}).get("currency"),
                    registration.get("status", "pending_payment"),
                    None,
                    now,
                    json.dumps(registration)
                )
            )
    except Exception as exc:
        print(f"Pending campaign registration SQLite save warning: {exc}")

    # Also attempt Firestore
    db = get_firestore_client()
    if db:
        try:
            doc_ref = db.collection("campaignRegistrations").document(doc_id)
            existing = doc_ref.get()
            if existing.exists:
                existing_data = existing.to_dict() or {}
                if (existing_data.get("status") or "").lower() == "paid":
                    return jsonify({"saved": True, "id": doc_id, "pendingId": doc_id, "status": "paid"})
            doc_ref.set(registration, merge=True)
        except Exception as exc:
            print(f"Pending campaign registration Firestore save warning: {exc}")

    return jsonify({"saved": True, "id": doc_id, "pendingId": doc_id, "status": "pending_payment"})


@app.route("/api/strategy-call", methods=["POST"])
@require_shared_database
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

    # Persist to Neon. Do not report a successful booking if the shared write fails.
    try:
        with get_quota_db() as conn:
            conn.execute(
                """
                INSERT INTO strategy_calls (id, name, email, phone, message, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone,
                    message = EXCLUDED.message, status = EXCLUDED.status,
                    created_at = EXCLUDED.created_at
                """,
                (doc_id, entry["name"], entry["email"], entry["phone"], entry["message"], entry["status"], now)
            )
    except Exception:
        return jsonify({"saved": False, "error": "Could not save your strategy-call request. Please try again."}), 503

    # Firestore is not needed when the shared Neon database is configured.
    db = None if DATABASE_URL else get_firestore_client()
    if db:
        try:
            db.collection("strategyCalls").document(doc_id).set(entry)
        except Exception as exc:
            print(f"Strategy call Firestore save warning: {exc}")

    return jsonify({"saved": True, "id": doc_id, "message": "Strategy call request submitted successfully!"})


@app.route("/api/admin/strategy-calls", methods=["GET"])
@require_master_admin
@require_shared_database
def admin_strategy_calls():
    calls = []
    db = None if DATABASE_URL else get_firestore_client()
    if db:
        try:
            docs = db.collection("strategyCalls").stream()
            calls = [json_safe({"id": doc.id, **doc.to_dict()}) for doc in docs]
        except Exception as exc:
            print(f"Admin strategy calls Firestore fetch warning: {exc}")

    if not calls and (DATABASE_URL or not IS_VERCEL_DEPLOYMENT):
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
@require_shared_database
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
