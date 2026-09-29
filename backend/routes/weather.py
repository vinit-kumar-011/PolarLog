"""
Weather for the station panels.

Two providers, tried in order:

  1. WeatherAPI  - needs a key, but identifies you BY THAT KEY
  2. Open-Meteo  - no key, but identifies you BY IP ADDRESS

The order matters. Open-Meteo alone worked in development and failed
in production with HTTP 429: Render's free tier shares outbound IP
addresses between many apps, so the collective traffic from that
address exceeded a limit that had nothing to do with us. A key-based
provider is immune to that, because the key is ours wherever the
request comes from.

Open-Meteo stays as a fallback - it still works from a laptop, and it
needs no signup, so a teammate who hasn't set WEATHERAPI_KEY still
gets working weather locally.

The response shape is unchanged - the same "current" and "location"
objects - so no frontend code needs editing.
"""

import time

from flask import Blueprint, jsonify
import requests

import config
from db import get_connection

weather_bp = Blueprint("weather", __name__)

# Known stations with hardcoded coordinates. Anything added later
# through the UI is found in the database instead - see below.
STATIONS = {
    "bharati": {"name": "Bharati", "latitude": -69.405, "longitude": 76.188},
    "maitri": {"name": "Maitri", "latitude": -70.769, "longitude": 11.733},
    "himadri": {"name": "Himadri", "latitude": 78.923, "longitude": 11.933},
    "himansh": {"name": "Himansh", "latitude": 32.400, "longitude": 77.617},
}

WEATHERAPI_URL = "https://api.weatherapi.com/v1/current.json"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Cache per station, so four panels on one page don't mean four
# fetches every time somebody refreshes.
_CACHE = {}
_CACHE_TTL_SECONDS = 15 * 60

# WMO weather interpretation codes -> readable text.
# Only needed for the Open-Meteo fallback; WeatherAPI sends text.
# https://open-meteo.com/en/docs
WMO_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


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


def _fetch_weatherapi(latitude, longitude):
    """Current conditions from WeatherAPI, or None on any failure."""
    if not config.WEATHERAPI_KEY:
        return None

    try:
        response = requests.get(
            WEATHERAPI_URL,
            params={
                "key": config.WEATHERAPI_KEY,
                "q": f"{latitude},{longitude}",
                "aqi": "no",
            },
            timeout=10,
        )
    except requests.RequestException as e:
        print(f"[weather] WeatherAPI network problem: {e}")
        return None

    if response.status_code != 200:
        print(f"[weather] WeatherAPI returned {response.status_code}")
        return None

    try:
        current = response.json().get("current")
    except ValueError:
        print("[weather] WeatherAPI sent an unreadable response")
        return None

    if not isinstance(current, dict):
        return None

    condition = current.get("condition") or {}

    # WeatherAPI's field names are already what the frontend expects,
    # but they are copied across explicitly rather than passed through
    # whole - so a change at their end can't quietly reshape our API.
    return {
        "temp_c": current.get("temp_c"),
        "feelslike_c": current.get("feelslike_c"),
        "humidity": current.get("humidity"),
        "wind_kph": current.get("wind_kph"),
        "condition": {
            "text": condition.get("text", "Unknown"),
            "code": condition.get("code"),
            "icon": condition.get("icon", ""),
        },
        "last_updated": current.get("last_updated"),
    }


def _fetch_open_meteo(latitude, longitude):
    """Fallback provider. No key needed, but rate-limited by IP -
    which is why it cannot be the only option in production."""
    try:
        response = requests.get(
            OPEN_METEO_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": (
                    "temperature_2m,apparent_temperature,"
                    "relative_humidity_2m,wind_speed_10m,weather_code"
                ),
                "wind_speed_unit": "kmh",
                "timezone": "UTC",
            },
            timeout=10,
        )
    except requests.RequestException as e:
        print(f"[weather] Open-Meteo network problem: {e}")
        return None

    if response.status_code != 200:
        print(f"[weather] Open-Meteo returned {response.status_code}")
        return None

    try:
        current = response.json().get("current")
    except ValueError:
        print("[weather] Open-Meteo sent an unreadable response")
        return None

    if not isinstance(current, dict):
        return None

    code = current.get("weather_code")

    return {
        "temp_c": current.get("temperature_2m"),
        "feelslike_c": current.get("apparent_temperature"),
        "humidity": current.get("relative_humidity_2m"),
        "wind_kph": current.get("wind_speed_10m"),
        "condition": {
            "text": WMO_CODES.get(code, "Unknown"),
            "code": code,
            "icon": "",
        },
        "last_updated": current.get("time"),
    }


def _fetch(latitude, longitude):
    """Cached current conditions. WeatherAPI first, Open-Meteo second."""
    cache_key = (round(latitude, 2), round(longitude, 2))
    cached = _CACHE.get(cache_key)
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL_SECONDS:
        return cached["data"]

    data = _fetch_weatherapi(latitude, longitude)

    if data is None:
        print("[weather] Falling back to Open-Meteo")
        data = _fetch_open_meteo(latitude, longitude)

    if data is not None:
        _CACHE[cache_key] = {"ts": time.time(), "data": data}

    return data


@weather_bp.route("/api/weather/<station_name>", methods=["GET"])
def get_weather(station_name):
    station = STATIONS.get(station_name.lower())

    if station is None:
        station = _lookup_station_in_db(station_name)

    if station is None:
        return jsonify({"error": "Station not found"}), 404

    current = _fetch(station["latitude"], station["longitude"])

    if current is None:
        # No fabricated numbers - if we can't reach either provider,
        # say so rather than returning a broken 200.
        return jsonify({"error": "Weather service unavailable"}), 502

    return jsonify({
        "station": station["name"],
        "latitude": station["latitude"],
        "longitude": station["longitude"],
        "current": current,
        "location": {
            "name": station["name"],
            "lat": station["latitude"],
            "lon": station["longitude"],
        },
    })