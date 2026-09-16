from datetime import datetime

from flask import Blueprint, jsonify, request
from db import get_connection

cargo_bp = Blueprint("cargo", __name__)

VALID_SHIPMENT_STATUSES = {"pending", "in_transit", "delivered"}


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
# If the request doesn't include an existing shipment_id, one is
# auto-created to carry this cargo (using origin/destination/eta from
# the request) so the entry shows up on the Shipments page too instead
# of being an orphan row with no origin/destination of its own - cargo
# has no origin/destination columns in the schema; those only exist on
# the linked shipment. Both inserts are committed together, or neither is.
@cargo_bp.route("/api/cargo", methods=["POST"])
def add_cargo():
    data = request.get_json()

    for field in ["item_name", "category", "quantity"]:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        shipment_id = data.get("shipment_id")

        if not shipment_id:
            destination_name = data.get("destination")
            if not destination_name:
                cursor.close()
                conn.close()
                return jsonify({
                    "error": "Missing field: destination (required to auto-create a shipment "
                              "when no shipment_id is given)"
                }), 400

            cursor.execute(
                "SELECT station_id FROM stations WHERE LOWER(name) = LOWER(%s)",
                (destination_name,)
            )
            dest = cursor.fetchone()
            if dest is None:
                cursor.close()
                conn.close()
                return jsonify({"error": f"Unknown destination station: {destination_name}"}), 400

            cargo_status = data.get("status", "pending")
            shipment_status = (
                cargo_status if cargo_status in VALID_SHIPMENT_STATUSES else "pending"
            )

            write_cursor = conn.cursor()
            write_cursor.execute(
                """INSERT INTO shipments
                   (reference, origin, destination_id, dispatch_date, eta, status)
                   VALUES (%s, %s, %s, CURDATE(), %s, %s)""",
                ("PENDING-REF", data.get("origin"), dest["station_id"],
                 data.get("eta"), shipment_status)
            )
            shipment_id = write_cursor.lastrowid

            # Now that we have an id, give it a readable reference.
            reference = f"SHP-{datetime.now().year}-AUTO-{shipment_id}"
            write_cursor.execute(
                "UPDATE shipments SET reference = %s WHERE shipment_id = %s",
                (reference, shipment_id)
            )
        else:
            write_cursor = conn.cursor()
            reference = None

        write_cursor.execute(
            """INSERT INTO cargo
               (shipment_id, item_name, category, quantity, unit, weight_kg, priority, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (shipment_id, data["item_name"], data["category"],
             data["quantity"], data.get("unit", "units"), data.get("weight_kg"),
             data.get("priority", "normal"), data.get("status", "pending"))
        )
        new_id = write_cursor.lastrowid

        conn.commit()
        write_cursor.close()
        cursor.close()
        conn.close()

        response = {"cargo_id": new_id, "shipment_id": shipment_id, "message": "Cargo added"}
        if reference:
            response["shipment_reference"] = reference
        return jsonify(response), 201

    except Exception as e:
        conn.rollback()
        cursor.close()
        conn.close()
        return jsonify({"error": f"Failed to add cargo: {str(e)}"}), 500


# ---------- update (full edit, or just a status change) ----------
# Same endpoint handles both the "Update Status" quick action (body is
# just {"status": ...}) and the full Edit Cargo modal (item/category/
# quantity/unit/weight/priority/status, plus optionally origin/
# destination/eta for the linked shipment - cargo itself has no such
# columns, see add_cargo()'s comment). Only the fields actually present
# in the body are touched, so a status-only call doesn't clobber
# anything else. When status is updated, the linked shipment's status
# is mirrored too, same convention add_cargo() uses when it first
# creates one.
@cargo_bp.route("/api/cargo/<int:cargo_id>", methods=["PUT"])
def update_cargo(cargo_id):
    data = request.get_json() or {}

    cargo_fields = ["item_name", "category", "quantity", "unit", "weight_kg", "priority", "status"]
    cargo_updates = {f: data[f] for f in cargo_fields if f in data}

    if not cargo_updates and "destination" not in data and "origin" not in data and "eta" not in data:
        return jsonify({"error": "No updatable fields provided"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT shipment_id FROM cargo WHERE cargo_id = %s", (cargo_id,))
        cargo_row = cursor.fetchone()
        if cargo_row is None:
            cursor.close()
            conn.close()
            return jsonify({"error": "Cargo item not found"}), 404

        write_cursor = conn.cursor()

        if cargo_updates:
            set_clause = ", ".join(f"{col} = %s" for col in cargo_updates)
            write_cursor.execute(
                f"UPDATE cargo SET {set_clause} WHERE cargo_id = %s",
                list(cargo_updates.values()) + [cargo_id]
            )

        shipment_fields = {}
        if "origin" in data:
            shipment_fields["origin"] = data["origin"]
        if "eta" in data:
            shipment_fields["eta"] = data["eta"]
        if "destination" in data:
            cursor.execute(
                "SELECT station_id FROM stations WHERE LOWER(name) = LOWER(%s)",
                (data["destination"],)
            )
            dest = cursor.fetchone()
            if dest is None:
                conn.rollback()
                write_cursor.close()
                cursor.close()
                conn.close()
                return jsonify({"error": f"Unknown destination station: {data['destination']}"}), 400
            shipment_fields["destination_id"] = dest["station_id"]
        if "status" in cargo_updates and cargo_updates["status"] in VALID_SHIPMENT_STATUSES:
            shipment_fields["status"] = cargo_updates["status"]

        if shipment_fields and cargo_row["shipment_id"]:
            set_clause = ", ".join(f"{col} = %s" for col in shipment_fields)
            write_cursor.execute(
                f"UPDATE shipments SET {set_clause} WHERE shipment_id = %s",
                list(shipment_fields.values()) + [cargo_row["shipment_id"]]
            )

        conn.commit()
        write_cursor.close()
        cursor.close()
        conn.close()
        return jsonify({"message": "Cargo updated"})

    except Exception as e:
        conn.rollback()
        cursor.close()
        conn.close()
        return jsonify({"error": f"Failed to update cargo: {str(e)}"}), 500


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
