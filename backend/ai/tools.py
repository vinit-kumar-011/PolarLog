"""
The complete menu of things the AI assistant may do.

SECURITY: every query here is fixed SQL with %s placeholders.
The model chooses WHICH function and WHAT arguments.
It never writes SQL. There is no path from a prompt to arbitrary SQL.
"""

from db import get_connection


def _rows(query, params=()):
    """Run a read-only query and return the rows as dictionaries."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(query, params)
    result = cursor.fetchall()
    cursor.close()
    conn.close()
    return result


# ---------------------------------------------------------------
# The tool functions
# ---------------------------------------------------------------

def get_inventory(station=None, category=None, only_low=False):
    """Stock levels, optionally filtered."""
    query = """
        SELECT i.name AS item_name, i.category, i.quantity, i.unit,
               i.reorder_level, s.name AS station
        FROM inventory i
        JOIN stations s ON i.station_id = s.station_id
        WHERE 1 = 1
    """
    params = []

    if station:
        query += " AND s.name = %s"
        params.append(station)
    if category:
        query += " AND i.category = %s"
        params.append(category)
    if only_low:
        query += " AND i.quantity <= i.reorder_level"

    query += " ORDER BY s.name, i.name LIMIT 60"
    return _rows(query, tuple(params))


def get_alerts(severity=None, station=None):
    """Open alerts."""
    query = """
        SELECT a.message, a.severity, a.alert_type, a.status,
               a.created_at, s.name AS station
        FROM alerts a
        LEFT JOIN stations s ON a.station_id = s.station_id
        WHERE 1 = 1
    """
    params = []

    if severity:
        query += " AND a.severity = %s"
        params.append(severity)
    if station:
        query += " AND s.name = %s"
        params.append(station)

    query += " ORDER BY a.created_at DESC LIMIT 40"
    return _rows(query, tuple(params))


def get_shipments(status=None, station=None):
    """Shipments in and out."""
    query = """
        SELECT sh.reference, sh.status, sh.origin, sh.destination,
               sh.eta, sh.departure
        FROM shipments sh
        WHERE 1 = 1
    """
    params = []

    if status:
        query += " AND sh.status = %s"
        params.append(status)
    if station:
        query += " AND (sh.origin LIKE %s OR sh.destination LIKE %s)"
        params.extend(["%" + station + "%", "%" + station + "%"])

    query += " ORDER BY sh.eta LIMIT 40"
    return _rows(query, tuple(params))


def get_stations():
    """All stations and their status."""
    return _rows(
        """
        SELECT station_id, name, region, status
        FROM stations
        ORDER BY station_id
        """
    )


def get_personnel(station=None):
    """Who is deployed where."""
    query = """
        SELECT p.name, p.role, p.status, s.name AS station
        FROM personnel p
        LEFT JOIN stations s ON p.station_id = s.station_id
        WHERE 1 = 1
    """
    params = []

    if station:
        query += " AND s.name = %s"
        params.append(station)

    query += " ORDER BY s.name, p.name LIMIT 60"
    return _rows(query, tuple(params))


# ---------------------------------------------------------------
# The menu shown to the model
# ---------------------------------------------------------------

AVAILABLE = {
    "get_inventory": get_inventory,
    "get_alerts": get_alerts,
    "get_shipments": get_shipments,
    "get_stations": get_stations,
    "get_personnel": get_personnel,
}

STATION_NAMES = ["Bharati", "Maitri", "Himadri", "Himansh"]

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_inventory",
            "description": (
                "Stock levels at research stations. Use for any question "
                "about supplies, fuel, food, medical items or equipment, "
                "and for what is running low."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "station": {
                        "type": "string",
                        "enum": STATION_NAMES,
                        "description": "Limit to one station. Omit for all.",
                    },
                    "category": {
                        "type": "string",
                        "enum": ["Fuel", "Food", "Medical", "Equipment"],
                        "description": "Limit to one category. Omit for all.",
                    },
                    "only_low": {
                        "type": "boolean",
                        "description": "True returns only items at or below reorder level.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_alerts",
            "description": (
                "Active alerts and warnings. Use for what needs attention, "
                "what is critical, or what is wrong."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "warning", "info"],
                    },
                    "station": {"type": "string", "enum": STATION_NAMES},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_shipments",
            "description": (
                "Shipments between stations and supply points. Use for "
                "deliveries, what is in transit, and arrival times."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_transit", "delivered", "delayed"],
                    },
                    "station": {"type": "string", "enum": STATION_NAMES},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stations",
            "description": "All research stations, their regions and operational status.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_personnel",
            "description": "People deployed at stations, their roles and status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "station": {"type": "string", "enum": STATION_NAMES},
                },
            },
        },
    },
]