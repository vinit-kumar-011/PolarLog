from flask import Blueprint, jsonify, request
from db import get_connection

stations_bp = Blueprint("stations", __name__)


# ---------- list all stations ----------
@stations_bp.route("/api/stations", methods=["GET"])
def get_stations():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM stations ORDER BY name")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


# ---------- one station ----------
@stations_bp.route("/api/stations/<int:station_id>", methods=["GET"])
def get_station(station_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM stations WHERE station_id = %s", (station_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row is None:
        return jsonify({"error": "Station not found"}), 404
    return jsonify(row)


# ---------- a station's current summary ----------
@stations_bp.route("/api/stations/<int:station_id>/summary", methods=["GET"])
def station_summary(station_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT s.station_id, s.name, s.region, s.status,
               (SELECT COUNT(*) FROM personnel p WHERE p.station_id = s.station_id) AS personnel_count,
               (SELECT COUNT(*) FROM inventory i WHERE i.station_id = s.station_id) AS inventory_items,
               (SELECT COUNT(*) FROM alerts a WHERE a.station_id = s.station_id AND a.status = 'open') AS open_alerts
        FROM stations s
        WHERE s.station_id = %s
    """, (station_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row is None:
        return jsonify({"error": "Station not found"}), 404
    return jsonify(row)