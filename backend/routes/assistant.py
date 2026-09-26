from flask import Blueprint, jsonify, request
from db import get_connection

assistant_bp = Blueprint("assistant", __name__)

@assistant_bp.route("/api/assistant/ask", methods=["POST"])
def ask_assistant():
    data = request.get_json()
    question = data.get("question", "").lower()

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    station_filter = None
    for name in ["himadri", "bharati", "maitri"]:
        if name in question:
            station_filter = name.capitalize()
            break

    # --- low stock / critical ---
    if any(w in question for w in ["low", "critical", "short", "running out", "stock"]):
        q = """SELECT i.name, i.quantity, i.unit, s.name AS station
               FROM inventory i JOIN stations s ON i.station_id = s.station_id
               WHERE i.status IN ('low','critical')"""
        params = ()
        if station_filter:
            q += " AND s.name = %s"
            params = (station_filter,)
        cursor.execute(q, params)
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        if not rows:
            return jsonify({"answer": f"Nothing is low or critical{' at ' + station_filter if station_filter else ''} right now."})
        items = ", ".join(f"{r['name']} ({r['quantity']} {r['unit']} at {r['station']})" for r in rows)
        return jsonify({"answer": f"Running low: {items}."})

    # --- shipments ---
    if any(w in question for w in ["shipment", "arriv", "when", "eta", "incoming"]):
        q = """SELECT sh.reference, sh.status, DATE_FORMAT(sh.eta,'%Y-%m-%d') AS eta, s.name AS destination
               FROM shipments sh LEFT JOIN stations s ON sh.destination_id = s.station_id
               WHERE sh.status IN ('pending','in_transit')"""
        params = ()
        if station_filter:
            q += " AND s.name = %s"
            params = (station_filter,)
        cursor.execute(q, params)
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        if not rows:
            return jsonify({"answer": f"No shipments currently moving{' to ' + station_filter if station_filter else ''}."})
        items = "; ".join(f"{r['reference']} to {r['destination']} — {r['status']}, ETA {r['eta']}" for r in rows)
        return jsonify({"answer": f"Moving now: {items}."})

    # --- alerts ---
    if "alert" in question:
        cursor.execute("""SELECT a.message, s.name AS station FROM alerts a
                           LEFT JOIN stations s ON a.station_id = s.station_id WHERE a.status = 'open'""")
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        if not rows:
            return jsonify({"answer": "No open alerts right now."})
        items = "; ".join(f"{r['message']} ({r['station']})" for r in rows)
        return jsonify({"answer": f"Open alerts: {items}."})

    cursor.close(); conn.close()
    return jsonify({"answer": "Try asking about stock levels, shipments, or alerts."})