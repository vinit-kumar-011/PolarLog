import time
from flask import Blueprint, request, jsonify, g

from ai.agent import ask

assistant_ai_bp = Blueprint("assistant_ai", __name__)

# Simple per-user rate limit, held in memory
_last_call = {}
MIN_SECONDS_BETWEEN = 2


@assistant_ai_bp.route("/api/ai/ask", methods=["POST"])
def assistant_ask():
    user = getattr(g, "current_user", None)
    if user is None:
        return jsonify({"error": "Not authenticated"}), 401

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()

    if not question:
        return jsonify({"error": "Ask me something"}), 400
    if len(question) > 500:
        return jsonify({"error": "That question is too long"}), 400

    # Throttle: protects your Groq free tier from a held-down key
    user_id = user.get("user_id")
    now = time.time()
    if now - _last_call.get(user_id, 0) < MIN_SECONDS_BETWEEN:
        return jsonify({"error": "Slow down a moment"}), 429
    _last_call[user_id] = now

    try:
        result = ask(question, user=user)
    except Exception as e:
        print(f"[assistant] Failed: {e}")
        return jsonify({"error": "The assistant is unavailable right now"}), 503

    return jsonify(result), 200


@assistant_ai_bp.route("/api/ai/status", methods=["GET"])
def assistant_status():
    from ai import knowledge
    return jsonify(knowledge.status()), 200