from flask import Blueprint, jsonify
import requests

weather_bp = Blueprint("weather", __name__)


# Station coordinates
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


@weather_bp.route("/api/weather/<station_name>", methods=["GET"])
def get_weather(station_name):

    station = STATIONS.get(station_name.lower())

    if station is None:
        return jsonify({"error": "Station not found"}), 404

    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": station["latitude"],
        "longitude": station["longitude"],
        "current": (
            "temperature_2m,"
            "relative_humidity_2m,"
            "wind_speed_10m,"
            "wind_direction_10m,"
            "weather_code"
        ),
        "hourly": (
            "temperature_2m,"
            "precipitation_probability,"
            "snowfall,"
            "wind_speed_10m"
        ),
        "forecast_days": 3,
        "timezone": "auto"
    }

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return jsonify({
            "error": "Weather service unavailable"
        }), 502

    data = response.json()

    return jsonify({
        "station": station["name"],
        "latitude": station["latitude"],
        "longitude": station["longitude"],
        "current": data.get("current"),
        "current_units": data.get("current_units"),
        "hourly": data.get("hourly"),
        "hourly_units": data.get("hourly_units")
    })