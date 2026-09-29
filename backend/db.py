import mysql.connector
import config


def get_connection():
    """Open a new connection to the PolarLog database."""
    return mysql.connector.connect(
        host=config.DB_HOST,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME
    )