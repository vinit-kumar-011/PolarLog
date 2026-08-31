from flask import Flask
from flask_cors import CORS

from routes.inventory import inventory_bp
from routes.alerts import alerts_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(inventory_bp)
app.register_blueprint(alerts_bp)


@app.route("/")
def home():
    return {"message": "PolarLog API is running"}


if __name__ == "__main__":
    app.run(debug=True, port=5000)