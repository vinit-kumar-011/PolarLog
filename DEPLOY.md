# Deploying PolarLog on Railway

One Railway project = one web service (Flask API **and** the frontend) + one MySQL database.

## 1. Push to GitHub
Make sure `backend/.env` is NOT committed (it is in `.gitignore`). Then push.

## 2. Create the project
1. railway.com -> **New Project -> Deploy from GitHub repo** -> pick this repo.
   `railway.json` / `Procfile` already define the start command and health check.
2. In the same project: **+ New -> Database -> Add MySQL**.

## 3. Variables (web service -> Variables)
Add these (use "Add Reference" for the five MySQL ones; the database service is called `MySQL`):

| Variable | Value |
|---|---|
| `MYSQLHOST` | `${{MySQL.MYSQLHOST}}` |
| `MYSQLPORT` | `${{MySQL.MYSQLPORT}}` |
| `MYSQLUSER` | `${{MySQL.MYSQLUSER}}` |
| `MYSQLPASSWORD` | `${{MySQL.MYSQLPASSWORD}}` |
| `MYSQLDATABASE` | `${{MySQL.MYSQLDATABASE}}` |
| `POLARLOG_SECRET_KEY` | output of `python -c "import secrets; print(secrets.token_hex(32))"` |
| `POLARLOG_ADMIN_PASSWORD` | the password you want for the `admin` user |
| `WEATHERAPI_KEY` | optional, your weatherapi.com key |
| `POLARLOG_KEEP_DEMO_USERS` | optional, `1` = keep the public demo logins (coord2026 etc.) |

The app refuses to start on Railway without `POLARLOG_SECRET_KEY`.

## 4. Public URL
Web service -> **Settings -> Networking -> Generate Domain**.

## 5. First deploy
On start, `backend/init_db.py` creates all tables, loads the seed data and sets the admin
password. Check the deploy logs for `[init_db] done`. It is safe on every later deploy
(it detects it already ran). After the first successful deploy you can delete
`POLARLOG_ADMIN_PASSWORD` from the variables.

Open the domain, sign in as `admin`.

## Notes
- Password-reset codes are still printed to the deploy logs (email_utils.py console mode),
  not emailed. Remove the two marked lines there and set `SMTP_*` to send real email.
- After changing frontend files, bump `CACHE_NAME` in `frontend/pages/sw.js` so installed
  PWAs pick up the new version.
- Local dev is unchanged: `cd backend && python app.py`, then open http://localhost:5000
