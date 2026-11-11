"""HOMS Institutional Acquisition Domain Tools — zero fabrication, evidence-grounded."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx
from workers.scoring.engine import score_local_business_website_opportunity

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_MIRRORS: tuple[str, ...] = (
    OVERPASS_URL,
    "https://overpass.kumi.systems/api/interpreter",
)
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
OSM_HEADERS = {
    "User-Agent": "ZenLyft-REOZ/1.0 (https://github.com/ZenLyft/REOZ)",
    "Accept": "application/json",
}
GLOBAL_DISCOVERY_HUBS: tuple[str, ...] = (
    "London",
    "New York",
    "Singapore",
    "Dubai",
    "Toronto",
    "Sydney",
    "Berlin",
    "Tokyo",
    "Bengaluru",
    "Cape Town",
)
_GLOBAL_SCOPE_ALIASES: frozenset[str] = frozenset(
    {"global", "world", "worldwide", "all", "planet", "earth", "anywhere", "all over the world"}
)


def _is_global_scope(region: str) -> bool:
    return region.strip().lower() in _GLOBAL_SCOPE_ALIASES


def _make_prospect(
    *,
    name: str,
    category: str,
    city: str,
    website: str | None,
    phone: str | None,
    email: str | None,
    source_type: str,
    osm_url: str,
    discovered_at: str,
) -> dict[str, Any]:
    return {
        "organisation_name": name,
        "category": category,
        "city": city,
        "website_url": website,
        "website_status": "verified_present" if website else "not_found_in_checked_sources",
        "phone": phone,
        "email": email,
        "source_type": source_type,
        "source_ref": osm_url,
        "discovered_at": discovered_at,
    }


async def _fetch_overpass_prospects(
    client: httpx.AsyncClient,
    city: str,
    limit: int,
    now_iso: str,
) -> tuple[list[dict[str, Any]], str | None]:
    query = f"""
    [out:json][timeout:6];
    area["name"="{city}"]["boundary"="administrative"]->.searchArea;
    (
      node["amenity"~"college|university"](area.searchArea);
      way["amenity"~"college|university"](area.searchArea);
      node["tourism"="hostel"](area.searchArea);
      way["tourism"="hostel"](area.searchArea);
    );
    out center {min(max(limit, 1), 25)};
    """
    last_error: str | None = None
    for mirror in OVERPASS_MIRRORS:
        try:
            resp = await client.post(
                mirror,
                data={"data": query},
                headers=OSM_HEADERS,
                timeout=6.0,
            )
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
        except Exception as exc:
            last_error = f"{mirror}: {exc}"
            continue

        prospects: list[dict[str, Any]] = []
        seen: set[str] = set()
        for el in elements:
            tags = el.get("tags", {})
            name = (tags.get("name") or "").strip()
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())
            prospects.append(
                _make_prospect(
                    name=name,
                    category=tags.get("amenity") or tags.get("tourism") or "institution",
                    city=city,
                    website=tags.get("website") or tags.get("contact:website"),
                    phone=tags.get("phone") or tags.get("contact:phone"),
                    email=tags.get("email") or tags.get("contact:email"),
                    source_type="openstreetmap_overpass",
                    osm_url=f"https://www.openstreetmap.org/{el.get('type', 'node')}/{el.get('id')}",
                    discovered_at=now_iso,
                )
            )
            if len(prospects) >= limit:
                break
        if prospects:
            return prospects, None
        last_error = f"{mirror}: returned 0 named elements"
    return [], last_error


async def _fetch_nominatim_prospects(
    client: httpx.AsyncClient,
    city: str,
    limit: int,
    now_iso: str,
) -> tuple[list[dict[str, Any]], str | None]:
    prospects: list[dict[str, Any]] = []
    seen: set[str] = set()
    last_error: str | None = None
    target_cities = list(GLOBAL_DISCOVERY_HUBS) if _is_global_scope(city) else [city]
    per_city_terms = ("college", "hostel") if _is_global_scope(city) else ("college", "hostel", "university")

    for target_city in target_cities:
        if len(prospects) >= limit:
            break
        for term in per_city_terms:
            if len(prospects) >= limit:
                break
            try:
                resp = await client.get(
                    NOMINATIM_SEARCH_URL,
                    params={
                        "q": f"{term} {target_city}",
                        "format": "jsonv2",
                        "extratags": 1,
                        "addressdetails": 1,
                        "limit": min(max(limit, 3), 15),
                    },
                    headers=OSM_HEADERS,
                )
                resp.raise_for_status()
                rows = resp.json()
            except Exception as exc:
                last_error = f"Nominatim ({term} {target_city}): {exc}"
                continue

            for item in rows:
                name = (item.get("name") or "").strip()
                if not name or name.lower() in seen:
                    continue
                extratags = item.get("extratags") or {}
                if extratags.get("healthcare"):
                    continue
                osm_type = item.get("osm_type") or "node"
                osm_id = item.get("osm_id")
                if not osm_id:
                    continue
                seen.add(name.lower())
                item_cat = item.get("type") or term
                addr = item.get("address") or {}
                country = addr.get("country")
                display_city = (
                    addr.get("city")
                    or addr.get("town")
                    or addr.get("state")
                    or target_city
                )
                location_label = f"{display_city}, {country}" if country else display_city
                prospects.append(
                    _make_prospect(
                        name=name,
                        category=item_cat if item_cat in {"college", "university", "hostel", "dormitory"} else term,
                        city=location_label,
                        website=extratags.get("website") or extratags.get("contact:website"),
                        phone=extratags.get("phone") or extratags.get("contact:phone"),
                        email=extratags.get("email") or extratags.get("contact:email"),
                        source_type="openstreetmap_nominatim",
                        osm_url=f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
                        discovered_at=now_iso,
                    )
                )
                if len(prospects) >= limit:
                    break
            if _is_global_scope(city) and prospects:
                # Advance to next global hub once at least 1 institution was found here for worldwide spread.
                break
    return prospects, last_error


@dataclass
class VerifiedInstitution:
    organisation_name: str
    category: str
    city: str
    source_type: str
    source_ref: str
    website_url: str | None = None
    phone: str | None = None
    email: str | None = None
    discovered_at: str = ""


async def query_public_colleges_and_hostels(
    city: str = "Global", limit: int = 10
) -> dict[str, Any]:
    """Query OpenStreetMap worldwide (Overpass mirrors with global Nominatim fallback) for real colleges & hostels."""
    safe_city = (city or "Global").strip() or "Global"

    now_iso = datetime.now(UTC).isoformat()
    async with httpx.AsyncClient(timeout=15) as client:
        overpass_err: str | None = None
        if not _is_global_scope(safe_city):
            prospects, overpass_err = await _fetch_overpass_prospects(client, safe_city, limit, now_iso)
            if prospects:
                return {"ok": True, "count": len(prospects), "prospects": prospects}

        prospects, nom_err = await _fetch_nominatim_prospects(client, safe_city, limit, now_iso)
        if prospects:
            return {"ok": True, "count": len(prospects), "prospects": prospects}

    return {
        "ok": False,
        "error": f"OSM discovery unavailable: {overpass_err or nom_err}",
        "prospects": [],
    }


def qualify_homs_institution(prospect: dict[str, Any]) -> dict[str, Any]:
    """Deterministically score an institution for ZenLyft HOMS (₹35,000) fit without hallucinating."""
    name = (prospect.get("organisation_name") or "").strip()
    source_ref = (prospect.get("source_ref") or "").strip()
    if not name or not source_ref:
        raise ValueError("Prospect requires verified organisation_name and source_ref provenance.")

    base = score_local_business_website_opportunity(
        {
            "organisation_name": name,
            "category": prospect.get("category", "college"),
            "location": prospect.get("location") or prospect.get("city") or "Global",
            "website_url": prospect.get("website_url"),
            "website_status": prospect.get("website_status", "not_enough_evidence"),
            "phone": prospect.get("phone"),
            "email": prospect.get("email"),
        }
    )

    cat = (prospect.get("category") or "").lower()
    homs_bonus = 10 if cat in {"college", "university", "hostel", "dormitory"} else 0
    final_score = min(100, base.score + homs_bonus)
    priority = "HIGH" if final_score >= 80 else ("QUALIFIED" if final_score >= 60 else "NURTURE")

    return {
        "organisation_name": name,
        "category": cat,
        "city": prospect.get("city"),
        "source_ref": source_ref,
        "homs_score": final_score,
        "priority": priority,
        "confidence": base.confidence,
        "unknowns": base.unknowns,
        "recommended_product": "ZenLyft HOMS (₹35,000)" if final_score >= 60 else "ZenLyft Starter (₹9,999)",
        "breakdown": [b.model_dump() for b in base.breakdown],
    }


def build_approved_homs_outreach_draft(qualified: dict[str, Any]) -> dict[str, Any]:
    """Generate an approval-gated outreach draft using strictly approved ZenLyft HOMS copy."""
    org = qualified["organisation_name"]
    city = qualified.get("city") or "your campus"
    score = qualified["homs_score"]

    message = (
        f"Hello {org} Administration Team, we observed your campus presence in {city}. "
        "ZenLyft builds HOMS (Hostel & Outpass Management System, ₹35,000) to replace paper "
        "hostel registers with QR gatepasses, warden approvals, and instant parent SMS/WhatsApp alerts. "
        "May we share a 15-minute live walkthrough this week?"
    )

    return {
        "target_organisation": org,
        "city": city,
        "homs_score": score,
        "product": qualified["recommended_product"],
        "provenance_ref": qualified["source_ref"],
        "template_id": "zenlyft_homs_intro_v1",
        "draft_message": message,
        "requires_founder_approval": True,
        "delivery_status": "WAITING_FOR_APPROVAL",
    }
