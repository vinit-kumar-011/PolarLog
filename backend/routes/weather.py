import os

from flask import Blueprint, jsonify
import requests

from db import get_connection

# Active weather provider: WeatherAPI.com (swapped in from
# weather_weatherapi.py). The previous Open-Meteo version is kept at
# routes/weather_openmeteo_backup.py in case you want to switch back -
# just swap the two file names again, no other code changes needed.
# Requires the WEATHERAPI_KEY env var (free signup, no credit card -
# https://www.weatherapi.com/signup.aspx).

weather_bp = Blueprint("weather", __name__)

# Same fixed station list as the Open-Meteo version, so this is a
# true drop-in replacement with no other code changes required.
STATIONS = {
    "bharati": {
        "name": "Bharati",
        "latitude": -69.405,
        "longitude": 76.188
    },
    "maitri": {
        "name": "Maitri",
        "latitude": -70.769,
        "longitude": 11.733
    },
    "himadri": {
        "name": "Himadri",
        "latitude": 78.923,
        "longitude": 11.933
    }
}

WEATHERAPI_URL = "http://api.weatherapi.com/v1/current.json"


def _lookup_station_in_db(station_name):
    """Fallback for stations added later via the UI (not in STATIONS).
    Matches on name, case-insensitively, and needs coordinates on file.
    Returns the same shape as a STATIONS entry, or None."""
    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT name, latitude, longitude FROM stations "
            "WHERE LOWER(name) = %s AND latitude IS NOT NULL "
            "AND longitude IS NOT NULL LIMIT 1",
            (station_name.lower(),),
        )
        row = cursor.fetchone()
        cursor.close()
    finally:
        conn.close()
    if not row:
        return None
    return {
        "name": row["name"],
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
    }


@weather_bp.route("/api/weather/<station_name>", methods=["GET"])
def get_weather(station_name):

    station = STATIONS.get(station_name.lower())

    if station is None:
        station = _lookup_station_in_db(station_name)

    if station is None:
        return jsonify({"error": "Station not found"}), 404

    api_key = os.environ.get("WEATHERAPI_KEY")
    if not api_key:
        # No fabricated numbers - if the key isn't configured, say so
        # explicitly rather than returning a broken 200.
        return jsonify({"error": "Weather API key not configured"}), 502

    params = {
        "key": api_key,
        "q": f"{station['latitude']},{station['longitude']}",
        "aqi": "no",
    }

    try:
        response = requests.get(WEATHERAPI_URL, params=params, timeout=10)
    except requests.RequestException:
        return jsonify({"error": "Weather service unavailable"}), 502

    if response.status_code != 200:
        return jsonify({"error": "Weather service unavailable"}), 502

    data = response.json()

    return jsonify({
        "station": station["name"],
        "latitude": station["latitude"],
        "longitude": station["longitude"],
        # Passed through as-is (temp_c, humidity, wind_kph, condition.text,
        # condition.icon, condition.code, feelslike_c, etc.) - same
        # "proxy the provider's own current object" convention as the
        # Open-Meteo version.
        "current": data.get("current"),
        "location": data.get("location"),
    })
