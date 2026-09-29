"""
One-time database setup for a fresh (e.g. Railway) MySQL database.

Runs schema.sql, seed.sql and the add_*.sql migrations in order against the
database configured in the environment, then sets the admin password.

Safe to run on every deploy: once it has finished successfully it records a
marker table and every later run exits immediately.

  POLARLOG_ADMIN_PASSWORD   password to set for the seeded `admin` user
                            (required on first run; the seed ships with
                            placeholder hashes nobody can log in with)
  POLARLOG_KEEP_DEMO_USERS  set to 1 to keep the other seeded users
                            (coord, bhr_office, ...) with their PUBLIC demo
                            passwords from the README. Leave unset on a real
                            site: they are then locked with random passwords.
"""
import os
import secrets
import sys

import mysql.connector
from werkzeug.security import generate_password_hash

import config
import db

SQL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "database")
FILES = [
    "schema.sql",
    "seed.sql",
    "add_auth_system.sql",
    "add_user_settings.sql",
    "add_daily_usage.sql",
]
MARKER = "_polarlog_init"


def split_statements(sql):
    """Split a SQL script on ';', respecting quotes and comments."""
    out, buf, i, n = [], [], 0, len(sql)
    quote = None
    while i < n:
        c = sql[i]
        if quote:
            buf.append(c)
            if c == "\\" and quote != "`" and i + 1 < n:
                buf.append(sql[i + 1])
                i += 1
            elif c == quote:
                if i + 1 < n and sql[i + 1] == quote:  # doubled quote = escaped
                    buf.append(sql[i + 1])
                    i += 1
                else:
                    quote = None
        elif c in ("'", '"', "`"):
            quote = c
            buf.append(c)
        elif sql.startswith("--", i) and (i + 2 >= n or sql[i + 2] in " \t\r\n"):
            while i < n and sql[i] != "\n":
                i += 1
            continue
        elif c == "#":
            while i < n and sql[i] != "\n":
                i += 1
            continue
        elif sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            i = n if j == -1 else j + 1
        elif c == ";":
            stmt = "".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf = []
        else:
            buf.append(c)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def wanted(stmt):
    """Skip statements that pick/create a database - we use the one we're given."""
    head = stmt.lstrip().upper()
    return not (head.startswith("USE ") or head.startswith("CREATE DATABASE"))


def run_file(cur, name):
    with open(os.path.join(SQL_DIR, name), encoding="utf-8-sig") as f:
        stmts = [s for s in split_statements(f.read()) if wanted(s)]
    for s in stmts:
        cur.execute(s)
        if cur.with_rows:
            cur.fetchall()
    print(f"[init_db] {name}: {len(stmts)} statements")


def main():
    keep_demo = os.environ.get("POLARLOG_KEEP_DEMO_USERS") == "1"
    conn = mysql.connector.connect(**db.connect_kwargs(), autocommit=True)
    cur = conn.cursor(buffered=True)

    cur.execute("SHOW TABLES LIKE %s", (MARKER,))
    if cur.fetchone():
        print("[init_db] already initialised - nothing to do")
        return 0

    cur.execute("SHOW TABLES LIKE 'users'")
    if cur.fetchone():
        print("[init_db] ERROR: tables exist but setup never finished. Use a fresh, "
              "empty database (or drop the tables) and redeploy.")
        return 1

    admin_pw = os.environ.get("POLARLOG_ADMIN_PASSWORD", "")
    if not admin_pw:
        print("[init_db] ERROR: set POLARLOG_ADMIN_PASSWORD before the first deploy "
              "(otherwise nobody could log in).")
        return 1

    for name in FILES:
        run_file(cur, name)
    cur.execute("UPDATE users SET password_hash=%s WHERE username='admin'",
                (generate_password_hash(admin_pw),))
    print("[init_db] admin password set")
    if keep_demo:
        print("[init_db] KEEPING public demo users (POLARLOG_KEEP_DEMO_USERS=1)")
    else:
        cur.execute("SELECT user_id FROM users WHERE username <> 'admin'")
        for (uid,) in cur.fetchall():
            cur.execute("UPDATE users SET password_hash=%s WHERE user_id=%s",
                        (generate_password_hash(secrets.token_urlsafe(32)), uid))
        print("[init_db] seeded demo users locked with random passwords")

    cur.execute(f"CREATE TABLE {MARKER} (id TINYINT PRIMARY KEY, done_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    cur.execute(f"INSERT INTO {MARKER} (id) VALUES (1)")
    print("[init_db] done")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:  # never take the web service down because of setup
        print(f"[init_db] FAILED: {err}")
        sys.exit(1)
