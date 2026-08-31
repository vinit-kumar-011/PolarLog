# PolarLog API

Base URL while developing: http://localhost:5000

Owner: ayusman (inventory, cargo, alerts) · Prateek (stations, expeditions, personnel, shipments)

---

## GET /api/inventory

Everything held at every station.

```json
[
  {
    "item_id": 9,
    "name": "Diesel",
    "category": "fuel",
    "quantity": 340,
    "unit": "litres",
    "reorder_level": 900,
    "status": "critical",
    "station": "Himadri"
  }
]
```

## GET /api/inventory/low-stock

Only items at or below reorder level, worst first. Same fields as above.

## GET /api/alerts

```json
[
  {
    "alert_id": 1,
    "alert_type": "critical_stock",
    "severity": "critical",
    "message": "Diesel at Himadri below critical threshold (340 of 900 litres)",
    "status": "open",
    "station": "Himadri",
    "created_at": "2026-08-30 14:22"
  }
]
```

## GET /api/alerts/open

Only alerts with status `open`.

---

**Frontend team:** use these field names exactly. If we send `name` and your code reads `title`, the page renders blank with no error at all.

## GET /api/cargo

All cargo across all shipments, highest priority first.

```json
[
  {
    "cargo_id": 5,
    "item_name": "Diesel drums",
    "category": "fuel",
    "quantity": 60,
    "unit": "drums",
    "weight_kg": 12000,
    "priority": "critical",
    "status": "in_transit",
    "shipment_ref": "SHP-2026-003",
    "destination": "Himadri"
  }
]
```

## GET /api/cargo/<id>

One cargo item by its id. Returns `404` with `{"error": "Cargo item not found"}` if it doesn't exist.

## GET /api/cargo/shipment/<shipment_id>

Everything loaded on one shipment. Same fields as above, minus `shipment_ref` and `destination`.

## POST /api/cargo

Creates a cargo item. Required: `item_name`, `category`, `quantity`.
Optional: `shipment_id`, `unit`, `weight_kg`, `priority`, `status`.
Returns `201` with the new `cargo_id`.

## PUT /api/cargo/<id>

Updates status. Send `{"status": "loaded"}`.

## DELETE /api/cargo/<id>

Removes a cargo item.