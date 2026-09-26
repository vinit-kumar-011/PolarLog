from flask import Blueprint, jsonify, request, g
from db import get_connection

assistant_bp = Blueprint("assistant", __name__)


@assistant_bp.route("/api/assistant/ask", methods=["POST"])
def ask_assistant():
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").lower().strip()
    if not question:
        return jsonify({"answer": "Ask me about stock levels, shipments, or alerts."})

    # If the caller is scoped to a station (not an admin), default to
    # their station unless they explicitly name a different one below.
    current_user = getattr(g, "current_user", None)
    station_filter = None
    if current_user and current_user.get("role") != "admin" and current_user.get("station"):
        station_filter = current_user["station"]

    # Admins (or unauthenticated/testing calls with no g.current_user)
    # can ask about any station by name; station-scoped users stay
    # locked to their own station regardless of what they type.
    is_admin = not current_user or current_user.get("role") == "admin"
    if is_admin:
        for name in ["himadri", "bharati", "maitri"]:
            if name in question:
                station_filter = name.capitalize()
                break

    # If a station-scoped user typed a *different* station's name, the
    # query above still stays locked to their own station — but let them
    # know why, so the answer doesn't look like it ignored what they asked.
    scope_note = ""
    if not is_admin and station_filter:
        for name in ["himadri", "bharati", "maitri"]:
            if name in question and name.capitalize() != station_filter:
                scope_note = f" (You're scoped to {station_filter} — {name.capitalize()} data isn't visible to your account.)"
                break

    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        try:
            # --- low stock / critical ---
            if any(w in question for w in ["low", "critical", "short", "running out", "stock"]):
                q = """SELECT i.name, i.quantity, i.unit, i.status, s.name AS station
                       FROM inventory i JOIN stations s ON i.station_id = s.station_id
                       WHERE i.status IN ('low','critical')"""
                params = ()
                if station_filter:
                    q += " AND s.name = %s"
                    params = (station_filter,)
                q += " ORDER BY FIELD(i.status, 'critical', 'low'), i.name"
                cursor.execute(q, params)
                rows = cursor.fetchall()
                if not rows:
                    return jsonify({"answer": f"Nothing is low or critical{' at ' + station_filter if station_filter else ''} right now.{scope_note}"})
                items = ", ".join(f"{r['name']} ({r['quantity']} {r['unit']} at {r['station']}, {r['status']})" for r in rows)
                return jsonify({"answer": f"Running low: {items}.{scope_note}"})

            # --- shipments ---
            if any(w in question for w in ["shipment", "arriv", "when", "eta", "incoming"]):
                q = """SELECT sh.reference, sh.status, DATE_FORMAT(sh.eta,'%Y-%m-%d') AS eta, s.name AS destination
                       FROM shipments sh LEFT JOIN stations s ON sh.destination_id = s.station_id
                       WHERE sh.status IN ('pending','in_transit')"""
                params = ()
                if station_filter:
                    q += " AND s.name = %s"
                    params = (station_filter,)
                q += " ORDER BY sh.eta"
                cursor.execute(q, params)
                rows = cursor.fetchall()
                if not rows:
                    return jsonify({"answer": f"No shipments currently moving{' to ' + station_filter if station_filter else ''}.{scope_note}"})
                items = "; ".join(f"{r['reference']} to {r['destination']} — {r['status']}, ETA {r['eta']}" for r in rows)
                return jsonify({"answer": f"Moving now: {items}.{scope_note}"})

            # --- alerts ---
            if "alert" in question:
                q = """SELECT a.message, s.name AS station FROM alerts a
                       LEFT JOIN stations s ON a.station_id = s.station_id
                       WHERE a.status = 'open'"""
                params = ()
                if station_filter:
                    q += " AND s.name = %s"
                    params = (station_filter,)
                cursor.execute(q, params)
                rows = cursor.fetchall()
                if not rows:
                    return jsonify({"answer": f"No open alerts{' at ' + station_filter if station_filter else ''} right now.{scope_note}"})
                items = "; ".join(f"{r['message']} ({r['station']})" for r in rows)
                return jsonify({"answer": f"Open alerts: {items}.{scope_note}"})

            return jsonify({"answer": "Try asking about stock levels, shipments, or alerts."})
        finally:
            cursor.close()
    finally:
        conn.close()
