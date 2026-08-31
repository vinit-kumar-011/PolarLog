from flask import Blueprint, jsonify, request
from db import get_connection

inventory_bp = Blueprint("inventory", __name__)


# ---------- list everything ----------
@inventory_bp.route("/api/inventory", methods=["GET"])
def get_inventory():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT i.item_id, i.name, i.category, i.quantity, i.unit,
               i.reorder_level, i.status, s.name AS station
        FROM inventory i
        JOIN stations s ON i.station_id = s.station_id
        ORDER BY s.name, i.name
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


# ---------- one item ----------
@inventory_bp.route("/api/inventory/<int:item_id>", methods=["GET"])
def get_item(item_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM inventory WHERE item_id = %s", (item_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row is None:
        return jsonify({"error": "Item not found"}), 404
    return jsonify(row)


# ---------- anything running low ----------
@inventory_bp.route("/api/inventory/low-stock", methods=["GET"])
def low_stock():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT i.item_id, i.name, i.category, i.quantity, i.unit,
               i.reorder_level, i.status, s.name AS station
        FROM inventory i
        JOIN stations s ON i.station_id = s.station_id
        WHERE i.quantity <= i.reorder_level
        ORDER BY i.quantity / NULLIF(i.reorder_level, 0)
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


# ---------- add an item ----------
@inventory_bp.route("/api/inventory", methods=["POST"])
def add_item():
    data = request.get_json()

    for field in ["name", "category", "station_id", "quantity"]:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO inventory
           (name, category, station_id, quantity, unit, reorder_level, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (data["name"], data["category"], data["station_id"], data["quantity"],
         data.get("unit", "units"), data.get("reorder_level", 0),
         data.get("status", "ok"))
    )
    conn.commit()
    new_id = cursor.lastrowid
    cursor.close()
    conn.close()

    return jsonify({"item_id": new_id, "message": "Item added"}), 201


# ---------- update quantity ----------
@inventory_bp.route("/api/inventory/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    data = request.get_json()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE inventory SET quantity = %s, status = %s WHERE item_id = %s",
        (data["quantity"], data.get("status", "ok"), item_id)
    )
    conn.commit()
    changed = cursor.rowcount
    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Item not found"}), 404
    return jsonify({"message": "Item updated"})


# ---------- delete ----------
@inventory_bp.route("/api/inventory/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM inventory WHERE item_id = %s", (item_id,))
    conn.commit()
    changed = cursor.rowcount
    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Item not found"}), 404
    return jsonify({"message": "Item deleted"})