from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash
from db import get_connection

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
               u.role, u.station_id, s.name AS station
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

    # Never send the hash back to the browser
    return jsonify({
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