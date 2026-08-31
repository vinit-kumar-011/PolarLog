from db import get_connection

conn = get_connection()
cursor = conn.cursor(dictionary=True)
cursor.execute("SELECT name, quantity, unit, status FROM inventory WHERE station_id = 3")
rows = cursor.fetchall()

for row in rows:
    print(row["name"], "-", row["quantity"], row["unit"], "-", row["status"])

cursor.close()
conn.close()