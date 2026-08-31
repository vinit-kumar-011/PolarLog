from flask import Blueprint, jsonify, request
from db import get_connection

personnel_bp = Blueprint("personnel", __name__)


@personnel_bp.route("/api/personnel", methods=["GET"])
def get_personnel():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT p.person_id, p.name, p.role, p.contact, p.status,
               s.name AS station, e.season
        FROM personnel p
        LEFT JOIN stations s ON p.station_id = s.station_id
        LEFT JOIN expeditions e ON p.expedition_id = e.expedition_id
        ORDER BY s.name, p.name
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)
@personnel_bp.route("/api/personnel/<int:person_id>", methods=["GET"])
def get_person(person_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT * FROM personnel WHERE person_id = %s",
        (person_id,)
    )
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row is None:
        return jsonify({"error": "Person not found"}), 404

    return jsonify(row)
@personnel_bp.route("/api/personnel", methods=["POST"])
def add_person():
    data = request.get_json()

    for field in ["name", "role", "contact"]:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """INSERT INTO personnel
           (name, role, contact, status, station_id, expedition_id)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (
            data["name"],
            data["role"],
            data["contact"],
            data.get("status", "active"),
            data.get("station_id"),
            data.get("expedition_id")
        )
    )

    conn.commit()
    new_id = cursor.lastrowid
    cursor.close()
    conn.close()

    return jsonify({
        "person_id": new_id,
        "message": "Person added"
    }), 201
@personnel_bp.route("/api/personnel/<int:person_id>", methods=["PUT"])
def update_person(person_id):
    data = request.get_json()

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """UPDATE personnel
           SET name = %s,
               role = %s,
               contact = %s,
               status = %s,
               station_id = %s,
               expedition_id = %s
           WHERE person_id = %s""",
        (
            data["name"],
            data["role"],
            data["contact"],
            data["status"],
            data.get("station_id"),
            data.get("expedition_id"),
            person_id
        )
    )

    conn.commit()
    changed = cursor.rowcount

    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Person not found"}), 404

    return jsonify({"message": "Person updated"})
@personnel_bp.route("/api/personnel/<int:person_id>", methods=["DELETE"])
def delete_person(person_id):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "DELETE FROM personnel WHERE person_id = %s",
        (person_id,)
    )

    conn.commit()
    changed = cursor.rowcount

    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Person not found"}), 404

    return jsonify({"message": "Person deleted"})