from flask import Blueprint, jsonify, request

from db import get_connection
from auth_helpers import admin_required

admin_bp = Blueprint("admin", __name__)


# ---------- everyone waiting ----------
@admin_bp.route("/api/admin/pending-users", methods=["GET"])
@admin_required
def list_pending():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT u.user_id, u.username, u.full_name, u.email, u.phone,
               u.requested_role, u.station_id, s.name AS station
        FROM users u
        LEFT JOIN stations s ON u.station_id = s.station_id
        WHERE u.status = 'pending'
        ORDER BY u.user_id
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


# ---------- approve, and set the real role ----------
@admin_bp.route("/api/admin/approve/<int:user_id>", methods=["PUT"])
@admin_required
def approve_user(user_id):
    data = request.get_json(silent=True) or {}

    if "role" not in data or not data["role"]:
        return jsonify({"error": "role is required"}), 400

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET status = 'active', role = %s WHERE user_id = %s",
        (data["role"], user_id)
    )
    conn.commit()
    changed = cursor.rowcount
    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "User not found"}), 404

    return jsonify({"message": "User approved", "role": data["role"]})


# ---------- reject ----------
@admin_bp.route("/api/admin/reject/<int:user_id>", methods=["PUT"])
@admin_required
def reject_user(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET status = 'rejected' WHERE user_id = %s", (user_id,)
    )
    conn.commit()
    changed = cursor.rowcount
    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "User not found"}), 404

    return jsonify({"message": "User rejected"})