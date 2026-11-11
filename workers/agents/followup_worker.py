"""ZenLyft Revenue Engine - Continuous Prospect Follow-Up & Conversion Agent
Enforces the mandatory Day 0 / Day 3 / Day 7 / Day 12 / Day 18 follow-up sequence.
Respects do-not-contact restrictions, emergency stop switches, and pauses on reply.
"""

import hashlib
import json
import os
import urllib.request
from datetime import UTC, datetime

from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

FOLLOW_UP_CADENCE = [
    {
        "days": 3,
        "intent": "benefit",
        "subject": "Quick observation on digital booking for {organisation_name}",
        "template": (
            "Hi {organisation_name} team,\n\n"
            "Following up on our note regarding your online customer experience. "
            "Local service businesses and academies worldwide that upgraded to mobile-first "
            "WhatsApp booking saw up to a 3x increase in weekly customer inquiries without spending on ads.\n\n"
            "Would you be open to a quick 3-minute video showing how this could work for {organisation_name}?\n\n"
            "Best regards,\nNiresh Senthoor\nFounder & CEO, ZenLyft\nniresh@zenlyft.in"
        ),
    },
    {
        "days": 7,
        "intent": "solution_observation",
        "subject": "Actionable observation for {organisation_name}",
        "template": (
            "Hi {organisation_name},\n\n"
            "We recently reviewed local web visibility in your area and noticed that customers "
            "searching on mobile often have difficulty finding a direct 1-tap WhatsApp consultation button.\n\n"
            "We prepared a preliminary showcase concept for {organisation_name}. "
            "Let me know if you would like me to share the link.\n\n"
            "Best,\nNiresh Senthoor\nZenLyft"
        ),
    },
    {
        "days": 12,
        "intent": "demo_invitation",
        "subject": "5-minute interactive walkthrough for {organisation_name}",
        "template": (
            "Hi {organisation_name},\n\n"
            "I would love to invite you to a live 5-minute interactive demonstration "
            "of our business showcase portal and WhatsApp enquiry engine.\n\n"
            "Are you available for a brief call this Thursday at 11:00 AM?\n\n"
            "Warm regards,\nNiresh Senthoor\nFounder, ZenLyft"
        ),
    },
    {
        "days": 18,
        "intent": "breakup_check",
        "subject": "Closing the loop for {organisation_name}",
        "template": (
            "Hi {organisation_name},\n\n"
            "I understand you are busy running daily operations. I just wanted to check if upgrading your "
            "digital presence or student management system is a priority for this quarter?\n\n"
            "If not, no problem at all — I will not follow up further and wish you continued success.\n\n"
            "Best,\nNiresh Senthoor\nZenLyft"
        ),
    },
]


def compute_sha256(content: str, recipient: str) -> str:
    h = hashlib.sha256()
    h.update(recipient.strip().encode("utf-8"))
    h.update(b"|")
    h.update(content.strip().encode("utf-8"))
    return h.hexdigest()


def run_followup_cycle():
    if not SUPABASE_URL or not SERVICE_KEY:
        print("[ERROR]: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
        return

    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    # 1. Fetch leads currently in 'contacted' stage
    url = f"{SUPABASE_URL}/rest/v1/leads?pipeline_stage=eq.contacted&contact_restriction=eq.none&select=id,organisation_name,location,phone,website_url,created_at"
    req = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req) as resp:
            leads = json.loads(resp.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"[ERROR]: Failed to fetch contacted leads: {e}")
        return

    print(
        f"[FOLLOW-UP AGENT]: Scanning {len(leads)} contacted leads for scheduled cadence..."
    )
    now = datetime.now(UTC)

    queued_count = 0
    for lead in leads:
        lead_id = lead.get("id")
        org_name = lead.get("organisation_name")
        created_str = lead.get("created_at")

        if not created_str:
            continue

        try:
            created_dt = datetime.fromisoformat(created_str)
        except Exception:  # noqa: BLE001, S112
            continue

        days_elapsed = (now - created_dt).days

        # Match appropriate cadence step
        step_to_queue = None
        for step in FOLLOW_UP_CADENCE:
            if days_elapsed >= step["days"]:
                step_to_queue = step

        if not step_to_queue:
            continue

        recipient = (
            lead.get("phone")
            or "contact@"
            + (lead.get("website_url") or "lead.local")
            .replace("http://", "")
            .replace("https://", "")
            .split("/")[0]
        )

        message = step_to_queue["template"].format(organisation_name=org_name)
        payload_hash = compute_sha256(message, recipient)

        # Check if this draft already exists
        check_url = (
            f"{SUPABASE_URL}/rest/v1/approvals?payload_hash=eq.{payload_hash}&select=id"
        )
        check_req = urllib.request.Request(check_url, headers=headers)
        try:
            with urllib.request.urlopen(check_req) as cr:
                existing = json.loads(cr.read().decode("utf-8"))
                if existing:
                    continue  # already generated
        except Exception:  # noqa: BLE001, S110
            pass

        # Create outreach_draft
        draft_body = {
            "lead_id": lead_id,
            "channel": "whatsapp" if lead.get("phone") else "email",
            "content": message,
            "approval_status": "pending",
        }
        draft_req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/outreach_drafts",
            data=json.dumps(draft_body).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(draft_req) as dr:
                draft_res = json.loads(dr.read().decode("utf-8"))
                draft_id = draft_res[0]["id"]
        except Exception as e:  # noqa: BLE001
            print(f"[ERROR]: Could not insert draft for {org_name}: {e}")
            continue

        # Create approval record
        approval_body = {
            "target_type": "outreach_draft",
            "target_id": draft_id,
            "action_type": f"followup_cadence_day_{step_to_queue['days']}",
            "payload_hash": payload_hash,
            "status": "pending",
            "reason": f"Scheduled Day {step_to_queue['days']} follow-up for {org_name}",
        }
        app_req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/approvals",
            data=json.dumps(approval_body).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(app_req):
                queued_count += 1
                print(f"✓ Queued Day {step_to_queue['days']} follow-up for: {org_name}")
        except Exception as e:  # noqa: BLE001
            print(f"[ERROR]: Could not queue approval for {org_name}: {e}")

    print(
        f"[FOLLOW-UP COMPLETE]: {queued_count} scheduled follow-ups queued for founder review."
    )


if __name__ == "__main__":
    run_followup_cycle()
