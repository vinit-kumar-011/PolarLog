import datetime

import jwt
from flask import g, jsonify, request

import config


def generate_token(user):
    """Create a signed session token for a logged-in user."""
    now = datetime.datetime.utcnow()
    payload = {
        "user_id": user["user_id"],
        "username": user["username"],
        "role": user["role"],
        "station_id": user["station_id"],
        "station": user.get("station"),
        "iat": now,
        "exp": now + datetime.timedelta(minutes=config.TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm="HS256")


def decode_token(token):
    """Return the token payload, or None if missing/expired/invalid."""
    try:
        return jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


# Endpoints that don't require a valid session token.
# (Flask "endpoint" names, i.e. <blueprint_name>.<view_function_name>.)
EXEMPT_ENDPOINTS = {
    "home",
    "auth.login",
}


def check_auth():
    """
    Runs before every request (registered in app.py). Blocks any
    request to a non-exempt endpoint that doesn't carry a valid
    'Authorization: Bearer <token>' header, and stashes the decoded
    user on flask.g for route handlers that want it (e.g. to scope
    a query to the caller's station).
    """
    if request.method == "OPTIONS":
        return None  # let CORS preflight through

    if request.endpoint in EXEMPT_ENDPOINTS or request.endpoint is None:
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Not authenticated"}), 401

    token = auth_header[len("Bearer "):].strip()
    payload = decode_token(token)
    if payload is None:
        return jsonify({"error": "Session expired or invalid, please log in again"}), 401

    g.current_user = payload
    return None
