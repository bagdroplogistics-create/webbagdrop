#!/usr/bin/env python3
"""Transform a bagdrop.co production export (bookings.json from the panel's
own /api/admin/bookings response) into the Admin OS booking format, writing
import/seed-bookings.json ready to load into the local backend."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

ZONE = {}
for c in ["Mumbai", "Navi Mumbai", "Thane", "Pune"]: ZONE[c] = "MUM"
for c in ["Ahmedabad", "Vadodara", "Baroda", "Nadiad", "Anand", "Surat", "Rajkot"]: ZONE[c] = "GUJ"
for c in ["Delhi", "Jaipur", "Udaipur", "Chandigarh"]: ZONE[c] = "NOR"
for c in ["Bengaluru", "Bangalore", "Hyderabad", "Chennai", "Kochi"]: ZONE[c] = "SOU"
for c in ["Goa", "North Goa"]: ZONE[c] = "GOA"
for c in ["Kolkata"]: ZONE[c] = "EAS"

def zone(city):
    city = city or ""
    for name, z in ZONE.items():
        if name.lower() in city.lower():
            return z
    return ""

# production status -> Admin OS status
STATUS = {
    "inquiry": "quoted", "quote_created": "quoted", "quote_sent": "quoted",
    "quote_accepted": "identified", "payment_pending": "identified",
    "confirmed": "accepted", "approved": "accepted", "paid": "submitted",
    "driver_assigned": "assigned", "pickup_scheduled": "assigned",
    "picked_up": "picked_up", "in_transit": "in_transit",
    "out_for_delivery": "in_transit", "delivered": "delivered",
    "completed": "delivered", "rejected": "rejected", "cancelled": "cancelled",
}

def mode(b):
    s = (b.get("service_type") or "") + " " + (b.get("service_label") or "")
    return "air" if "airport" in s.lower() or "baggage" in s.lower() else "road"

def transform(b):
    paid = (b.get("payment_status") == "paid") or bool(b.get("payment_reference"))
    status = STATUS.get(b.get("status") or "", "submitted")
    if paid and status in ("quoted", "identified"):
        status = "submitted"
    events = []
    for h in (b.get("status_history") or []):
        events.append({
            "at": h.get("timestamp") or b.get("created_at"),
            "by": "admin" if h.get("changed_by") == "admin" else "customer",
            "text": h.get("note") or ("Status → " + str(h.get("to") or h.get("status") or "")),
        })
    total = round(float(b.get("total_amount") or 0))
    doc = {
        "id": b.get("tracking_id") or b.get("id"),
        "created": b.get("created_at"),
        "status": status,
        "sourceStatus": b.get("status"),
        "uc": b.get("use_case") or "",
        "ucName": b.get("service_label") or b.get("service_type") or "Imported",
        "mode": mode(b),
        "from": b.get("from_city") or "", "to": b.get("to_city") or "",
        "pickAddr": b.get("pickup_address") or "", "dropAddr": b.get("drop_address") or "",
        "zo": zone(b.get("from_city")), "zd": zone(b.get("to_city")),
        "date": b.get("pickup_date") or "", "ref": b.get("flight_number") or "",
        "slot": b.get("time_slot") or "",
        "bags": b.get("total_bags") or 0, "oversize": 0,
        "billed": max(b.get("total_bags") or 0, 1),
        "traveller": {
            "name": b.get("customer_name") or "", "mobile": b.get("customer_phone") or "",
            "email": b.get("customer_email") or "", "res": "in",
        },
        "payer": None, "note": b.get("notes") or "",
        "source": "imported · " + (b.get("source") or "production"),
        "quote": {"qid": None, "total": total, "breakdown": {"imported": True},
                  "validUntil": None},
        "identity": ({"ok": True, "at": b.get("updated_at"), "method": "Imported · verified upstream", "score": 0.95}
                     if b.get("identity_verification_id") else None),
        "pay": ({"mode": "full", "amount": total, "status": "captured",
                 "gateway": (b.get("payment_method") or "Imported"), "at": b.get("updated_at")}
                if paid else None),
        "admin": {k: v for k, v in {
            "captain": b.get("driver_name"), "vehicle": b.get("vehicle_number"),
            "reason": b.get("rejection_reason"),
        }.items() if v},
        "events": events or [{"at": b.get("created_at"), "by": "customer", "text": "Imported from the production panel"}],
        "imported": True,
    }
    return doc

def main():
    src = os.path.join(HERE, "bookings.json")
    raw = json.load(open(src))
    rows = raw.get("bookings") if isinstance(raw, dict) else raw
    docs, skipped = {}, 0
    for b in rows:
        if b.get("is_test"):
            skipped += 1
            continue
        d = transform(b)
        docs[d["id"]] = d
    out = os.path.join(HERE, "seed-bookings.json")
    json.dump(docs, open(out, "w"))
    statuses = {}
    for d in docs.values():
        statuses[d["status"]] = statuses.get(d["status"], 0) + 1
    print(f"{len(docs)} bookings transformed ({skipped} test rows skipped) -> {out}")
    print("by status:", json.dumps(statuses))
    paid = [d for d in docs.values() if d["pay"]]
    print(f"paid: {len(paid)} worth Rs.{sum(d['pay']['amount'] for d in paid):,}")

if __name__ == "__main__":
    main()
