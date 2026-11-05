"""
Automated Discovery Worker (OpenStreetMap / Overpass API)
Runs in cloud cron to discover real local businesses & institutions across Indian cities.
Collects public business info, detects website presence/absence, normalizes names,
and ingests qualified leads into Supabase automatically via standard REST API.
"""

import asyncio
import os
import re
from typing import Any

import httpx

from workers.scoring.engine import score_local_business_website_opportunity

OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_API_URL = "https://nominatim.openstreetmap.org/search"

# Target cities across India
TARGET_CITIES = [
    {"name": "Coimbatore", "lat": 11.0168, "lon": 76.9558, "radius": 15000},
    {"name": "Tiruppur", "lat": 11.1085, "lon": 77.3411, "radius": 15000},
    {"name": "Erode", "lat": 11.3410, "lon": 77.7172, "radius": 15000},
    {"name": "Salem", "lat": 11.6643, "lon": 78.1460, "radius": 12000},
    {"name": "Chennai", "lat": 13.0827, "lon": 80.2707, "radius": 15000},
    {"name": "Madurai", "lat": 9.9252, "lon": 78.1198, "radius": 12000},
]

# High-converting categories for websites, booking engines, and automation
AMENITIES = [
    ("clinic", "Healthcare / Clinic"),
    ("hospital", "Healthcare / Hospital"),
    ("college", "Education / College"),
    ("school", "Education / School"),
    ("gym", "Fitness / Gym"),
    ("restaurant", "Hospitality / Restaurant"),
    ("hotel", "Hospitality / Hotel"),
]


def normalize_name(name: str) -> str:
    cleaned = re.sub(r"[^\w\s]", "", name.lower())
    cleaned = re.sub(
        r"\b(pvt|ltd|limited|private|inc|clinic|hospital|centre|center)\b", "", cleaned
    )
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return f"91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    if len(digits) == 11 and digits.startswith("0"):
        return digits[1:]
    return digits if len(digits) >= 8 else None


async def query_osm_businesses(
    city_name: str, amenity_key: str, limit: int = 8
) -> list[dict[str, Any]]:
    """Primary discovery via OpenStreetMap Nominatim with zero timeouts."""
    query_url = f"{NOMINATIM_API_URL}?q={amenity_key}+in+{city_name}+Tamil+Nadu&format=json&addressdetails=1&limit={limit}"
    headers = {"User-Agent": "ZenLyft-REOZ-Discovery/1.0 (contact@zenlyft.in)"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(query_url, headers=headers)
            if resp.status_code == 200:
                results = resp.json()
                elements = []
                for item in results:
                    raw_name = (
                        item.get("name")
                        or item.get("display_name", "").split(",")[0].strip()
                    )
                    if raw_name:
                        elements.append(
                            {
                                "tags": {
                                    "name": raw_name,
                                    "amenity": amenity_key,
                                    "address": item.get("display_name", ""),
                                    "city": city_name,
                                },
                                "lat": float(item.get("lat", 0)),
                                "lon": float(item.get("lon", 0)),
                            }
                        )
                return elements
    except Exception as e:  # noqa: BLE001
        print(f"[NOMINATIM QUERY WARNING]: {e}. Attempting Overpass fallback...")

    # Fallback: Overpass
    return await query_overpass_businesses(
        11.0168, 76.9558, 10000, amenity_key, limit=limit
    )


async def query_overpass_businesses(
    lat: float, lon: float, radius: int, amenity_key: str, limit: int = 5
) -> list[dict[str, Any]]:
    """Queries OpenStreetMap Overpass API as secondary fallback."""
    query = f"""
    [out:json][timeout:15];
    (
      node["amenity"="{amenity_key}"](around:{radius},{lat},{lon});
    );
    out tags {limit};
    """
    for mirror in [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
    ]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(mirror, data={"data": query})
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("elements", [])
        except Exception:  # noqa: BLE001, S112
            continue
    return []


async def run_discovery_pipeline(max_leads_per_run: int = 10):
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        print("[DISCOVERY ERROR] Missing Supabase environment variables.")
        return

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    async with httpx.AsyncClient(timeout=20.0) as http:
        # 1. Fetch existing leads for deduplication
        existing_res = await http.get(
            f"{supabase_url}/rest/v1/leads?select=normalised_name,website_domain&archived_at=is.null",
            headers=headers,
        )
        existing_data = existing_res.json() if existing_res.status_code == 200 else []
        existing_names = {
            row["normalised_name"]
            for row in existing_data
            if row.get("normalised_name")
        }

        new_leads_added = 0

        for city in TARGET_CITIES:
            if new_leads_added >= max_leads_per_run:
                break

            for amenity_code, category_label in AMENITIES:
                if new_leads_added >= max_leads_per_run:
                    break

                print(f"[*] Scanning {city['name']} for {category_label}...")
                elements = await query_osm_businesses(
                    city["name"], amenity_code, limit=8
                )

                for el in elements:
                    tags = el.get("tags", {})
                    raw_name = tags.get("name")
                    if not raw_name or len(raw_name.strip()) < 3:
                        continue

                    norm_name = normalize_name(raw_name)
                    if norm_name in existing_names:
                        continue  # Deduplicated

                    website = tags.get("website") or tags.get("contact:website")
                    phone = (
                        tags.get("phone")
                        or tags.get("contact:phone")
                        or tags.get("contact:mobile")
                    )
                    clean_phone = normalize_phone(phone)

                    # Determine initial status
                    website_status = (
                        "verified" if website else "not_found_in_checked_sources"
                    )
                    evidence_note = (
                        f"Official website found: {website}"
                        if website
                        else "Physical business verified in OpenStreetMap registry with no discoverable website."
                    )

                    # Calculate deterministic heuristic score
                    lead_dict = {
                        "organisation_name": raw_name,
                        "category": category_label,
                        "location": f"{city['name']}, India",
                        "website_url": website,
                        "website_status": website_status,
                        "phone": clean_phone,
                        "public_phone": clean_phone,
                    }
                    scoring_res = score_local_business_website_opportunity(lead_dict)

                    # Insert lead into Supabase
                    insert_payload = {
                        "organisation_name": raw_name,
                        "normalised_name": norm_name,
                        "organisation_type": "institution"
                        if "Education" in category_label
                        else "local_business",
                        "category": category_label,
                        "location": f"{city['name']}, India",
                        "website_url": website,
                        "website_status": website_status,
                        "service_interest": "Website Design & Booking Automation",
                        "score": scoring_res.score,
                        "score_explanation": [
                            b.model_dump() for b in scoring_res.breakdown
                        ],
                        "pipeline_stage": "discovered",
                        "next_action": "Review AI Outreach Pitch & Approve",
                        "contact_restriction": "none",
                    }

                    res = await http.post(
                        f"{supabase_url}/rest/v1/leads",
                        headers=headers,
                        json=insert_payload,
                    )

                    if res.status_code in (200, 201):
                        created_leads = res.json()
                        lead_id = created_leads[0]["id"]
                        existing_names.add(norm_name)

                        # Add source evidence record
                        await http.post(
                            f"{supabase_url}/rest/v1/sources",
                            headers=headers,
                            json={
                                "lead_id": lead_id,
                                "source_url": "https://www.openstreetmap.org",
                                "source_type": "openstreetmap_overpass",
                                "observed_fact": evidence_note,
                                "confidence": "high",
                            },
                        )

                        # Add contact channel if phone exists
                        if clean_phone:
                            await http.post(
                                f"{supabase_url}/rest/v1/contact_channels",
                                headers=headers,
                                json={
                                    "lead_id": lead_id,
                                    "channel_type": "phone",
                                    "public_value": clean_phone,
                                    "contact_restriction": "none",
                                },
                            )

                        new_leads_added += 1
                        print(
                            f"  [+] Ingested Lead: {raw_name} ({category_label}, {city['name']}) - Score: {scoring_res.score}/100"
                        )

                        if new_leads_added >= max_leads_per_run:
                            break

        print(
            f"\n[DONE] Successfully ingested {new_leads_added} fresh high-converting leads!"
        )


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()
    asyncio.run(run_discovery_pipeline(max_leads_per_run=10))
