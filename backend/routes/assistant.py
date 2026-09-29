"""
The chat bubble's endpoint.

This used to be a keyword-matching bot. It now forwards to the AI agent,
which does tool calling and RAG.

The URL and the response shape are unchanged, so the frontend needs no
edits - it just starts getting much better answers.
"""

import time
from flask import Blueprint, jsonify, request, g

from ai.agent import ask as ai_ask

assistant_bp = Blueprint("assistant", __name__)

# Per-user throttle, same as the /api/ai/ask endpoint
_last_call = {}
MIN_SECONDS_BETWEEN = 2


@assistant_bp.route("/api/assistant/ask", methods=["POST"])
def ask_assistant():
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()

    if not question:
        return jsonify({
            "answer": "Ask me about stock levels, shipments, alerts or people."
        })

    if len(question) > 500:
        return jsonify({"answer": "That question is a bit long - try a shorter one."})

    user = getattr(g, "current_user", None)
    if user is None:
        return jsonify({"error": "Not authenticated"}), 401

    # Throttle - protects the free tier from a held-down Enter key
    user_id = user.get("user_id")
    now = time.time()
    if now - _last_call.get(user_id, 0) < MIN_SECONDS_BETWEEN:
        return jsonify({"answer": "One moment - still thinking about the last one."})
    _last_call[user_id] = now

    try:
        result = ai_ask(question, user=user)
    except Exception as e:
        print(f"[assistant] Failed: {e}")
        return jsonify({
            "answer": "I can't reach my reasoning service right now. Try again shortly."
        })

    # Same "answer" key the frontend already reads, plus two extra fields
    # it will simply ignore.
    return jsonify(result)