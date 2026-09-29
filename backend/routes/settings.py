import json
import re

from flask import Blueprint, g, jsonify, request
from mysql.connector import errors as mysql_errors
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_connection

settings_bp = Blueprint("settings", __name__)

# Notification preferences a user can store. Anything else in a request
# body is rejected rather than silently saved.
NOTIFICATION_DEFAULTS = {
    "critical_alerts": True,
    "shipment_updates": True,
    "inventory_alerts": True,
    "personnel_updates": True,
    "system_notifications": True,
}

NAME_MIN, NAME_MAX = 2, 100
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,50}$")
ROLES = {"admin", "coordinator", "station_officer", "field_staff"}
PASSWORD_MIN, PASSWORD_MAX = 8, 128


def _current_user_id():
    return g.current_user["user_id"]


def _body_targets_someone_else(data):
    """
    Queued offline writes carry the user_id they were made under. If a
    different user is logged in when the queue replays, refuse rather
    than apply one person's change to another person's account.
    """
    claimed = data.get("user_id")
    return claimed is not None and claimed != _current_user_id()


def _fetch_account(cursor, user_id):
    cursor.execute("""
        SELECT u.user_id, u.username, u.full_name, u.role,
               u.station_id, s.name AS station
        FROM users u
        LEFT JOIN stations s ON u.station_id = s.station_id
        WHERE u.user_id = %s
    """, (user_id,))
    return cursor.fetchone()


# ---------- account (own profile) ----------
@settings_bp.route("/api/settings/account", methods=["GET"])
def get_account():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    account = _fetch_account(cursor, _current_user_id())
    cursor.close()
    conn.close()

    if account is None:
        return jsonify({"error": "Account not found"}), 404
    return jsonify(account)


@settings_bp.route("/api/settings/account", methods=["PUT"])
def update_account():
    """
    Edit your own profile: full_name, username, role, station_id (any
    subset, at least one). Admin only - everyone else must go through the
    approval service (see APPROVAL_* in frontend/js/settings.js).
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be JSON"}), 400
    if _body_targets_someone_else(data):
        return jsonify({"error": "This change was made under a different account"}), 403

    updates = {}

    if "full_name" in data:
        full_name = data["full_name"]
        if not isinstance(full_name, str):
            return jsonify({"error": "full_name must be text"}), 400
        full_name = " ".join(full_name.split())
        if not (NAME_MIN <= len(full_name) <= NAME_MAX):
            return jsonify({
                "error": f"Name must be {NAME_MIN}-{NAME_MAX} characters"
            }), 400
        updates["full_name"] = full_name

    if "username" in data:
        username = data["username"]
        if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
            return jsonify({
                "error": "Username must be 3-50 characters: letters, numbers, . _ -"
            }), 400
        updates["username"] = username.strip()

    if "role" in data:
        if data["role"] not in ROLES:
            return jsonify({
                "error": "Role must be one of: " + ", ".join(sorted(ROLES))
            }), 400
        updates["role"] = data["role"]

    if "station_id" in data:
        sid = data["station_id"]
        if sid is not None and (isinstance(sid, bool) or not isinstance(sid, int)):
            return jsonify({"error": "station_id must be a number or null"}), 400
        updates["station_id"] = sid

    if not updates:
        return jsonify({"error": "No profile fields provided"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    # Only admins may change a profile directly. Checked against the DB,
    # not the token, so a role change takes effect immediately.
    current = _fetch_account(cursor, _current_user_id())
    if current is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Account not found"}), 404
    if current["role"] != "admin":
        cursor.close()
        conn.close()
        return jsonify({
            "error": "Profile changes need administrator approval - submit a change request instead"
        }), 403

    if updates.get("station_id") is not None:
        cursor.execute(
            "SELECT 1 AS ok FROM stations WHERE station_id = %s",
            (updates["station_id"],),
        )
        if cursor.fetchone() is None:
            cursor.close()
            conn.close()
            return jsonify({"error": "That station does not exist"}), 400

    # Don't let the last admin demote themselves out of the system.
    if "role" in updates and updates["role"] != "admin":
        cursor.execute(
            "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND user_id <> %s",
            (_current_user_id(),),
        )
        if cursor.fetchone()["n"] == 0:
            cursor.close()
            conn.close()
            return jsonify({
                "error": "You are the only administrator - make someone else an admin first"
            }), 400

    try:
        set_clause = ", ".join(f"{col} = %s" for col in updates)
        cursor.execute(
            f"UPDATE users SET {set_clause} WHERE user_id = %s",
            list(updates.values()) + [_current_user_id()],
        )
        conn.commit()
    except mysql_errors.IntegrityError as e:
        conn.rollback()
        cursor.close()
        conn.close()
        if e.errno == 1062:
            return jsonify({"error": "That username is already taken"}), 409
        return jsonify({"error": "Couldn't save your profile"}), 400

    account = _fetch_account(cursor, _current_user_id())
    cursor.close()
    conn.close()

    if account is None:
        return jsonify({"error": "Account not found"}), 404
    return jsonify(account)


# ---------- password ----------
@settings_bp.route("/api/settings/password", methods=["POST"])
def change_password():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be JSON"}), 400

    current = data.get("current_password")
    new = data.get("new_password")
    if not isinstance(current, str) or not current:
        return jsonify({"error": "Current password is required"}), 400
    if not isinstance(new, str) or not (PASSWORD_MIN <= len(new) <= PASSWORD_MAX):
        return jsonify({
            "error": f"New password must be {PASSWORD_MIN}-{PASSWORD_MAX} characters"
        }), 400
    if new == current:
        return jsonify({"error": "New password must be different from the current one"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT password_hash FROM users WHERE user_id = %s",
        (_current_user_id(),),
    )
    row = cursor.fetchone()

    # 403, not 401: the frontend treats 401 as "session expired" and
    # logs the user out, which is wrong for a mistyped password.
    if row is None or not check_password_hash(row["password_hash"], current):
        cursor.close()
        conn.close()
        return jsonify({"error": "Current password is incorrect"}), 403

    cursor.execute(
        "UPDATE users SET password_hash = %s WHERE user_id = %s",
        (generate_password_hash(new), _current_user_id()),
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": "Password updated"})


# ---------- preferences (notifications) ----------
def _load_notifications(cursor, user_id):
    cursor.execute(
        "SELECT notifications FROM user_settings WHERE user_id = %s", (user_id,)
    )
    row = cursor.fetchone()
    prefs = dict(NOTIFICATION_DEFAULTS)
    if row and row["notifications"]:
        try:
            stored = json.loads(row["notifications"])
            for key in NOTIFICATION_DEFAULTS:
                if isinstance(stored.get(key), bool):
                    prefs[key] = stored[key]
        except (ValueError, AttributeError):
            pass  # corrupt row - fall back to defaults
    return prefs


@settings_bp.route("/api/settings/preferences", methods=["GET"])
def get_preferences():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    prefs = _load_notifications(cursor, _current_user_id())
    cursor.close()
    conn.close()
    return jsonify({"user_id": _current_user_id(), "notifications": prefs})


@settings_bp.route("/api/settings/preferences", methods=["PUT"])
def update_preferences():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be JSON"}), 400
    if _body_targets_someone_else(data):
        return jsonify({"error": "This change was made under a different account"}), 403

    incoming = data.get("notifications")
    if not isinstance(incoming, dict):
        return jsonify({"error": "notifications must be an object"}), 400
    for key, value in incoming.items():
        if key not in NOTIFICATION_DEFAULTS:
            return jsonify({"error": f"Unknown notification setting: {key}"}), 400
        if not isinstance(value, bool):
            return jsonify({"error": f"{key} must be true or false"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    prefs = _load_notifications(cursor, _current_user_id())
    prefs.update(incoming)
    cursor.execute(
        """
        INSERT INTO user_settings (user_id, notifications) VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE notifications = VALUES(notifications)
        """,
        (_current_user_id(), json.dumps(prefs)),
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"user_id": _current_user_id(), "notifications": prefs})
