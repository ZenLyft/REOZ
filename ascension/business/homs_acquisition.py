"""HOMS Institutional Acquisition Domain Tools — zero fabrication, evidence-grounded."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx
from workers.scoring.engine import score_local_business_website_opportunity

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


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
    city: str, limit: int = 10
) -> dict[str, Any]:
    """Query OpenStreetMap Overpass API for real colleges, universities, and hostels in an Indian city."""
    safe_city = city.strip()
    if not safe_city:
        return {"ok": False, "error": "City must not be empty", "prospects": []}

    query = f"""
    [out:json][timeout:20];
    area["name"~"{safe_city}",i]->.searchArea;
    (
      node["amenity"~"college|university"](area.searchArea);
      way["amenity"~"college|university"](area.searchArea);
      node["tourism"="hostel"](area.searchArea);
      way["tourism"="hostel"](area.searchArea);
    );
    out center {min(max(limit, 1), 25)};
    """
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query})
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
    except Exception as exc:
        return {
            "ok": False,
            "error": f"Overpass API unavailable: {exc}",
            "prospects": [],
        }

    prospects: list[dict[str, Any]] = []
    seen: set[str] = set()
    now_iso = datetime.now(UTC).isoformat()

    for el in elements:
        tags = el.get("tags", {})
        name = (tags.get("name") or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)

        website = tags.get("website") or tags.get("contact:website")
        phone = tags.get("phone") or tags.get("contact:phone")
        email = tags.get("email") or tags.get("contact:email")
        category = tags.get("amenity") or tags.get("tourism") or "institution"
        osm_url = f"https://www.openstreetmap.org/{el.get('type', 'node')}/{el.get('id')}"

        prospects.append(
            {
                "organisation_name": name,
                "category": category,
                "city": safe_city,
                "website_url": website,
                "website_status": "verified_present" if website else "not_found_in_checked_sources",
                "phone": phone,
                "email": email,
                "source_type": "openstreetmap_overpass",
                "source_ref": osm_url,
                "discovered_at": now_iso,
            }
        )
        if len(prospects) >= limit:
            break

    return {"ok": True, "count": len(prospects), "prospects": prospects}


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
            "location": f"{prospect.get('city', '')}, India",
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
