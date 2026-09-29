import secrets
import string
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash
from auth_utils import generate_token
from auth_helpers import VALID_ROLES
from db import get_connection
from email_utils import send_otp_email

auth_bp = Blueprint("auth", __name__)


# ---------- log in ----------
@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()

    if not data or "username" not in data or "password" not in data:
        return jsonify({"error": "Username and password are required"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT u.user_id, u.username, u.password_hash, u.full_name,
               u.role, u.station_id, u.status, s.name AS station
        FROM users u
        LEFT JOIN stations s ON u.station_id = s.station_id
        WHERE u.username = %s
    """, (data["username"],))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    # Same message whether the user is missing or the password is wrong
    if user is None or not check_password_hash(user["password_hash"], data["password"]):
        return jsonify({"error": "Invalid username or password"}), 401

    # Password is right - but has an admin approved this account?
    if user["status"] == "pending":
        return jsonify({"error": "Your account is awaiting admin approval"}), 403

    if user["status"] == "rejected":
        return jsonify({"error": "Your account request was declined"}), 403

    # Never send the hash back to the browser
    token = generate_token(user)

    return jsonify({
        "token":      token,
        "user_id":    user["user_id"],
        "username":   user["username"],
        "full_name":  user["full_name"],
        "role":       user["role"],
        "station_id": user["station_id"],
        "station":    user["station"],
        "message":    "Login successful"
    })


# ---------- list users (for an admin screen) ----------
@auth_bp.route("/api/users", methods=["GET"])
def get_users():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT u.user_id, u.username, u.full_name, u.role, s.name AS station
        FROM users u
        LEFT JOIN stations s ON u.station_id = s.station_id
        ORDER BY u.role, u.username
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


# ---------- register (exempt - new users have no token) ----------
@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    required = ["username", "password", "full_name", "email", "station_id"]
    for field in required:
        if field not in data or not data[field]:
            return jsonify({"error": f"{field} is required"}), 400

    if len(data["password"]) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    if "@" not in data["email"] or "." not in data["email"]:
        return jsonify({"error": "That doesn't look like an email address"}), 400

    # What they ASK for is advisory only, but keep it to roles that exist.
    requested_role = data.get("requested_role")
    if requested_role is not None and requested_role not in VALID_ROLES:
        return jsonify({"error": "Requested role is not valid"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        "SELECT user_id FROM users WHERE username = %s", (data["username"],)
    )
    if cursor.fetchone() is not None:
        cursor.close()
        conn.close()
        return jsonify({"error": "That username is already taken"}), 409

    cursor.execute(
        "SELECT user_id FROM users WHERE email = %s", (data["email"],)
    )
    if cursor.fetchone() is not None:
        cursor.close()
        conn.close()
        return jsonify({"error": "That email is already registered"}), 409

    password_hash = generate_password_hash(data["password"])

    # role and status are hardcoded. requested_role holds what they
    # ASKED for - the admin decides what they actually get.
    # 'field_staff' is the least-privileged role in this schema (it is
    # also the column default); status 'pending' blocks login until approved.
    cursor.execute("""
        INSERT INTO users (username, password_hash, full_name, email, phone,
                           role, requested_role, station_id, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending')
    """, (
        data["username"],
        password_hash,
        data["full_name"],
        data["email"],
        data.get("phone"),
        "field_staff",
        requested_role,
        data["station_id"]
    ))
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({
        "message": "Registration submitted. An admin will review your request."
    }), 201


# ---------- forgot password: email a code (exempt) ----------
@auth_bp.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()

    # The SAME response whichever way this goes - see the note below
    SAFE_REPLY = jsonify({
        "message": "If that email is registered, we've sent a code to it."
    })

    if not email:
        return jsonify({"error": "Email is required"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT user_id, full_name, status FROM users WHERE email = %s", (email,)
    )
    user = cursor.fetchone()

    if user is None or user["status"] != "active":
        cursor.close()
        conn.close()
        return SAFE_REPLY

    # Rate limit: at most 3 codes per hour per account
    cursor.execute("""
        SELECT COUNT(*) AS recent FROM password_resets
        WHERE user_id = %s AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
    """, (user["user_id"],))
    if cursor.fetchone()["recent"] >= 3:
        cursor.close()
        conn.close()
        return jsonify({
            "error": "Too many reset requests. Please wait an hour."
        }), 429

    otp = "".join(secrets.choice(string.digits) for _ in range(6))
    otp_hash = generate_password_hash(otp)
    expires_at = datetime.now() + timedelta(minutes=10)

    cursor.execute("""
        INSERT INTO password_resets (user_id, otp_hash, expires_at)
        VALUES (%s, %s, %s)
    """, (user["user_id"], otp_hash, expires_at))
    conn.commit()
    cursor.close()
    conn.close()

    send_otp_email(email, otp, user["full_name"])

    return SAFE_REPLY


# ---------- reset password with the code (exempt) ----------
@auth_bp.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    otp = (data.get("otp") or "").strip()
    new_password = data.get("new_password") or ""

    if not email or not otp or not new_password:
        return jsonify({"error": "Email, code and new password are required"}), 400

    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT user_id FROM users WHERE email = %s", (email,))
    user = cursor.fetchone()
    if user is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Invalid or expired code"}), 400

    # Most recent code for this account
    cursor.execute("""
        SELECT reset_id, otp_hash, expires_at, attempts, used
        FROM password_resets
        WHERE user_id = %s
        ORDER BY reset_id DESC
        LIMIT 1
    """, (user["user_id"],))
    reset = cursor.fetchone()

    def fail():
        cursor.close()
        conn.close()
        return jsonify({"error": "Invalid or expired code"}), 400

    if reset is None:
        return fail()

    if reset["used"]:
        return fail()

    if reset["attempts"] >= 5:
        return fail()

    if datetime.now() > reset["expires_at"]:
        return fail()

    if not check_password_hash(reset["otp_hash"], otp):
        cursor.execute(
            "UPDATE password_resets SET attempts = attempts + 1 WHERE reset_id = %s",
            (reset["reset_id"],)
        )
        conn.commit()
        return fail()

    # Code is good - change the password and burn the code
    new_hash = generate_password_hash(new_password)
    cursor.execute(
        "UPDATE users SET password_hash = %s WHERE user_id = %s",
        (new_hash, user["user_id"])
    )
    cursor.execute(
        "UPDATE password_resets SET used = 1 WHERE reset_id = %s",
        (reset["reset_id"],)
    )
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({"message": "Password updated. You can log in now."})