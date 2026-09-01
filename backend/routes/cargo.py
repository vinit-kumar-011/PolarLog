from flask import Blueprint, jsonify, request
from db import get_connection

cargo_bp = Blueprint("cargo", __name__)


# ---------- list all cargo ----------
@cargo_bp.route("/api/cargo", methods=["GET"])
def get_cargo():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT c.cargo_id, c.item_name, c.category, c.quantity, c.unit,
               c.weight_kg, c.priority, c.status,
               s.reference AS shipment_ref,
               s.origin AS origin,
               DATE_FORMAT(s.eta, '%Y-%m-%d') AS eta,
           st.name AS destination
        FROM cargo c
        LEFT JOIN shipments s ON c.shipment_id = s.shipment_id
        LEFT JOIN stations st ON s.destination_id = st.station_id
        ORDER BY FIELD(c.priority, 'critical', 'high', 'normal', 'low')
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


# ---------- one cargo item ----------
@cargo_bp.route("/api/cargo/<int:cargo_id>", methods=["GET"])
def get_cargo_item(cargo_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM cargo WHERE cargo_id = %s", (cargo_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row is None:
        return jsonify({"error": "Cargo item not found"}), 404
    return jsonify(row)


# ---------- everything in one shipment ----------
@cargo_bp.route("/api/cargo/shipment/<int:shipment_id>", methods=["GET"])
def get_cargo_by_shipment(shipment_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT cargo_id, item_name, category, quantity, unit,
               weight_kg, priority, status
        FROM cargo
        WHERE shipment_id = %s
        ORDER BY FIELD(priority, 'critical', 'high', 'normal', 'low')
    """, (shipment_id,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


# ---------- add cargo ----------
@cargo_bp.route("/api/cargo", methods=["POST"])
def add_cargo():
    data = request.get_json()

    for field in ["item_name", "category", "quantity"]:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO cargo
           (shipment_id, item_name, category, quantity, unit, weight_kg, priority, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (data.get("shipment_id"), data["item_name"], data["category"],
         data["quantity"], data.get("unit", "units"), data.get("weight_kg"),
         data.get("priority", "normal"), data.get("status", "pending"))
    )
    conn.commit()
    new_id = cursor.lastrowid
    cursor.close()
    conn.close()

    return jsonify({"cargo_id": new_id, "message": "Cargo added"}), 201


# ---------- update status ----------
@cargo_bp.route("/api/cargo/<int:cargo_id>", methods=["PUT"])
def update_cargo(cargo_id):
    data = request.get_json()

    if "status" not in data:
        return jsonify({"error": "Missing field: status"}), 400

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE cargo SET status = %s WHERE cargo_id = %s",
        (data["status"], cargo_id)
    )
    conn.commit()
    changed = cursor.rowcount
    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Cargo item not found"}), 404
    return jsonify({"message": "Cargo updated"})


# ---------- delete ----------
@cargo_bp.route("/api/cargo/<int:cargo_id>", methods=["DELETE"])
def delete_cargo(cargo_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cargo WHERE cargo_id = %s", (cargo_id,))
    conn.commit()
    changed = cursor.rowcount
    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Cargo item not found"}), 404
    return jsonify({"message": "Cargo deleted"})