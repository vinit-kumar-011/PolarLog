import mysql.connector
import config


def connect_kwargs():
    """Connection settings, shared with backend/init_db.py."""
    kw = dict(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
        connection_timeout=10,
    )
    if config.DB_SSL_CA:
        kw.update(ssl_ca=config.DB_SSL_CA, ssl_verify_cert=True)
    return kw


def get_connection():
    """Open a new connection to the PolarLog database."""
    return mysql.connector.connect(**connect_kwargs())