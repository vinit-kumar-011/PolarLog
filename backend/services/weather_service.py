"""
Weather service abstraction for PolarLog.

Isolated behind this module so the provider can be swapped later
(the intended provider is Google's Weather API) without touching the
weather.py route or any frontend code. The API key lives only in the
GOOGLE_WEATHER_API_KEY environment variable on the backend - it is
never sent to the browser.
"""
import os
import time
import requests

_CACHE = {}
_CACHE_TTL_SECONDS = 15 * 60  # avoid hammering the provider every page load

GOOGLE_WEATHER_ENDPOINT = "https://weather.googleapis.com/v1/currentConditions:lookup"


def get_current_conditions(latitude, longitude):
    """Returns a dict of whatever fields the provider gives us, or
    None if weather can't be fetched right now (missing key, network
    failure, no coordinates, etc). Callers must treat None as "no
    data" and show placeholders - never fabricate values here.
    """
    if latitude is None or longitude is None:
        return None

    cache_key = (round(float(latitude), 2), round(float(longitude), 2))
    cached = _CACHE.get(cache_key)
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL_SECONDS:
        return cached["data"]

    api_key = os.environ.get("GOOGLE_WEATHER_API_KEY")
    if not api_key:
        return None

    try:
        resp = requests.get(
            GOOGLE_WEATHER_ENDPOINT,
            params={
                "key": api_key,
                "location.latitude": latitude,
                "location.longitude": longitude,
            },
            timeout=5,
        )
        if resp.status_code != 200:
            return None
        payload = resp.json()
    except (requests.RequestException, ValueError):
        return None

    # Normalize into a small, stable shape the frontend can rely on
    # regardless of which provider is behind this function.
    data = {
        "temperature_c": _dig(payload, "temperature", "degrees"),
        "condition": _dig(payload, "weatherCondition", "description", "text"),
        "wind_kph": _dig(payload, "wind", "speed", "value"),
        "humidity_pct": _dig(payload, "relativeHumidity"),
        "updated_at": _dig(payload, "currentTime"),
    }

    _CACHE[cache_key] = {"ts": time.time(), "data": data}
    return data


def _dig(obj, *path):
    for key in path:
        if not isinstance(obj, dict) or key not in obj:
            return None
        obj = obj[key]
    return obj