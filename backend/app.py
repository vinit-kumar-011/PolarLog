import os

from flask import Flask, redirect, request
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

# One service serves both the API (/api/...) and the frontend (/pages/...,
# /css/..., /js/...), so the browser talks to a single origin in production.
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

# Same-origin in production, so CORS is only needed for local dev where the
# frontend may be opened from another port (e.g. VS Code Live Server).
# Set POLARLOG_CORS_ORIGINS="https://a.com,https://b.com" to allow others.
_extra = [o.strip() for o in os.environ.get("POLARLOG_CORS_ORIGINS", "").split(",") if o.strip()]
CORS(app, origins=[r"http://(localhost|127\.0\.0\.1)(:\d+)?"] + _extra)

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

# Every request (except login and the health-check "/") must carry a
# valid session token - see auth_utils.check_auth / EXEMPT_ENDPOINTS.
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
        "weather_configured": bool(os.environ.get("WEATHERAPI_KEY")),
    }


@app.route("/")
def home():
    # Browsers opening the site get the landing page; API clients (and the
    # Settings page's connectivity check) get the JSON status.
    if request.accept_mimetypes.best == "text/html":
        return redirect("/pages/index.html")
    return {"message": "PolarLog API is running"}


@app.route("/healthz")
def healthz():
    """Cheap unauthenticated liveness check for the hosting platform.
    /healthz?db=1 also touches the database (handy for an uptime pinger that
    should keep a free-tier database from going idle)."""
    if request.args.get("db") == "1":
        from db import get_connection
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
            cur.close()
            conn.close()
        except Exception:
            return {"status": "db-unreachable"}, 503
    return {"status": "ok"}


if __name__ == "__main__":
    # Local dev only. In production gunicorn imports `app` (see Procfile).
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=int(os.environ.get("PORT", 5000)))
