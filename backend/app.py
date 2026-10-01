import os
from flask import Flask, jsonify
from db import get_connection
from flask_cors import CORS

from auth_utils import check_auth
from routes.inventory import inventory_bp
from routes.alerts import alerts_bp
from routes.stations import stations_bp
from routes.weather import weather_bp
from routes.expeditions import expeditions_bp

from routes.cargo import cargo_bp
from routes.personnel import personnel_bp
from routes.shipments import shipments_bp
from routes.auth import auth_bp
from routes.assistant import assistant_bp
from routes.settings import settings_bp
from routes.admin import admin_bp
from routes.assistant_ai import assistant_ai_bp

app = Flask(__name__)
# Which websites may call this API.
#
# Development needs Live Server; production needs the deployed
# frontend. The list comes from an environment variable so the
# deployed URL is not baked into the code - and so a teammate
# who clones this gets a working local setup by default.
_allowed = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://127.0.0.1:5500,http://localhost:5500",
).split(",")

CORS(app, origins=[o.strip() for o in _allowed], supports_credentials=True)

app.register_blueprint(inventory_bp)
app.register_blueprint(alerts_bp)
app.register_blueprint(stations_bp)
app.register_blueprint(weather_bp)
app.register_blueprint(expeditions_bp)
app.register_blueprint(cargo_bp)
app.register_blueprint(personnel_bp)
app.register_blueprint(shipments_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(assistant_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(assistant_ai_bp)

# Every request (except login and the health-check "/") must carry a
# valid session token - see auth_utils.check_auth / EXEMPT_ENDPOINTS.
# Build the RAG index once, at startup
from ai import knowledge
knowledge.load()
app.before_request(check_auth)


@app.route("/api/health")
def health():
    """Real service checks for the dashboard's System Status card.
    Requires a valid session token like every other /api route."""
    import os
    from db import get_connection

    db_ok = False
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        cur.close()
        conn.close()
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "api": True,
        "database": db_ok,
        "weather_configured": True,  # Open-Meteo needs no key
    }


@app.route("/")
def home():
    return {"message": "PolarLog API is running"}

@app.route("/api/keepalive")
def keepalive():
    """Touched every few minutes by a scheduled job.

    Exists because both free tiers sleep, and they sleep for
    different reasons:

      - Render spins the service down after 15 minutes with no
        requests. Arriving here is enough to prevent that.
      - Aiven powers the database off after days with no
        connections. Merely reaching Flask would NOT prevent
        that, which is why this opens a real connection and runs
        a query rather than just returning a message.

    SELECT 1 is the cheapest possible query - it reads no table
    and returns a single constant. The point is the connection,
    not the result.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        return jsonify({"status": "ok", "database": "reachable"})
    except Exception as e:
        # Still a 200. A monitoring service that sees failures will
        # email you about them, and a database that is waking up
        # from a cold start can legitimately refuse the first
        # connection. The body says what happened.
        print(f"[keepalive] Database unreachable: {e}")
        return jsonify({"status": "degraded", "database": "unreachable"})


if __name__ == "__main__":
    # Local development only. On Render, gunicorn imports `app` directly
    # and this block never runs.
    import os
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    app.run(debug=debug, port=5000)
