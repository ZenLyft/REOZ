"""
Deterministic Scoring Engine
Heuristic models for:
1. Local Business Website & Digital Services Opportunity (0 - 100)
2. Educational Institution (ERP / HOMS) Opportunity (0 - 100)

Never uses LLMs for scoring. Fully reproducible, auditable, and transparent.
"""

from typing import Any

from pydantic import BaseModel, Field


class ScoreBreakdown(BaseModel):
    category: str
    points_awarded: int
    max_points: int
    rationale: str
    basis: str  # 'measured' | 'estimated' | 'declared'


class ScoringResult(BaseModel):
    score: int = Field(ge=0, le=100)
    confidence: str  # 'high' | 'medium' | 'low'
    breakdown: list[ScoreBreakdown]
    unknowns: list[str]
    limitations: str


def score_local_business_website_opportunity(
    lead_data: dict[str, Any], measured_audit: dict[str, Any] | None = None
) -> ScoringResult:
    """
    Local Business Opportunity Model (Max 100 pts):
    - Website absent or not discoverable: up to 20
    - Clear usability / audit issues: up to 20
    - Clear need for enquiries / bookings: up to 15
    - Publicly verifiable info: up to 10
    - Public contact channel available: up to 10
    - Fit with ZenLyft delivery: up to 15
    - Geographic / service fit: up to 10
    """
    breakdown: list[ScoreBreakdown] = []
    unknowns: list[str] = []
    total_score = 0

    website_url = lead_data.get("website_url")
    website_status = lead_data.get("website_status", "not_enough_evidence")
    phone = lead_data.get("phone") or lead_data.get("public_phone")
    email = lead_data.get("email") or lead_data.get("public_email")
    location = lead_data.get("location", "")
    category = lead_data.get("category", "").lower()

    # 1. Website Discoverability / Absence (Max 20)
    if website_status in ("not_found_in_checked_sources", "appears_outdated"):
        points = 20 if website_status == "not_found_in_checked_sources" else 15
        breakdown.append(
            ScoreBreakdown(
                category="Website Status",
                points_awarded=points,
                max_points=20,
                rationale=f"Website status is '{website_status}' with recorded evidence.",
                basis="measured",
            )
        )
        total_score += points
    elif not website_url:
        breakdown.append(
            ScoreBreakdown(
                category="Website Status",
                points_awarded=15,
                max_points=20,
                rationale="No website URL provided in lead sources.",
                basis="declared",
            )
        )
        total_score += 15
    else:
        breakdown.append(
            ScoreBreakdown(
                category="Website Status",
                points_awarded=5,
                max_points=20,
                rationale="Existing website exists, opportunity focuses on redesign / modernization.",
                basis="measured",
            )
        )
        total_score += 5

    # 2. Usability & Technical Health (Max 20)
    if measured_audit:
        usability_pts = 0
        reasons = []
        if not measured_audit.get("is_https"):
            usability_pts += 5
            reasons.append("Missing HTTPS encryption")
        if not measured_audit.get("has_viewport"):
            usability_pts += 7
            reasons.append("Missing mobile viewport tag (poor mobile UX)")
        if not measured_audit.get("has_whatsapp"):
            usability_pts += 4
            reasons.append("No instant WhatsApp integration")
        if not measured_audit.get("has_title"):
            usability_pts += 4
            reasons.append("Missing SEO title tag")
        breakdown.append(
            ScoreBreakdown(
                category="Usability & Health",
                points_awarded=min(usability_pts, 20),
                max_points=20,
                rationale=", ".join(reasons)
                if reasons
                else "Website passed standard checks",
                basis="measured",
            )
        )
        total_score += min(usability_pts, 20)
    else:
        # No audit conducted yet
        unknowns.append("Automated audit indicators not yet measured")
        breakdown.append(
            ScoreBreakdown(
                category="Usability & Health",
                points_awarded=10,
                max_points=20,
                rationale="Estimated based on initial record, audit pending.",
                basis="estimated",
            )
        )
        total_score += 10

    # 3. Need for Enquiries / Online Bookings (Max 15)
    enquiry_heavy_categories = (
        "clinic",
        "doctor",
        "health",
        "coaching",
        "tuition",
        "academy",
        "gym",
        "fitness",
        "salon",
        "hotel",
        "consult",
    )
    if any(k in category for k in enquiry_heavy_categories):
        breakdown.append(
            ScoreBreakdown(
                category="Enquiry / Booking Need",
                points_awarded=15,
                max_points=15,
                rationale=f"Business category '{category}' relies heavily on online customer bookings and enquiries.",
                basis="declared",
            )
        )
        total_score += 15
    else:
        breakdown.append(
            ScoreBreakdown(
                category="Enquiry / Booking Need",
                points_awarded=8,
                max_points=15,
                rationale=f"Standard commercial business category: '{category}'.",
                basis="declared",
            )
        )
        total_score += 8

    # 4. Publicly Verifiable Info (Max 10)
    if location and lead_data.get("organisation_name"):
        breakdown.append(
            ScoreBreakdown(
                category="Verifiable Information",
                points_awarded=10,
                max_points=10,
                rationale="Organisation name, category, and physical location are verified.",
                basis="declared",
            )
        )
        total_score += 10
    else:
        unknowns.append("Physical address or exact operational location unverified")
        breakdown.append(
            ScoreBreakdown(
                category="Verifiable Information",
                points_awarded=4,
                max_points=10,
                rationale="Partial business details recorded.",
                basis="declared",
            )
        )
        total_score += 4

    # 5. Public Contact Channel Available (Max 10)
    contact_pts = 0
    if phone:
        contact_pts += 6
    if email:
        contact_pts += 4
    if contact_pts == 0:
        unknowns.append("No public phone or email verified")
    breakdown.append(
        ScoreBreakdown(
            category="Contact Channel",
            points_awarded=contact_pts,
            max_points=10,
            rationale=f"Available public contact: Phone ({'yes' if phone else 'no'}), Email ({'yes' if email else 'no'}).",
            basis="measured",
        )
    )
    total_score += contact_pts

    # 6. Fit with ZenLyft Delivery Capabilities (Max 15)
    breakdown.append(
        ScoreBreakdown(
            category="ZenLyft Delivery Fit",
            points_awarded=15,
            max_points=15,
            rationale="Matches ZenLyft core expertise in Next.js web design, automation, and booking workflows.",
            basis="declared",
        )
    )
    total_score += 15

    # 7. Geographic & Implementation Fit (Max 10)
    if (
        "india" in location.lower()
        or "tamil nadu" in location.lower()
        or "coimbatore" in location.lower()
        or "chennai" in location.lower()
    ):
        breakdown.append(
            ScoreBreakdown(
                category="Geographic Fit",
                points_awarded=10,
                max_points=10,
                rationale="Target territory match.",
                basis="declared",
            )
        )
        total_score += 10
    else:
        breakdown.append(
            ScoreBreakdown(
                category="Geographic Fit",
                points_awarded=7,
                max_points=10,
                rationale="Pan-India digital delivery scope.",
                basis="declared",
            )
        )
        total_score += 7

    # Confidence calculation
    confidence = (
        "high" if len(unknowns) == 0 else "medium" if len(unknowns) <= 2 else "low"
    )

    return ScoringResult(
        score=min(total_score, 100),
        confidence=confidence,
        breakdown=breakdown,
        unknowns=unknowns,
        limitations="Score generated via deterministic heuristic rules. It represents priority fit, not guaranteed commercial readiness or intent.",
    )
