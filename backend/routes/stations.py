from datetime import datetime

from flask import Blueprint, jsonify, request
from db import get_connection

stations_bp = Blueprint("stations", __name__)

# Historical-only stations (e.g. Dakshin Gangotri) should simply be
# stored with status='decommissioned' (or not stored at all) rather
# than filtered here; /api/stations returns whatever the stations
# table actually contains - nothing is hardcoded into the frontend.

VALID_STATUSES = {"operational", "maintenance", "offline", "decommissioned"}

# Valid geographic ranges. A NaN fails these comparisons too, so it is
# rejected along with genuinely out-of-range numbers.
COORD_LIMITS = {"latitude": 90, "longitude": 180}


def _coord_range_error(name, value):
    """Return an error message if a numeric coordinate is out of range,
    otherwise None. Blank/None values are allowed (station without a pin)."""
    if value is None or value == "":
        return None
    limit = COORD_LIMITS[name]
    if not (-limit <= value <= limit):
        return f"{name} must be between -{limit} and {limit}"
    return None

# Columns this module needs on top of the original stations table.
# Older deployments may be missing some of these - _ensure_columns()
# adds whichever are absent so GET/POST/PUT below can always rely on
# them existing, without requiring a manual migration step.
EXTRA_COLUMNS = {
    "country": "VARCHAR(100)",
    "station_type": "VARCHAR(100)",
    "description": "TEXT",
    "contact_info": "VARCHAR(255)",
    "updated_at": "TIMESTAMP NULL DEFAULT NULL",
}


def _ensure_columns(conn):
    """Idempotently add any columns this module needs but an older
    stations table might not have. Single lightweight information_schema
    lookup; ALTERs only run for columns that are actually missing.
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stations'
    """)
    existing = {row[0] for row in cursor.fetchall()}
    for col, ddl in EXTRA_COLUMNS.items():
        if col not in existing:
            cursor.execute(f"ALTER TABLE stations ADD COLUMN {col} {ddl}")
    conn.commit()
    cursor.close()


# ---------- list all stations ----------
@stations_bp.route("/api/stations", methods=["GET"])
def get_stations():
    conn = get_connection()
    _ensure_columns(conn)
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT s.*,
               (SELECT COUNT(*) FROM personnel p
                WHERE p.station_id = s.station_id) AS personnel_count,
               (SELECT COUNT(*) FROM alerts a
                WHERE a.station_id = s.station_id AND a.status = 'open'
                  AND a.severity = 'critical') AS critical_alert_count
        FROM stations s
        ORDER BY s.name
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(rows)


# ---------- one station ----------
@stations_bp.route("/api/stations/<int:station_id>", methods=["GET"])
def get_station(station_id):
    conn = get_connection()
    _ensure_columns(conn)
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT s.*,
               (SELECT COUNT(*) FROM personnel p
                WHERE p.station_id = s.station_id) AS personnel_count
        FROM stations s WHERE s.station_id = %s
    """, (station_id,))
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


# ---------- add a station ----------
@stations_bp.route("/api/stations", methods=["POST"])
def add_station():
    data = request.get_json(silent=True) or {}

    for field in ["name", "region"]:
        if not data.get(field):
            return jsonify({"error": f"Missing field: {field}"}), 400

    status = data.get("status", "operational")
    if status not in VALID_STATUSES:
        return jsonify({"error": f"Invalid status: {status}"}), 400

    lat = data.get("latitude")
    lon = data.get("longitude")
    try:
        lat = float(lat) if lat not in (None, "") else None
        lon = float(lon) if lon not in (None, "") else None
    except (TypeError, ValueError):
        return jsonify({"error": "latitude/longitude must be numeric"}), 400

    for name, value in (("latitude", lat), ("longitude", lon)):
        err = _coord_range_error(name, value)
        if err:
            return jsonify({"error": err}), 400

    conn = get_connection()
    _ensure_columns(conn)
    cursor = conn.cursor()

    try:
        cursor.execute(
            """INSERT INTO stations
               (name, region, country, station_type, latitude, longitude,
                status, description, contact_info, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                data["name"], data["region"], data.get("country"),
                data.get("station_type") or data.get("type"),
                lat, lon, status, data.get("description"),
                data.get("contact_info"), datetime.now(),
            ),
        )
        conn.commit()
        new_id = cursor.lastrowid
        cursor.close()
        conn.close()
        return jsonify({"station_id": new_id, "message": "Station added"}), 201
    except Exception as e:
        conn.rollback()
        cursor.close()
        conn.close()
        return jsonify({"error": f"Failed to add station: {str(e)}"}), 500


# ---------- update a station (partial) ----------
@stations_bp.route("/api/stations/<int:station_id>", methods=["PUT", "PATCH"])
def update_station(station_id):
    data = request.get_json(silent=True) or {}

    editable = ["name", "region", "country", "station_type", "latitude",
                "longitude", "status", "description", "contact_info"]
    # allow "type" as an alias for station_type from the frontend form
    if "type" in data and "station_type" not in data:
        data["station_type"] = data.pop("type")

    updates = {f: data[f] for f in editable if f in data}
    if not updates:
        return jsonify({"error": "No updatable fields provided"}), 400

    if "status" in updates and updates["status"] not in VALID_STATUSES:
        return jsonify({"error": f"Invalid status: {updates['status']}"}), 400

    for coord in ("latitude", "longitude"):
        if coord in updates and updates[coord] not in (None, ""):
            try:
                updates[coord] = float(updates[coord])
            except (TypeError, ValueError):
                return jsonify({"error": f"{coord} must be numeric"}), 400
            err = _coord_range_error(coord, updates[coord])
            if err:
                return jsonify({"error": err}), 400

    updates["updated_at"] = datetime.now()

    conn = get_connection()
    _ensure_columns(conn)
    cursor = conn.cursor()

    try:
        set_clause = ", ".join(f"{col} = %s" for col in updates)
        cursor.execute(
            f"UPDATE stations SET {set_clause} WHERE station_id = %s",
            list(updates.values()) + [station_id],
        )
        conn.commit()
        changed = cursor.rowcount
        cursor.close()
        conn.close()

        if changed == 0:
            return jsonify({"error": "Station not found"}), 404
        return jsonify({"message": "Station updated"})
    except Exception as e:
        conn.rollback()
        cursor.close()
        conn.close()
        return jsonify({"error": f"Failed to update station: {str(e)}"}), 500


# ---------- deactivate (soft delete) ----------
# Stations are referenced by personnel, inventory, shipments, alerts and
# expeditions, so a hard DELETE would either fail on FK constraints or
# silently orphan historical records. Deactivating keeps the row (and
# its history) intact while removing it from active operational views.
@stations_bp.route("/api/stations/<int:station_id>", methods=["DELETE"])
def deactivate_station(station_id):
    conn = get_connection()
    _ensure_columns(conn)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE stations SET status = 'decommissioned', updated_at = %s WHERE station_id = %s",
        (datetime.now(), station_id),
    )
    conn.commit()
    changed = cursor.rowcount
    cursor.close()
    conn.close()

    if changed == 0:
        return jsonify({"error": "Station not found"}), 404
    return jsonify({"message": "Station deactivated"})
