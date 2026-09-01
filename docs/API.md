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
    "origin": "Tromso, Norway",
    "eta": "2026-09-08",
    "destination": "Himadri"
  }
]
```

`origin` and `eta` come from the linked shipment. Both are `null` if the cargo
isn't assigned to a shipment yet — show an empty cell.

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
---

## GET /api/stations

Returns all stations.

## GET /api/stations/<id>

Returns one station by ID. Returns `404` if the station does not exist.

## POST /api/stations

Creates a new station.

---

## GET /api/expeditions

Returns all expeditions.

## GET /api/expeditions/<id>

Returns one expedition by ID. Returns `404` if the expedition does not exist.

## POST /api/expeditions

Creates a new expedition.

## PUT /api/expeditions/<id>

Updates an expedition's status.

## DELETE /api/expeditions/<id>

Deletes an expedition.

---

## GET /api/personnel

Returns all personnel with their station and expedition information.

## GET /api/personnel/<id>

Returns one personnel record by ID.

## POST /api/personnel

Creates a new personnel record.

Required fields:

- `name`
- `role`
- `contact`

## PUT /api/personnel/<id>

Updates a personnel record.

## DELETE /api/personnel/<id>

Deletes a personnel record.

---

## GET /api/shipments

Returns all shipments.

## GET /api/shipments/<id>

Returns one shipment by ID.

## GET /api/shipments/in-transit

Returns all shipments currently in transit.

## POST /api/shipments

Creates a new shipment.

Required field:

- `reference`

## PUT /api/shipments/<id>/status

Updates the status of a shipment.

Example request:

```json
{
  "status": "in_transit"
}