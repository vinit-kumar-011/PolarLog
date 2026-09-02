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
               i.reorder_level, i.daily_usage, i.status, s.name AS station,
               CASE WHEN i.daily_usage > 0
                    THEN ROUND(i.quantity / i.daily_usage, 1)
                    ELSE NULL END AS days_remaining
        FROM inventory i
        JOIN stations s ON i.station_id = s.station_id
        ORDER BY s.name, i.name
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


# ---------- inventory linked to any inbound shipment resupplying it ----------
# Connects inventory -> cargo -> shipments: for each item, finds the
# nearest-ETA in-transit/pending shipment carrying cargo whose item_name
# matches this item's name (matched loosely - e.g. cargo "Diesel drums"
# matches inventory "Diesel" - since cargo isn't linked to a specific
# inventory item_id in the schema). Shipment info is nested under
# "incoming_shipment" (null if nothing's inbound) to match what
# inventory.js's renderForecast() expects.
@inventory_bp.route("/api/inventory/forecast/with-shipments", methods=["GET"])
def get_inventory_forecast():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        WITH inbound_ranked AS (
            SELECT
                inv.item_id,
                sh.reference,
                sh.status AS shipment_status,
                sh.eta,
                ROW_NUMBER() OVER (
                    PARTITION BY inv.item_id ORDER BY sh.eta ASC
                ) AS rn
            FROM cargo c
            JOIN shipments sh ON c.shipment_id = sh.shipment_id
            JOIN inventory inv
                ON inv.station_id = sh.destination_id
               AND (
                     LOWER(c.item_name) LIKE CONCAT('%', LOWER(inv.name), '%')
                  OR LOWER(inv.name) LIKE CONCAT('%', LOWER(c.item_name), '%')
               )
            WHERE sh.status IN ('pending', 'in_transit')
        )
        SELECT
            i.item_id, i.name, i.category, i.quantity, i.unit,
            i.reorder_level, i.daily_usage, i.status AS stock_status,
            s.name AS station,
            CASE WHEN i.daily_usage > 0
                 THEN ROUND(i.quantity / i.daily_usage, 1)
                 ELSE NULL END AS days_remaining,
            ib.reference AS ship_reference,
            ib.shipment_status AS ship_status,
            DATE_FORMAT(ib.eta, '%Y-%m-%d') AS ship_eta
        FROM inventory i
        JOIN stations s ON i.station_id = s.station_id
        LEFT JOIN inbound_ranked ib ON ib.item_id = i.item_id AND ib.rn = 1
        ORDER BY (days_remaining IS NULL), days_remaining ASC
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    result = []
    for r in rows:
        incoming = None
        if r["ship_reference"]:
            incoming = {
                "reference": r["ship_reference"],
                "status": r["ship_status"],
                "eta": r["ship_eta"],
            }
        result.append({
            "item_id": r["item_id"],
            "name": r["name"],
            "category": r["category"],
            "quantity": r["quantity"],
            "unit": r["unit"],
            "reorder_level": r["reorder_level"],
            "daily_usage": r["daily_usage"],
            "stock_status": r["stock_status"],
            "station": r["station"],
            "days_remaining": r["days_remaining"],
            "incoming_shipment": incoming,
        })

    return jsonify(result)


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


# ---------- add an item (merges into an existing item if one already
#             exists for this station+category+name, instead of creating
#             a duplicate row) ----------
@inventory_bp.route("/api/inventory", methods=["POST"])
def add_item():
    data = request.get_json()

    for field in ["name", "category", "station_id", "quantity"]:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

<<<<<<< HEAD
    # Same station + same category + same name (case-insensitive) counts
    # as "the same stock" - add to it rather than creating a new row.
=======
>>>>>>> 678cdcc (your message)
    cursor.execute(
        """SELECT item_id, quantity FROM inventory
           WHERE station_id = %s AND category = %s AND LOWER(name) = LOWER(%s)
           LIMIT 1""",
        (data["station_id"], data["category"], data["name"])
    )
    existing = cursor.fetchone()

    if existing:
        new_quantity = existing["quantity"] + data["quantity"]
        write_cursor = conn.cursor()
        write_cursor.execute(
            "UPDATE inventory SET quantity = %s, last_updated = CURDATE() WHERE item_id = %s",
            (new_quantity, existing["item_id"])
        )
        conn.commit()
        write_cursor.close()
        cursor.close()
        conn.close()
        return jsonify({
            "item_id": existing["item_id"],
            "quantity": new_quantity,
            "merged": True,
            "message": "Added to existing stock"
        }), 200

    write_cursor = conn.cursor()
    write_cursor.execute(
        """INSERT INTO inventory
           (name, category, station_id, quantity, unit, reorder_level, status, last_updated)
           VALUES (%s, %s, %s, %s, %s, %s, %s, CURDATE())""",
        (data["name"], data["category"], data["station_id"], data["quantity"],
         data.get("unit", "units"), data.get("reorder_level", 0),
         data.get("status", "ok"))
    )
    conn.commit()
    new_id = write_cursor.lastrowid
    write_cursor.close()
    cursor.close()
    conn.close()

    return jsonify({"item_id": new_id, "merged": False, "message": "Item added"}), 201


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
<<<<<<< HEAD
    return jsonify({"message": "Item deleted"})

# ---------- forecast, but also shows if help is already on the way ----------
@inventory_bp.route("/api/inventory/forecast/with-shipments", methods=["GET"])
def get_forecast_with_shipments():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    # 1. the same forecast list as before
    cursor.execute("""
        SELECT i.item_id, i.name, i.category, i.quantity, i.unit,
               i.daily_usage_rate, i.station_id, s.name AS station,
               ROUND(i.quantity / NULLIF(i.daily_usage_rate, 0), 1) AS days_remaining
        FROM inventory i
        JOIN stations s ON i.station_id = s.station_id
        WHERE i.daily_usage_rate > 0
        ORDER BY days_remaining ASC
    """)
    forecast_items = cursor.fetchall()

    # 2. everything currently moving, with what it's carrying and where
    cursor.execute("""
        SELECT c.item_name, sh.destination_id, sh.reference, sh.status,
               DATE_FORMAT(sh.eta, '%Y-%m-%d') AS eta
        FROM cargo c
        JOIN shipments sh ON c.shipment_id = sh.shipment_id
        WHERE sh.status IN ('pending', 'in_transit')
    """)
    incoming = cursor.fetchall()

    cursor.close()
    conn.close()

    # 3. match them up: for each low item, is something already coming?
    for item in forecast_items:
        item["incoming_shipment"] = None
        for ship in incoming:
            if ship["item_name"] == item["name"] and ship["destination_id"] == item["station_id"]:
                item["incoming_shipment"] = {
                    "reference": ship["reference"],
                    "status": ship["status"],
                    "eta": ship["eta"]
                }
                break

    return jsonify(forecast_items)
=======
    return jsonify({"message": "Item deleted"})
>>>>>>> 678cdcc (your message)
