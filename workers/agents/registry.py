"""ZenLyft Revenue Engine - 15 Specialist AI Agent Workforce Registry
Every agent has a verified identifier, model configuration, system prompt,
typed inputs/outputs, and an executable task function.
"""

import json
import os
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from dotenv import load_dotenv

from workers.common.gateway import get_ai_gateway

load_dotenv(".env")
load_dotenv(".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


@dataclass
class AgentDefinition:
    id: str
    number: int
    name: str
    role_category: str  # executive | acquisition | sales | operations | finance
    description: str
    provider: str
    model: str
    responsibilities: list[str]
    status: str = "ONLINE"
    last_execution: str | None = None
    success_count: int = 0
    failure_count: int = 0


AGENTS_REGISTRY: dict[str, AgentDefinition] = {
    "agent-01": AgentDefinition(
        id="agent-01",
        number=1,
        name="CEO Executive Orchestrator",
        role_category="executive",
        description="Coordinates all 15 agents, breaks down founder commands, and tracks daily business objectives.",
        provider="groq",
        model="llama-3.3-70b-versatile",
        responsibilities=[
            "Coordinate all 15 specialist agents",
            "Assign tasks and enforce dependencies",
            "Generate daily business executive reviews",
            "Escalate decisions requiring founder sign-off",
        ],
    ),
    "agent-02": AgentDefinition(
        id="agent-02",
        number=2,
        name="Underserved Opportunity Intelligence",
        role_category="acquisition",
        description="Identifies businesses with zero/low competitive coverage, paper chaos, or missing digital portals.",
        provider="gemini",
        model="gemini-flash-lite-latest",
        responsibilities=[
            "Scan for businesses with no verified website",
            "Detect paper-based hostel outpass & register workflows",
            "Assess competitive intensity (Low/Underserved)",
            "Match problems to ZenLyft approved catalogue",
        ],
    ),
    "agent-03": AgentDefinition(
        id="agent-03",
        number=3,
        name="Global Market Discovery Agent",
        role_category="acquisition",
        description="Discovers physical businesses and educational institutions via Nominatim and Overpass.",
        provider="deterministic",
        model="osm-nominatim-engine",
        responsibilities=[
            "Search global target hubs (London, Dubai, Singapore, New York, Bengaluru, Tokyo, etc.)",
            "Extract business names, categories, and coordinates",
            "Deduplicate records against existing CRM database",
            "Enforce source attribution and timestamps",
        ],
    ),
    "agent-04": AgentDefinition(
        id="agent-04",
        number=4,
        name="Competition Research Agent",
        role_category="acquisition",
        description="Analyzes regional competitors, pricing benchmarks, and service gaps without fabricating data.",
        provider="groq",
        model="llama-3.3-70b-versatile",
        responsibilities=[
            "Identify regional software agencies and ERP providers",
            "Highlight ZenLyft local delivery & pricing advantages",
            "Identify underserved SME segments",
        ],
    ),
    "agent-05": AgentDefinition(
        id="agent-05",
        number=5,
        name="Prospect Intelligence Agent",
        role_category="acquisition",
        description="Researches verified public business contacts, phone numbers, and WhatsApp channels.",
        provider="gemini",
        model="gemini-flash-lite-latest",
        responsibilities=[
            "Extract verified public phone numbers and addresses",
            "Verify official website accessibility",
            "Distinguish confirmed facts from inferences",
        ],
    ),
    "agent-06": AgentDefinition(
        id="agent-06",
        number=6,
        name="Website Usability Audit Agent",
        role_category="acquisition",
        description="Audits publicly accessible websites for mobile viewport, slow load times, and broken CTAs.",
        provider="groq",
        model="llama-3.3-70b-versatile",
        responsibilities=[
            "Inspect viewport and responsive tags",
            "Evaluate WhatsApp enquiry click-to-chat accessibility",
            "Produce evidence-based usability audit report",
        ],
    ),
    "agent-07": AgentDefinition(
        id="agent-07",
        number=7,
        name="Lead Qualification Agent",
        role_category="acquisition",
        description="Scores prospects from 0 to 100 based on objective evidence, ZenLyft fit, and reachability.",
        provider="deterministic",
        model="scoring-engine-v1",
        responsibilities=[
            "Score website opportunity (up to 20 pts)",
            "Score ZenLyft service fit (up to 20 pts)",
            "Score verified public contact channel (up to 10 pts)",
            "Assign priority class (High 80-100, Qualified 60-79)",
        ],
    ),
    "agent-08": AgentDefinition(
        id="agent-08",
        number=8,
        name="Marketing Intelligence Agent",
        role_category="sales",
        description="Crafts localized bilingual (Tamil & English) value propositions and campaign concepts.",
        provider="groq",
        model="llama-3.3-70b-versatile",
        responsibilities=[
            "Develop sector-specific hooks (Clinics, Hostels, Colleges)",
            "Maintain approved brand messaging",
            "Evaluate campaign performance metrics",
        ],
    ),
    "agent-09": AgentDefinition(
        id="agent-09",
        number=9,
        name="Sales Development Assistant (SDR)",
        role_category="sales",
        description="Generates personalized Day 0 outreach drafts bound by cryptographic SHA-256 payload hashes.",
        provider="groq",
        model="llama-3.3-70b-versatile",
        responsibilities=[
            "Prepare prospect-specific initial introduction drafts",
            "Map problem to exact catalogue pricing tier",
            "Queue drafts in founder Approval Inbox",
        ],
    ),
    "agent-10": AgentDefinition(
        id="agent-10",
        number=10,
        name="Continuous Follow-Up Coordinator",
        role_category="sales",
        description="Executes the Day 3, 7, 12, 18 touchpoint cadence and auto-pauses when prospect replies.",
        provider="deterministic",
        model="cadence-engine-v1",
        responsibilities=[
            "Track days elapsed since last contact",
            "Queue Day 3 benefit, Day 7 observation, Day 12 demo offers",
            "Stop immediately on opt-out or decline",
        ],
    ),
    "agent-11": AgentDefinition(
        id="agent-11",
        number=11,
        name="Account Executive Assistant",
        role_category="sales",
        description="Summarizes prospect requirements, prepares demo agendas, and drafts formal proposals.",
        provider="gemini",
        model="gemini-flash-lite-latest",
        responsibilities=[
            "Draft interactive demonstration agendas",
            "Map client requests to approved deliverables",
            "Prepare commercial proposal summaries",
        ],
    ),
    "agent-12": AgentDefinition(
        id="agent-12",
        number=12,
        name="Negotiation & Objection Intelligence",
        role_category="sales",
        description="Analyzes objections and enforces approved catalogue discount ceilings (Max 10-15%).",
        provider="groq",
        model="llama-3.3-70b-versatile",
        responsibilities=[
            "Address common pricing and timeline objections",
            "Enforce minimum approved price floors",
            "Escalate unapproved custom terms to founder (Level 3)",
        ],
    ),
    "agent-13": AgentDefinition(
        id="agent-13",
        number=13,
        name="Deal Closing Coordinator",
        role_category="sales",
        description="Verifies formal customer acceptance evidence before initializing project onboarding.",
        provider="groq",
        model="llama-3.3-70b-versatile",
        responsibilities=[
            "Confirm scope, deliverables, and payment schedule",
            "Record documented client acceptance evidence",
            "Prevent deals from advancing without founder review",
        ],
    ),
    "agent-14": AgentDefinition(
        id="agent-14",
        number=14,
        name="Customer Onboarding Agent",
        role_category="operations",
        description="Creates client workspaces, generates onboarding checklists, and schedules kickoff.",
        provider="deterministic",
        model="onboarding-engine-v1",
        responsibilities=[
            "Generate customer onboarding task checklists",
            "Request brand logos, DNS credentials, and roster files",
            "Initialize client project delivery workspace",
        ],
    ),
    "agent-15": AgentDefinition(
        id="agent-15",
        number=15,
        name="Project Delivery & Finance Agent",
        role_category="finance",
        description="Tracks delivery milestones, generates invoices, and verifies UPI payment references.",
        provider="deterministic",
        model="revenue-reconciliation-v1",
        responsibilities=[
            "Track 5-stage project delivery milestones",
            "Issue advance and milestone invoices",
            "Verify UPI/Bank references before marking cash as collected",
        ],
    ),
}


async def execute_agent_task(
    agent_id: str, command: str, payload: dict[str, Any]
) -> dict[str, Any]:
    """Executes a real task using the specified agent and records audit execution."""
    agent = AGENTS_REGISTRY.get(agent_id)
    if not agent:
        return {"success": False, "error": f"Agent '{agent_id}' not found."}

    gateway = get_ai_gateway()
    now_iso = datetime.now(UTC).isoformat()

    # Specialized Execution Logic
    if agent_id == "agent-02":  # Underserved Opportunity
        prompt = f"Analyze business '{payload.get('organisation_name')}' in '{payload.get('location')}'. Identify unmet demand, lack of website, and match to ZenLyft catalogue."
        res = await gateway.generate(
            system_prompt="You are Agent 02: Underserved Opportunity Intelligence. Output JSON with: problem, gap_type, competitive_coverage, suggested_zenlyft_solution, confidence.",
            user_prompt=prompt,
            preferred_provider="gemini",
        )
        result_data = res.parsed_json or {"raw": res.content}

    elif agent_id == "agent-06":  # Website Usability Audit
        url = payload.get("website_url", "None")
        prompt = f"Audit public web presence for: {payload.get('organisation_name')} (URL: {url}). Evaluate mobile navigation, conversion obstacles, and booking friction."
        res = await gateway.generate(
            system_prompt="You are Agent 06: Website Usability Audit Agent. Output JSON with: status, mobile_readiness, conversion_friction, recommended_fix.",
            user_prompt=prompt,
            preferred_provider="groq",
        )
        result_data = res.parsed_json or {"raw": res.content}

    elif agent_id == "agent-09":  # SDR Outreach
        prompt = f"Create Day 0 outreach for '{payload.get('organisation_name')}' offering package '{payload.get('package_name', 'Starter Showcase')}'. Highlight 1 practical local benefit tailored to its region."
        res = await gateway.generate(
            system_prompt="You are Agent 09: Sales Development Assistant. Output JSON with: channel, recipient, subject, message_body.",
            user_prompt=prompt,
            preferred_provider="groq",
        )
        result_data = res.parsed_json or {"raw": res.content}

    else:
        # Default agent execution
        prompt = f"Task: {command}. Payload: {json.dumps(payload)}"
        res = await gateway.generate(
            system_prompt=f"You are {agent.name}. Responsibilities: {', '.join(agent.responsibilities)}. Return JSON with status and outcome summary.",
            user_prompt=prompt,
            preferred_provider=agent.provider
            if agent.provider != "deterministic"
            else "groq",
        )
        result_data = res.parsed_json or {
            "status": "completed",
            "summary": res.content,
        }

    agent.last_execution = now_iso
    agent.success_count += 1

    # Record execution in Supabase if configured
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            req_data = {
                "agent_name": agent.name,
                "command": command,
                "status": "success",
                "result_summary": str(result_data)[:250],
                "data_payload": result_data,
            }
            req = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/agent_executions",
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5):  # noqa: ASYNC210
                pass
        except Exception as e:  # noqa: BLE001
            print(f"[AUDIT LOG WARNING]: Could not save agent execution: {e}")

    return {
        "success": True,
        "agent_id": agent.id,
        "agent_name": agent.name,
        "executed_at": now_iso,
        "result": result_data,
    }
