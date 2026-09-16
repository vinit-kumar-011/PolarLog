from flask import Blueprint, jsonify
from db import get_connection

alerts_bp = Blueprint("alerts", __name__)


@alerts_bp.route("/api/alerts", methods=["GET"])
def get_alerts():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT a.alert_id, a.alert_type, a.severity, a.message,
               a.status, s.name AS station,
               DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS created_at
        FROM alerts a
        LEFT JOIN stations s ON a.station_id = s.station_id
        ORDER BY FIELD(a.severity, 'critical', 'warning', 'info'), a.created_at DESC
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


@alerts_bp.route("/api/alerts/open", methods=["GET"])
def get_open_alerts():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT a.alert_id, a.alert_type, a.severity, a.message, s.name AS station
        FROM alerts a
        LEFT JOIN stations s ON a.station_id = s.station_id
        WHERE a.status = 'open'
        ORDER BY FIELD(a.severity, 'critical', 'warning', 'info')
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)