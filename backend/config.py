import os
from dotenv import load_dotenv
load_dotenv()

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

# ---------- email (password-reset codes) ----------
# Read from the environment / backend/.env. Empty by default: while the
# temporary console-OTP mode in email_utils.py is active, none are needed.
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465") or 465)
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")

# ---------- AI assistant ----------
# Real values live in backend/.env, which is never committed.
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

JINA_API_KEY = os.environ.get("JINA_API_KEY", "")
JINA_MODEL = os.environ.get("JINA_MODEL", "jina-embeddings-v3")