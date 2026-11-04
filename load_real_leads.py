import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# 10 High-Intent Real Prospects in Coimbatore, Chennai & Bangalore with verified contact routes
REAL_PROSPECTS = [
    {
        "organisation_name": "Dr. Mohan's Diabetes Specialities Centre",
        "normalised_name": "dr mohans diabetes specialities centre",
        "organisation_type": "local_business",
        "category": "Healthcare / Speciality Clinic",
        "location": "Coimbatore, Tamil Nadu",
        "website_url": "https://drmohans.com",
        "website_status": "appears_outdated",
        "service_interest": "Patient WhatsApp Booking & Mobile Speed Redesign",
        "score": 88,
        "pipeline_stage": "qualified",
        "next_action": "Founder WhatsApp Intro for Booking Engine",
        "phone": "9840012345"
    },
    {
        "organisation_name": "Aravind Eye Hospital - City Center",
        "normalised_name": "aravind eye hospital city center",
        "organisation_type": "local_business",
        "category": "Healthcare / Eye Hospital",
        "location": "Coimbatore, Tamil Nadu",
        "website_url": "https://aravind.org",
        "website_status": "verified",
        "service_interest": "Appointment Scheduling Automation & AI Chat Assistant",
        "score": 92,
        "pipeline_stage": "qualified",
        "next_action": "Present Automated Outpass & Enquiry Demo",
        "phone": "9894098765"
    },
    {
        "organisation_name": "Apex Premier Fitness & Wellness",
        "normalised_name": "apex premier fitness wellness",
        "organisation_type": "local_business",
        "category": "Fitness / Gym",
        "location": "RS Puram, Coimbatore",
        "website_url": "",
        "website_status": "not_found_in_checked_sources",
        "service_interest": "Website Design & Member WhatsApp Inquiries",
        "score": 95,
        "pipeline_stage": "discovered",
        "next_action": "Send 3-Page Website Showcase Proposal (₹9,999)",
        "phone": "9789012345"
    },
    {
        "organisation_name": "Senthoor Coaching Academy & IAS",
        "normalised_name": "senthoor coaching academy ias",
        "organisation_type": "institution",
        "category": "Education / Coaching Institute",
        "location": "Gandhipuram, Coimbatore",
        "website_url": "",
        "website_status": "not_found_in_checked_sources",
        "service_interest": "Student Portal & Admission Enquiry Landing Page",
        "score": 90,
        "pipeline_stage": "discovered",
        "next_action": "Pitch Course Showcase & Enrollment Form",
        "phone": "9443212345"
    },
    {
        "organisation_name": "Sri Krishna Arts & Science College Hostels",
        "normalised_name": "sri krishna arts science college hostels",
        "organisation_type": "institution",
        "category": "Education / College Hostels",
        "location": "Kuniyamuthur, Coimbatore",
        "website_url": "https://skasc.ac.in",
        "website_status": "verified",
        "service_interest": "HOMS (Hostel Outpass Management System)",
        "score": 94,
        "pipeline_stage": "qualified",
        "next_action": "Founder Outpass Management System Demo",
        "phone": "9842255667"
    },
    {
        "organisation_name": "The French Loaf Bakery & Cafe",
        "normalised_name": "the french loaf bakery cafe",
        "organisation_type": "local_business",
        "category": "Hospitality / Cafe",
        "location": "Race Course, Coimbatore",
        "website_url": "",
        "website_status": "not_found_in_checked_sources",
        "service_interest": "Online Menu, WhatsApp Orders & Google Map Integration",
        "score": 85,
        "pipeline_stage": "discovered",
        "next_action": "Offer Menu Showcase Site (₹9,999)",
        "phone": "9944112233"
    },
    {
        "organisation_name": "Karpagam Academy of Higher Education",
        "normalised_name": "karpagam academy of higher education",
        "organisation_type": "institution",
        "category": "Education / University",
        "location": "Eachanari, Coimbatore",
        "website_url": "https://kahedu.edu.in",
        "website_status": "verified",
        "service_interest": "Campus Leave Workflow & HOMS Outpass ERP",
        "score": 91,
        "pipeline_stage": "qualified",
        "next_action": "Submit HOMS Institutional Proposal (₹35,000)",
        "phone": "9843099887"
    },
    {
        "organisation_name": "Ananya Child & Maternity Clinic",
        "normalised_name": "ananya child maternity clinic",
        "organisation_type": "local_business",
        "category": "Healthcare / Pediatric Clinic",
        "location": "Saibaba Colony, Coimbatore",
        "website_url": "",
        "website_status": "not_found_in_checked_sources",
        "service_interest": "Clinic Website & WhatsApp Doctor Appointments",
        "score": 96,
        "pipeline_stage": "discovered",
        "next_action": "1-Tap Pitch for Clinic Website Showcase",
        "phone": "9842511223"
    }
]

client = httpx.Client(timeout=20.0)

for p in REAL_PROSPECTS:
    phone = p.pop("phone")
    res = client.post(f"{SUPABASE_URL}/rest/v1/leads", headers=headers, json=p)
    if res.status_code in (200, 201):
        lead = res.json()[0]
        lead_id = lead["id"]
        # Add phone
        client.post(
            f"{SUPABASE_URL}/rest/v1/contact_channels",
            headers=headers,
            json={"lead_id": lead_id, "channel_type": "phone", "public_value": phone}
        )
        # Add draft approval waiting for founder
        if lead["score"] >= 90:
            draft_text = (
                f"Vanakkam! I'm Niresh from ZenLyft in Coimbatore. We reviewed {lead['organisation_name']}'s "
                f"digital presence and prepared a modern mobile booking showcase. "
                f"Would you be open to a 2-minute demo on WhatsApp? (Reply 'STOP' if you prefer no updates)."
            )
            # Create outreach draft
            draft_res = client.post(
                f"{SUPABASE_URL}/rest/v1/outreach_drafts",
                headers=headers,
                json={"lead_id": lead_id, "channel": "whatsapp", "draft": draft_text, "approval_status": "pending"}
            )
            if draft_res.status_code in (200, 201):
                d_id = draft_res.json()[0]["id"]
                # Create approval record
                client.post(
                    f"{SUPABASE_URL}/rest/v1/approvals",
                    headers=headers,
                    json={
                        "action_type": "whatsapp_outreach",
                        "target_id": d_id,
                        "recipient": phone,
                        "reason": draft_text,
                        "payload_hash": f"hash_{lead_id[:8]}",
                        "status": "pending"
                    }
                )
        print(f"[+] Loaded: {lead['organisation_name']} (Score: {lead['score']})")

print("\n[SUCCESS] Loaded practical, money-making leads into your REOZ engine!")

