from functools import wraps

from flask import g, jsonify

# ⚠ Must match your database exactly. Run this to check:
#   SELECT DISTINCT role FROM users;
ADMIN_ROLES = ["admin"]


def role_required(*allowed_roles):
    """
    @role_required("admin", "coordinator") above a route means only
    those roles get through. Everyone else gets 403.

    Reads g.current_user, which auth_utils.check_auth() already put
    there - so this only ever sees authenticated requests.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = getattr(g, "current_user", None)

            if user is None:
                return jsonify({"error": "Not authenticated"}), 401

            if user.get("role") not in allowed_roles:
                return jsonify({
                    "error": "You do not have permission to do this"
                }), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator


def admin_required(fn):
    """Shortcut for admin-only routes."""
    return role_required(*ADMIN_ROLES)(fn)