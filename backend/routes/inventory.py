from datetime import datetime

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


# ---------- transfer supply between stations ----------
# Moves quantity from one inventory row (from_item_id) to a matching
# item at another station (to_station_id), creating the destination
# row if that station doesn't have this item yet. Atomic: both sides
# are committed together, or neither is.
@inventory_bp.route("/api/inventory/transfer", methods=["POST"])
def transfer_supply():
    data = request.get_json()

    for field in ["from_item_id", "to_station_id", "quantity"]:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    quantity = data["quantity"]
    if not isinstance(quantity, (int, float)) or quantity <= 0:
        return jsonify({"error": "Quantity must be a positive number"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """SELECT i.item_id, i.name, i.category, i.quantity, i.unit,
                      i.reorder_level, i.station_id, s.name AS station_name
               FROM inventory i
               JOIN stations s ON i.station_id = s.station_id
               WHERE i.item_id = %s""",
            (data["from_item_id"],)
        )
        source = cursor.fetchone()

        if source is None:
            cursor.close()
            conn.close()
            return jsonify({"error": "Source item not found"}), 404

        if source["station_id"] == data["to_station_id"]:
            cursor.close()
            conn.close()
            return jsonify({"error": "Source and destination are the same station"}), 400

        if quantity > source["quantity"]:
            cursor.close()
            conn.close()
            return jsonify({
                "error": f"Insufficient stock: only {source['quantity']} {source['unit']} "
                         f"available at {source['station_name']}"
            }), 400

        cursor.execute(
            "SELECT name FROM stations WHERE station_id = %s",
            (data["to_station_id"],)
        )
        dest_station = cursor.fetchone()
        if dest_station is None:
            cursor.close()
            conn.close()
            return jsonify({"error": "Destination station not found"}), 404

        write_cursor = conn.cursor()

        # ---- draw down the source ----
        new_source_qty = source["quantity"] - quantity
        reorder = source["reorder_level"] or 0
        source_status = (
            "critical" if reorder and new_source_qty <= reorder * 0.5
            else "low" if reorder and new_source_qty <= reorder
            else "ok"
        )
        write_cursor.execute(
            "UPDATE inventory SET quantity = %s, status = %s, last_updated = CURDATE() WHERE item_id = %s",
            (new_source_qty, source_status, source["item_id"])
        )

        # ---- add to the destination (merge into an existing row if one exists) ----
        cursor.execute(
            """SELECT item_id, quantity, reorder_level FROM inventory
               WHERE station_id = %s AND category = %s AND LOWER(name) = LOWER(%s)
               LIMIT 1""",
            (data["to_station_id"], source["category"], source["name"])
        )
        dest_existing = cursor.fetchone()

        if dest_existing:
            new_dest_qty = dest_existing["quantity"] + quantity
            dest_reorder = dest_existing["reorder_level"] or 0
            dest_status = (
                "critical" if dest_reorder and new_dest_qty <= dest_reorder * 0.5
                else "low" if dest_reorder and new_dest_qty <= dest_reorder
                else "ok"
            )
            write_cursor.execute(
                "UPDATE inventory SET quantity = %s, status = %s, last_updated = CURDATE() WHERE item_id = %s",
                (new_dest_qty, dest_status, dest_existing["item_id"])
            )
            dest_item_id = dest_existing["item_id"]
        else:
            write_cursor.execute(
                """INSERT INTO inventory
                   (name, category, station_id, quantity, unit, reorder_level, daily_usage, status, last_updated)
                   VALUES (%s, %s, %s, %s, %s, %s, 0, 'ok', CURDATE())""",
                (source["name"], source["category"], data["to_station_id"], quantity,
                 source["unit"], source["reorder_level"])
            )
            new_dest_qty = quantity
            dest_item_id = write_cursor.lastrowid

        # ---- record the movement as an already-delivered shipment + cargo
        #      row, so it shows up in Shipments/Cargo history the same way
        #      a real resupply would. A transfer is instantaneous (unlike a
        #      normal shipment), so it's logged as 'delivered' immediately
        #      rather than 'pending'/'in_transit'. ----
        write_cursor.execute(
            """INSERT INTO shipments
               (reference, origin, destination_id, dispatch_date, eta, status)
               VALUES (%s, %s, %s, CURDATE(), CURDATE(), 'delivered')""",
            ("PENDING-REF", source["station_name"], data["to_station_id"])
        )
        shipment_id = write_cursor.lastrowid
        shipment_reference = f"SHP-{datetime.now().year}-XFER-{shipment_id}"
        write_cursor.execute(
            "UPDATE shipments SET reference = %s WHERE shipment_id = %s",
            (shipment_reference, shipment_id)
        )
        write_cursor.execute(
            """INSERT INTO cargo
               (shipment_id, item_name, category, quantity, unit, priority, status)
               VALUES (%s, %s, %s, %s, %s, 'normal', 'delivered')""",
            (shipment_id, source["name"], source["category"], quantity, source["unit"])
        )

        conn.commit()
        write_cursor.close()
        cursor.close()
        conn.close()

        return jsonify({
            "message": "Transfer complete",
            "item_name": source["name"],
            "category": source["category"],
            "quantity": quantity,
            "from_station": source["station_name"],
            "from_item_id": source["item_id"],
            "from_new_quantity": new_source_qty,
            "to_station": dest_station["name"],
            "to_item_id": dest_item_id,
            "to_new_quantity": new_dest_qty,
            "shipment_id": shipment_id,
            "shipment_reference": shipment_reference,
        }), 200

    except Exception as e:
        conn.rollback()
        cursor.close()
        conn.close()
        return jsonify({"error": f"Transfer failed: {str(e)}"}), 500


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


# ---------- update an item (quantity, and optionally unit / reorder level) ----------
# Status is recomputed from quantity vs. reorder_level (same thresholds as
# transfer_supply) unless the caller explicitly passes a status, so a plain
# quantity edit can't accidentally erase a critical/low flag.
@inventory_bp.route("/api/inventory/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    data = request.get_json(silent=True) or {}

    if "quantity" not in data:
        return jsonify({"error": "Missing field: quantity"}), 400

    quantity = data["quantity"]
    if not isinstance(quantity, (int, float)) or quantity < 0:
        return jsonify({"error": "Quantity must be a non-negative number"}), 400

    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                "SELECT reorder_level FROM inventory WHERE item_id = %s",
                (item_id,)
            )
            existing = cursor.fetchone()
            if existing is None:
                return jsonify({"error": "Item not found"}), 404

            reorder_level = data.get("reorder_level", existing["reorder_level"])

            if "status" in data:
                status = data["status"]
            else:
                reorder = reorder_level or 0
                status = (
                    "critical" if reorder and quantity <= reorder * 0.5
                    else "low" if reorder and quantity <= reorder
                    else "ok"
                )

            fields = ["quantity = %s", "status = %s", "reorder_level = %s", "last_updated = CURDATE()"]
            params = [quantity, status, reorder_level]
            if "unit" in data:
                fields.append("unit = %s")
                params.append(data["unit"])
            params.append(item_id)

            write_cursor = conn.cursor()
            write_cursor.execute(
                f"UPDATE inventory SET {', '.join(fields)} WHERE item_id = %s",
                tuple(params)
            )
            conn.commit()
            write_cursor.close()

            return jsonify({"message": "Item updated", "quantity": quantity, "status": status})
        finally:
            cursor.close()
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Update failed: {str(e)}"}), 500
    finally:
        conn.close()


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
