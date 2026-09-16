import os

# In production these MUST come from environment variables, not be
# committed to source control - falling back to the dev values only so
# `python app.py` still works out of the box on a fresh checkout.
DB_HOST = os.environ.get("POLARLOG_DB_HOST", "localhost")
DB_USER = os.environ.get("POLARLOG_DB_USER", "root")
DB_PASSWORD = os.environ.get("POLARLOG_DB_PASSWORD", "Vinit@2006")
DB_NAME = os.environ.get("POLARLOG_DB_NAME", "polarlog")

# ---------- auth ----------
# Used to sign/verify session tokens (JWT). In production this MUST come
# from an environment variable, not be committed to source control -
# falling back to a fixed dev value only so `python app.py` still works
# out of the box on a fresh checkout.
SECRET_KEY = os.environ.get("POLARLOG_SECRET_KEY", "dev-only-change-me-before-deploying")
TOKEN_TTL_MINUTES = 60 * 8  # 8-hour session