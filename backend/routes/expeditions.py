from flask import Blueprint, jsonify, request
from db import get_connection

expeditions_bp = Blueprint("expeditions", __name__)


@expeditions_bp.route("/api/expeditions", methods=["GET"])
def get_expeditions():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT e.expedition_id, e.name, e.season, e.status,
               DATE_FORMAT(e.depart_date, '%Y-%m-%d')AS depart_date,
               DATE_FORMAT(e.return_date, '%Y-%m-%d') AS return_date,
               s.name AS station
        FROM expeditions e
        JOIN stations s ON e.station_id = s.station_id
        ORDER BY e.depart_date DESC
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)
@expeditions_bp.route("/api/expeditions/<int:expedition_id>", methods=["GET"])

def get_expedition(expedition_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM expeditions WHERE expedition_id = %s", (expedition_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row is None:
        return jsonify({"error": "Expedition not found"}), 404
    return jsonify(row)


@expeditions_bp.route("/api/expeditions", methods=["POST"])
def add_expedition():
    data = request.get_json()

    for field in ["name", "season", "station_id", "depart_date"]:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO expeditions (name, season, station_id, depart_date, return_date, status)
           VALUES (%s, %s, %s, %s, %s, %s)""",(data["name"], data["season"], data["station_id"], data["depart_date"],
         data.get("return_date"), data.get("status", "planned"))
    )
    conn.commit()
    new_id = cursor.lastrowid
    cursor.close()
    conn.close()

    return jsonify({"expedition_id": new_id, "message": "Expedition added"}), 201


@expeditions_bp.route("/api/expeditions/<int:expedition_id>", methods=["PUT"])
def update_expedition(expedition_id):
    data = request.get_json()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE expeditions SET status = %s WHERE expedition_id = %s",
        (data["status"], expedition_id)
    )
    conn.commit()
    changed = cursor.rowcount
    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Expedition not found"}), 404
    return jsonify({"message": "Expedition updated"})


@expeditions_bp.route("/api/expeditions/<int:expedition_id>", methods=["DELETE"])
def delete_expedition(expedition_id):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "DELETE FROM expeditions WHERE expedition_id = %s",
        (expedition_id,)
    )
    conn.commit()
    changed = cursor.rowcount

    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Expedition not found"}), 404

    return jsonify({"message": "Expedition deleted"})