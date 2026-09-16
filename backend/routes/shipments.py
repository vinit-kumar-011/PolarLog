from flask import Blueprint, jsonify, request
from db import get_connection

shipments_bp = Blueprint("shipments", __name__)


@shipments_bp.route("/api/shipments", methods=["GET"])
def get_shipments():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT sh.shipment_id, sh.reference, sh.origin, sh.status,
               DATE_FORMAT(sh.dispatch_date, '%Y-%m-%d') AS dispatch_date,
               DATE_FORMAT(sh.eta, '%Y-%m-%d') AS eta,
               s.name AS destination,
               (SELECT COUNT(*) FROM cargo c
                WHERE c.shipment_id = sh.shipment_id) AS cargo_items
        FROM shipments sh
        LEFT JOIN stations s ON sh.destination_id = s.station_id
        ORDER BY sh.eta
    """)

    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    return jsonify(rows)
@shipments_bp.route("/api/shipments/<int:shipment_id>", methods=["GET"])
def get_shipment(shipment_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        "SELECT * FROM shipments WHERE shipment_id = %s",
        (shipment_id,)
    )

    row = cursor.fetchone()

    cursor.close()
    conn.close()

    if row is None:
        return jsonify({"error": "Shipment not found"}), 404

    return jsonify(row)
@shipments_bp.route("/api/shipments/in-transit", methods=["GET"])
def get_in_transit_shipments():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT sh.shipment_id, sh.reference, sh.origin, sh.status,
               DATE_FORMAT(sh.dispatch_date, '%Y-%m-%d') AS dispatch_date,
               DATE_FORMAT(sh.eta, '%Y-%m-%d') AS eta,
               s.name AS destination,
               (SELECT COUNT(*) FROM cargo c
                WHERE c.shipment_id = sh.shipment_id) AS cargo_items
        FROM shipments sh
        LEFT JOIN stations s ON sh.destination_id = s.station_id
        WHERE sh.status = 'in_transit'
        ORDER BY sh.eta
    """)

    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    return jsonify(rows)
@shipments_bp.route("/api/shipments", methods=["POST"])
def add_shipment():
    data = request.get_json()

    if "reference" not in data:
        return jsonify({"error": "Missing field: reference"}), 400

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """INSERT INTO shipments
           (reference, origin, destination_id, expedition_id,
            dispatch_date, eta, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (
            data["reference"],
            data.get("origin"),
            data.get("destination_id"),
            data.get("expedition_id"),
            data.get("dispatch_date"),
            data.get("eta"),
            data.get("status", "pending")
        )
    )

    conn.commit()
    new_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return jsonify({
        "shipment_id": new_id,
        "message": "Shipment added"
    }), 201
@shipments_bp.route("/api/shipments/<int:shipment_id>/status", methods=["PUT"])
def update_shipment_status(shipment_id):
    data = request.get_json()

    if "status" not in data:
        return jsonify({"error": "Missing field: status"}), 400

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "UPDATE shipments SET status = %s WHERE shipment_id = %s",
        (data["status"], shipment_id)
    )

    conn.commit()
    changed = cursor.rowcount

    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Shipment not found"}), 404

    return jsonify({"message": "Shipment status updated"})