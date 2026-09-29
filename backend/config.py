import os
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv
load_dotenv()

# In production these MUST come from environment variables, not be
# committed to source control - falling back to the dev values only so
# `python app.py` still works out of the box on a fresh checkout.
# Railway's MySQL plugin exposes MYSQLHOST / MYSQLPORT / MYSQLUSER /
# MYSQLPASSWORD / MYSQLDATABASE - we accept those too, so a hosted deploy
# needs no extra DB variables. POLARLOG_DB_* wins if both are set.
def _env(*names, default=""):
    for n in names:
        v = os.environ.get(n)
        if v:
            return v
    return default

# A single connection string also works (Aiven calls it the "Service URI"):
#   POLARLOG_DB_URL=mysql://user:password@host:port/dbname?ssl-mode=REQUIRED
# The individual variables above/below still win if both are given.
_url = _env("POLARLOG_DB_URL", "DATABASE_URL")
_u = urlparse(_url) if _url else None

DB_HOST = _env("POLARLOG_DB_HOST", "MYSQLHOST", default=(_u.hostname if _u and _u.hostname else "localhost"))
DB_PORT = int(_env("POLARLOG_DB_PORT", "MYSQLPORT", default=str(_u.port if _u and _u.port else 3306)))
DB_USER = _env("POLARLOG_DB_USER", "MYSQLUSER", default=(unquote(_u.username) if _u and _u.username else "root"))
DB_PASSWORD = _env("POLARLOG_DB_PASSWORD", "MYSQLPASSWORD", default=(unquote(_u.password) if _u and _u.password else ""))
DB_NAME = _env("POLARLOG_DB_NAME", "MYSQLDATABASE", default=((_u.path or "").lstrip("/") if _u and _u.path.strip("/") else "polarlog"))
# Optional: path to the provider's CA certificate to fully verify the TLS
# connection (Aiven lets you download it). Without it the connection is still
# encrypted whenever the server offers TLS.
DB_SSL_CA = os.environ.get("POLARLOG_DB_SSL_CA", "")

# True when running on Railway / Render (they set RAILWAY_ENVIRONMENT / RENDER). Used to refuse
# to boot with insecure dev defaults.
IS_PRODUCTION = bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RENDER")) or os.environ.get("POLARLOG_ENV") == "production"

# ---------- auth ----------
# Used to sign/verify session tokens (JWT). In production this MUST come
# from an environment variable, not be committed to source control -
# falling back to a fixed dev value only so `python app.py` still works
# out of the box on a fresh checkout.
SECRET_KEY = os.environ.get("POLARLOG_SECRET_KEY", "dev-only-change-me-before-deploying")
if IS_PRODUCTION and SECRET_KEY == "dev-only-change-me-before-deploying":
    raise RuntimeError("POLARLOG_SECRET_KEY must be set to a long random value in production")
TOKEN_TTL_MINUTES = 60 * 8  # 8-hour session

# ---------- email (password-reset codes) ----------
# Read from the environment / backend/.env. Empty by default: while the
# temporary console-OTP mode in email_utils.py is active, none are needed.
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465") or 465)
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")