import os

import mysql.connector

import config

# Aiven's CA certificate, if it's been downloaded into backend/
_SSL_CA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aiven-ca.pem")


def get_connection():
    """Open a new connection to the PolarLog database.

    Works against local MySQL (no TLS, port 3306) and against a cloud
    provider such as Aiven (TLS required, non-standard port). Which one
    is decided entirely by the values in .env - no code changes needed
    to switch.
    """
    params = {
        "host": config.DB_HOST,
        "port": config.DB_PORT,
        "user": config.DB_USER,
        "password": config.DB_PASSWORD,
        "database": config.DB_NAME,
    }

    # Cloud databases require TLS. Local MySQL has no certificate, so
    # forcing TLS there just fails - hence the switch rather than
    # always-on.
    if config.DB_SSL:
        params["ssl_disabled"] = False
        if os.path.exists(_SSL_CA):
            params["ssl_ca"] = _SSL_CA

    return mysql.connector.connect(**params)