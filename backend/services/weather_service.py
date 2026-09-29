"""
Weather service abstraction for PolarLog.

Provider: Open-Meteo (https://open-meteo.com)
  - No API key, no signup, no billing account
  - Free for non-commercial use, ~10,000 calls/day
  - Data from national weather services (DWD, NOAA, MeteoFrance, ...)

The public shape of this module is deliberately unchanged from the
Google implementation: get_current_conditions(lat, lon) returns the
same dictionary, or None. Nothing upstream needed editing.
"""

import time
import requests

_CACHE = {}
_CACHE_TTL_SECONDS = 15 * 60  # avoid hammering the provider every page load

ENDPOINT = "https://api.open-meteo.com/v1/forecast"

# WMO weather interpretation codes.
# https://open-meteo.com/en/docs  ->  "Weather variable documentation"
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


def get_current_conditions(latitude, longitude):
    """Returns a dict of current conditions, or None if weather can't be
    fetched right now (network failure, no coordinates, bad response).
    Callers must treat None as "no data" and show placeholders - never
    fabricate values here.
    """
    if latitude is None or longitude is None:
        return None

    cache_key = (round(float(latitude), 2), round(float(longitude), 2))
    cached = _CACHE.get(cache_key)
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL_SECONDS:
        return cached["data"]

    try:
        resp = requests.get(
            ENDPOINT,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": (
                    "temperature_2m,relative_humidity_2m,"
                    "wind_speed_10m,weather_code"
                ),
                "wind_speed_unit": "kmh",
                "timezone": "UTC",
            },
            timeout=5,
        )
        if resp.status_code != 200:
            print(f"[weather] Provider returned {resp.status_code}")
            return None
        payload = resp.json()
    except (requests.RequestException, ValueError) as e:
        print(f"[weather] Could not fetch: {e}")
        return None

    current = payload.get("current")
    if not isinstance(current, dict):
        return None

    code = current.get("weather_code")

    # Same shape the Google implementation returned, so nothing
    # upstream has to change.
    data = {
        "temperature_c": current.get("temperature_2m"),
        "condition": WMO_CODES.get(code, "Unknown"),
        "wind_kph": current.get("wind_speed_10m"),
        "humidity_pct": current.get("relative_humidity_2m"),
        "updated_at": current.get("time"),
    }

    _CACHE[cache_key] = {"ts": time.time(), "data": data}
    return data