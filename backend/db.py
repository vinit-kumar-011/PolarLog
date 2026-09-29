import os
import threading

import mysql.connector
from mysql.connector import pooling

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


_pool = None
_pool_lock = threading.Lock()


def get_connection():
    """Borrow a connection from a small shared pool.

    Opening a fresh TLS connection to a remote database on every API call is
    slow (hundreds of ms each, per request). The pool keeps a few open and
    reuses them; conn.close() in the route code just returns it to the pool.
    Dead connections are reconnected automatically.
    """
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = pooling.MySQLConnectionPool(
                    pool_name="polarlog",
                    pool_size=int(os.environ.get("POLARLOG_DB_POOL", "6")),
                    pool_reset_session=True,
                    **connect_kwargs(),
                )
    return _pool.get_connection()