"""Unified 59-Agent Registry across 9 Departments with Hierarchy & Concurrency Control."""

from dataclasses import dataclass
from typing import Any

from ascension.backend.models.schemas import AgentRoleSpec, DepartmentId, MemoryScope, RoleTier


class ConcurrencyLimitError(RuntimeError):
    """Raised when activating another agent would exceed the active slot limit."""


@dataclass(frozen=True)
class DepartmentSpec:
    department_id: DepartmentId
    display_name: str
    manager_agent_id: str
    target_headcount: int


DEPARTMENTS: dict[DepartmentId, DepartmentSpec] = {
    DepartmentId.EXECUTIVE_OFFICE: DepartmentSpec(
        DepartmentId.EXECUTIVE_OFFICE, "Executive Office", "asc-01", 5
    ),
    DepartmentId.MARKET_INTELLIGENCE: DepartmentSpec(
        DepartmentId.MARKET_INTELLIGENCE, "Market Intelligence", "asc-06", 8
    ),
    DepartmentId.LEAD_GENERATION: DepartmentSpec(
        DepartmentId.LEAD_GENERATION, "Lead Generation", "asc-14", 10
    ),
    DepartmentId.SALES_BD: DepartmentSpec(
        DepartmentId.SALES_BD, "Sales & Business Development", "asc-24", 8
    ),
    DepartmentId.MARKETING: DepartmentSpec(
        DepartmentId.MARKETING, "Marketing", "asc-32", 6
    ),
    DepartmentId.ENGINEERING_PRODUCT: DepartmentSpec(
        DepartmentId.ENGINEERING_PRODUCT, "Engineering & Product", "asc-38", 8
    ),
    DepartmentId.FINANCE_ADMIN: DepartmentSpec(
        DepartmentId.FINANCE_ADMIN, "Finance & Administration", "asc-46", 4
    ),
    DepartmentId.RESEARCH_INNOVATION: DepartmentSpec(
        DepartmentId.RESEARCH_INNOVATION, "Research & Innovation", "asc-50", 5
    ),
    DepartmentId.QUALITY_SECURITY_COMPLIANCE: DepartmentSpec(
        DepartmentId.QUALITY_SECURITY_COMPLIANCE, "Quality, Security & Compliance", "asc-55", 5
    ),
}

# Initial 5 active cloud starter roles (3-5 active agents policy)
INITIAL_ACTIVE_AGENT_IDS: frozenset[str] = frozenset(
    {
        "asc-01",  # CEO Orchestrator
        "asc-07",  # Market Research Agent
        "asc-15",  # Prospect Discovery Agent
        "asc-17",  # Lead Qualification Agent
        "asc-25",  # Sales Strategy Agent
    }
)


def _scope_set(*extra: MemoryScope) -> list[MemoryScope]:
    return [MemoryScope.COMPANY, MemoryScope.PRODUCT, MemoryScope.TASK, *extra]


def _build_59_roles() -> list[AgentRoleSpec]:
    """Build exact 59-role taxonomy across the 9 ZenLyft Ascension departments."""
    specs: list[tuple[str, str, str, DepartmentId, RoleTier, str, list[str], list[str], list[MemoryScope], str, str]] = [
        # 1. Executive Office (5) -> asc-01 .. asc-05
        ("asc-01", "CEO-ORCH", "CEO Orchestrator", DepartmentId.EXECUTIVE_OFFICE, RoleTier.EXECUTIVE, "founder",
         ["Decompose founder objectives", "Assign departments", "Track SLA & blockages", "Escalate approvals"],
         ["langgraph_delegate", "memory_read", "memory_write", "approval_request"],
         [MemoryScope.FOUNDER, MemoryScope.COMPANY, MemoryScope.DEPARTMENT, MemoryScope.TASK, MemoryScope.PERFORMANCE, MemoryScope.PRODUCT],
         "groq", "qwen/qwen3.8-27b"),
        ("asc-02", "COS-EXEC", "Chief of Staff Coordinator", DepartmentId.EXECUTIVE_OFFICE, RoleTier.MANAGER, "asc-01",
         ["Synthesize cross-department daily digests", "Enforce follow-through on action items"],
         ["memory_read", "memory_write"],
         [MemoryScope.FOUNDER, MemoryScope.COMPANY, MemoryScope.DEPARTMENT, MemoryScope.PERFORMANCE],
         "groq", "qwen/qwen3.8-27b"),
        ("asc-03", "GENI-DIR", "G.E.N.I. Strategic Intelligence Director", DepartmentId.EXECUTIVE_OFFICE, RoleTier.SPECIALIST, "asc-01",
         ["Long-horizon product-market synthesis", "Prioritize high-margin verticals"],
         ["memory_read", "memory_write"],
         [MemoryScope.FOUNDER, MemoryScope.COMPANY, MemoryScope.PRODUCT, MemoryScope.PERFORMANCE],
         "gemini", "gemini-flash-lite-latest"),
        ("asc-04", "OKR-SPEC", "KPI & Revenue Telemetry Analyst", DepartmentId.EXECUTIVE_OFFICE, RoleTier.SPECIALIST, "asc-01",
         ["Track weekly 100+ leads target and >=10% conversion", "Flag funnel drop-offs"],
         ["memory_read", "pipeline_metrics"],
         [MemoryScope.COMPANY, MemoryScope.PERFORMANCE, MemoryScope.PROSPECT],
         "groq", "qwen/qwen3.8-27b"),
        ("asc-05", "ESC-MGR", "Founder Escalation & Decision Briefer", DepartmentId.EXECUTIVE_OFFICE, RoleTier.SPECIALIST, "asc-01",
         ["Prepare 1-tap approval dossiers", "Bundle cryptographic hashes & evidence links"],
         ["memory_read", "approval_request"],
         [MemoryScope.FOUNDER, MemoryScope.COMPANY, MemoryScope.PROSPECT, MemoryScope.TASK],
         "groq", "qwen/qwen3.8-27b"),

        # 2. Market Intelligence (8) -> asc-06 .. asc-13
        ("asc-06", "MKTINT-MGR", "Market Intelligence Manager", DepartmentId.MARKET_INTELLIGENCE, RoleTier.MANAGER, "asc-01",
         ["Coordinate regional & institutional market scans", "Verify source citations"],
         ["memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-07", "MKT-RES", "Market Research Agent", DepartmentId.MARKET_INTELLIGENCE, RoleTier.SPECIALIST, "asc-06",
         ["Research college & hostel software needs for HOMS", "Document pain points with evidence"],
         ["public_web_fetch", "memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "gemini", "gemini-flash-lite-latest"),
        ("asc-08", "COMP-ANA", "Competitor Benchmarking Analyst", DepartmentId.MARKET_INTELLIGENCE, RoleTier.SPECIALIST, "asc-06",
         ["Compare ERP/HMS vendors against ZenLyft HOMS ₹35,000 tier", "Identify service gaps"],
         ["memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-09", "GAP-UND", "Underserved Segment Detector", DepartmentId.MARKET_INTELLIGENCE, RoleTier.SPECIALIST, "asc-06",
         ["Flag institutions running paper outpass registers or lacking portals"],
         ["public_web_fetch", "memory_read"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "gemini", "gemini-flash-lite-latest"),
        ("asc-10", "GEO-EXP", "State & City Expansion Planner", DepartmentId.MARKET_INTELLIGENCE, RoleTier.SPECIALIST, "asc-06",
         ["Map Tamil Nadu, Karnataka, Kerala engineering/arts college clusters"],
         ["osm_discovery", "memory_read"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-11", "REG-POL", "Education Compliance Monitor", DepartmentId.MARKET_INTELLIGENCE, RoleTier.SPECIALIST, "asc-06",
         ["Track hostel safety & parent notification norms relevant to HOMS"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-12", "PRICE-INT", "Institutional Pricing Intelligence", DepartmentId.MARKET_INTELLIGENCE, RoleTier.SPECIALIST, "asc-06",
         ["Benchmark budget cycles & annual maintenance sensitivity for colleges"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-13", "CAT-FIT", "Catalogue Fit Strategist", DepartmentId.MARKET_INTELLIGENCE, RoleTier.SPECIALIST, "asc-06",
         ["Map institutional problems to HOMS vs Growth/Starter bundles"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "gemini", "gemini-flash-lite-latest"),

        # 3. Lead Generation (10) -> asc-14 .. asc-23
        ("asc-14", "LEADGEN-MGR", "Lead Generation Manager", DepartmentId.LEAD_GENERATION, RoleTier.MANAGER, "asc-01",
         ["Enforce zero-fabrication sourcing", "Manage weekly 100+ verified institutional quota"],
         ["memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-15", "PROSP-DISC", "Prospect Discovery Agent", DepartmentId.LEAD_GENERATION, RoleTier.SPECIALIST, "asc-14",
         ["Discover physical colleges, hostels & clinics via Overpass/Nominatim", "Attach source attribution"],
         ["osm_discovery", "memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-16", "CONTACT-ENR", "Public Contact Enrichment Agent", DepartmentId.LEAD_GENERATION, RoleTier.SPECIALIST, "asc-14",
         ["Verify official website status & public administrative numbers"],
         ["public_web_fetch", "memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "gemini", "gemini-flash-lite-latest"),
        ("asc-17", "LEAD-QUAL", "Lead Qualification Agent", DepartmentId.LEAD_GENERATION, RoleTier.SPECIALIST, "asc-14",
         ["Compute deterministic 0-100 HOMS relevance & reachability score"],
         ["lead_scorer", "memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-18", "DEDUP-ENG", "CRM Deduplication & Hygiene Specialist", DepartmentId.LEAD_GENERATION, RoleTier.SPECIALIST, "asc-14",
         ["Prevent duplicate leads across OSM tags, phone digits & normalized names"],
         ["crm_dedup", "memory_read"], _scope_set(MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-19", "EDU-SCOUT", "College & University Directory Scout", DepartmentId.LEAD_GENERATION, RoleTier.SPECIALIST, "asc-14",
         ["Extract campus hostel counts & engineering department presence from public listings"],
         ["osm_discovery", "public_web_fetch"], _scope_set(MemoryScope.PROSPECT), "gemini", "gemini-flash-lite-latest"),
        ("asc-20", "HOSTEL-SPEC", "Hostel & PG Cluster Researcher", DepartmentId.LEAD_GENERATION, RoleTier.SPECIALIST, "asc-14",
         ["Identify private hostels & student accommodations needing digital outpass"],
         ["osm_discovery", "public_web_fetch"], _scope_set(MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-21", "HEALTH-SCOUT", "Clinic & Hospital Prospect Scout", DepartmentId.LEAD_GENERATION, RoleTier.SPECIALIST, "asc-14",
         ["Discover high-footfall clinics for Starter/Growth secondary pipeline"],
         ["osm_discovery"], _scope_set(MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-22", "WEB-AUDIT", "Website & Portal Usability Auditor", DepartmentId.LEAD_GENERATION, RoleTier.SPECIALIST, "asc-14",
         ["Inspect public institutional sites for mobile broken CTAs & missing booking"],
         ["public_web_fetch", "memory_write"], _scope_set(MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-23", "DM-MAP", "Decision-Maker Role Mapper", DepartmentId.LEAD_GENERATION, RoleTier.SPECIALIST, "asc-14",
         ["Identify Warden / Principal / Trust Office titles strictly from official pages"],
         ["public_web_fetch", "memory_read"], _scope_set(MemoryScope.PROSPECT), "gemini", "gemini-flash-lite-latest"),

        # 4. Sales & Business Development (8) -> asc-24 .. asc-31
        ("asc-24", "SALES-MGR", "Sales & BD Manager", DepartmentId.SALES_BD, RoleTier.MANAGER, "asc-01",
         ["Own HOMS conversion pipeline", "Enforce founder approval gate on proposals & outreach"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-25", "SALES-STRAT", "Sales Strategy Agent", DepartmentId.SALES_BD, RoleTier.SPECIALIST, "asc-24",
         ["Prepare tailored HOMS value framing, demo plan & approval-gated outreach draft"],
         ["memory_read", "memory_write", "draft_generator", "approval_request"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-26", "SDR-OUT", "Approved Template Outreach Coordinator", DepartmentId.SALES_BD, RoleTier.SPECIALIST, "asc-24",
         ["Hydrate founder-approved WhatsApp/Email templates without unapproved edits"],
         ["draft_generator", "approval_request"], _scope_set(MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-27", "FOLLOWUP-CRD", "Cadence Follow-Up Coordinator", DepartmentId.SALES_BD, RoleTier.SPECIALIST, "asc-24",
         ["Queue Day 3/7/12/18 follow-ups; pause immediately on reply or opt-out"],
         ["memory_read", "draft_generator", "approval_request"], _scope_set(MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-28", "AE-DEMO", "Account Executive Demo Architect", DepartmentId.SALES_BD, RoleTier.SPECIALIST, "asc-24",
         ["Build 15-minute HOMS walkthrough agendas tailored to Principal/Warden concerns"],
         ["memory_read", "draft_generator"], _scope_set(MemoryScope.PROSPECT), "gemini", "gemini-flash-lite-latest"),
        ("asc-29", "PROP-WRIT", "Institutional Proposal Drafter", DepartmentId.SALES_BD, RoleTier.SPECIALIST, "asc-24",
         ["Generate structured HOMS commercial proposals within approved pricing rules"],
         ["memory_read", "draft_generator", "approval_request"], _scope_set(MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-30", "OBJ-NEG", "Objection & Discount Guard", DepartmentId.SALES_BD, RoleTier.SPECIALIST, "asc-24",
         ["Handle budget/deployment objections; enforce 10-15% max ceiling escalation"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-31", "DEAL-CLOSE", "Deal Closing & Handoff Coordinator", DepartmentId.SALES_BD, RoleTier.SPECIALIST, "asc-24",
         ["Verify signed acceptance & advance receipt before triggering onboarding"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.PROSPECT, MemoryScope.PERFORMANCE), "groq", "qwen/qwen3.8-27b"),

        # 5. Marketing (6) -> asc-32 .. asc-37
        ("asc-32", "MKTG-MGR", "Marketing Department Manager", DepartmentId.MARKETING, RoleTier.MANAGER, "asc-01",
         ["Ensure consistent brand positioning and founder sign-off on external publishing"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-33", "MKT-COPY", "Bilingual Positioning Copywriter (EN/TA)", DepartmentId.MARKETING, RoleTier.SPECIALIST, "asc-32",
         ["Craft Tamil & English outreach snippets queued for template approval"],
         ["draft_generator", "approval_request"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-34", "CASE-STD", "HOMS ROI Case Brief Author", DepartmentId.MARKETING, RoleTier.SPECIALIST, "asc-32",
         ["Package verified digital outpass time-savings & safety proofs"],
         ["memory_read", "draft_generator"], _scope_set(MemoryScope.DEPARTMENT), "gemini", "gemini-flash-lite-latest"),
        ("asc-35", "SEO-CONT", "Institutional Landing Copy Analyst", DepartmentId.MARKETING, RoleTier.SPECIALIST, "asc-32",
         ["Draft campus digital transformation briefs gated for approval before publish"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-36", "WA-TPL", "WhatsApp Engagement Sequence Designer", DepartmentId.MARKETING, RoleTier.SPECIALIST, "asc-32",
         ["Design low-friction opt-in compliant institutional WhatsApp message flows"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-37", "CAMP-ANA", "Campaign Response Attribution Analyst", DepartmentId.MARKETING, RoleTier.SPECIALIST, "asc-32",
         ["Measure real reply rates per city and institutional vertical"],
         ["pipeline_metrics", "memory_read"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PERFORMANCE), "groq", "qwen/qwen3.8-27b"),

        # 6. Engineering & Product (8) -> asc-38 .. asc-45
        ("asc-38", "ENG-MGR", "VP Engineering & Product Manager", DepartmentId.ENGINEERING_PRODUCT, RoleTier.MANAGER, "asc-01",
         ["Coordinate HOMS product readiness, workflow reliability & cloud footprint"],
         ["memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.AGENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-39", "LG-ARCH", "LangGraph Control Plane Engineer", DepartmentId.ENGINEERING_PRODUCT, RoleTier.SPECIALIST, "asc-38",
         ["Maintain StateGraph transitions, Postgres checkpointing & retry policies"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-40", "CREW-ENG", "CrewAI Specialist Adapter Engineer", DepartmentId.ENGINEERING_PRODUCT, RoleTier.SPECIALIST, "asc-38",
         ["Tune bounded specialist crews & tool bindings"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-41", "ORCH-MEM", "Workspace & Brain Memory Architect", DepartmentId.ENGINEERING_PRODUCT, RoleTier.SPECIALIST, "asc-38",
         ["Curate provenance schema, trust decay & poisoning filters"],
         ["memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-42", "N8N-INT", "Automation & Webhook Reliability Engineer", DepartmentId.ENGINEERING_PRODUCT, RoleTier.SPECIALIST, "asc-38",
         ["Maintain n8n webhooks, Telegram notifications & cloud keep-alive health"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-43", "HOMS-PROD", "HOMS Product Delivery Lead", DepartmentId.ENGINEERING_PRODUCT, RoleTier.SPECIALIST, "asc-38",
         ["Prepare multi-hostel onboarding templates, QR gatepass & warden app checklists"],
         ["memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT), "gemini", "gemini-flash-lite-latest"),
        ("asc-44", "FE-UX", "Command Dashboard UI Specialist", DepartmentId.ENGINEERING_PRODUCT, RoleTier.SPECIALIST, "asc-38",
         ["Specify Next.js org-chart & approval UX refinements"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-45", "ONB-OPS", "Client Provisioning & Onboarding Specialist", DepartmentId.ENGINEERING_PRODUCT, RoleTier.SPECIALIST, "asc-38",
         ["Build 5-stage client kickoff task lists upon founder-confirmed deal close"],
         ["memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),

        # 7. Finance & Administration (4) -> asc-46 .. asc-49
        ("asc-46", "FIN-MGR", "Finance & Operations Controller", DepartmentId.FINANCE_ADMIN, RoleTier.MANAGER, "asc-01",
         ["Enforce strict ₹0 cloud & API budget ceiling; require approval for any payment"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PERFORMANCE), "groq", "qwen/qwen3.8-27b"),
        ("asc-47", "INV-OPS", "Invoice & Milestone Draft Specialist", DepartmentId.FINANCE_ADMIN, RoleTier.SPECIALIST, "asc-46",
         ["Prepare GST-ready invoice & advance milestone schedules for founder review"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-48", "TOKEN-AUD", "LLM Token & Free-Quota Auditor", DepartmentId.FINANCE_ADMIN, RoleTier.SPECIALIST, "asc-46",
         ["Audit token spend across Groq/Gemini/DeepSeek/Kimi/GLM and trigger caps"],
         ["pipeline_metrics", "memory_read"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PERFORMANCE), "groq", "qwen/qwen3.8-27b"),
        ("asc-49", "ADMIN-REC", "Legal Contracts & Record Keeper", DepartmentId.FINANCE_ADMIN, RoleTier.SPECIALIST, "asc-46",
         ["Track MSA/SLA drafts and block record deletion without founder authorization"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),

        # 8. Research & Innovation (5) -> asc-50 .. asc-54
        ("asc-50", "RND-MGR", "Research & G.E.N.I. Innovation Lead", DepartmentId.RESEARCH_INNOVATION, RoleTier.MANAGER, "asc-01",
         ["Evaluate new open models, evaluation harnesses & G.E.N.I. architecture"],
         ["memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT), "gemini", "gemini-flash-lite-latest"),
        ("asc-51", "EVAL-SCI", "Agent Benchmark & Eval Scientist", DepartmentId.RESEARCH_INNOVATION, RoleTier.SPECIALIST, "asc-50",
         ["Design deterministic eval benchmarks for lead qualification & draft quality"],
         ["memory_read", "pipeline_metrics"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PERFORMANCE), "groq", "qwen/qwen3.8-27b"),
        ("asc-52", "MOD-OPT", "Model Routing & Latency Optimizer", DepartmentId.RESEARCH_INNOVATION, RoleTier.SPECIALIST, "asc-50",
         ["Benchmark Groq/Gemini/GLM/DeepSeek latency vs accuracy for each department"],
         ["pipeline_metrics", "memory_read"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-53", "GENI-TUN", "Proprietary Knowledge Curations Engineer", DepartmentId.RESEARCH_INNOVATION, RoleTier.SPECIALIST, "asc-50",
         ["Transform winning sales transcripts into curated verified_fact playbooks"],
         ["memory_read", "memory_write"], _scope_set(MemoryScope.DEPARTMENT), "gemini", "gemini-flash-lite-latest"),
        ("asc-54", "NEW-PRD", "Post-HOMS Vertical Expansion Researcher", DepartmentId.RESEARCH_INNOVATION, RoleTier.SPECIALIST, "asc-50",
         ["Explore next institutional SaaS offerings using proven HOMS acquisition data"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT), "gemini", "gemini-flash-lite-latest"),

        # 9. Quality, Security & Compliance (5) -> asc-55 .. asc-59
        ("asc-55", "SEC-MGR", "CISO & Compliance Manager", DepartmentId.QUALITY_SECURITY_COMPLIANCE, RoleTier.MANAGER, "asc-01",
         ["Enforce kill switch readiness, RBAC policies & zero unapproved actions"],
         ["memory_read", "approval_request"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PERFORMANCE), "groq", "qwen/qwen3.8-27b"),
        ("asc-56", "FACT-QA", "Zero-Hallucination Evidence Verifier", DepartmentId.QUALITY_SECURITY_COMPLIANCE, RoleTier.SPECIALIST, "asc-55",
         ["Reject any lead or claim missing real public URL/OSM provenance"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-57", "SEC-AUD", "Prompt Injection & Memory Poisoning Auditor", DepartmentId.QUALITY_SECURITY_COMPLIANCE, RoleTier.SPECIALIST, "asc-55",
         ["Inspect external fetched content & memory writes for adversarial payloads"],
         ["memory_read"], _scope_set(MemoryScope.DEPARTMENT), "groq", "qwen/qwen3.8-27b"),
        ("asc-58", "PRIV-GDPR", "Data Privacy & Opt-Out Enforcer", DepartmentId.QUALITY_SECURITY_COMPLIANCE, RoleTier.SPECIALIST, "asc-55",
         ["Verify opt-out flags before any follow-up recommendation or draft generation"],
         ["memory_read"], _scope_set(MemoryScope.PROSPECT), "groq", "qwen/qwen3.8-27b"),
        ("asc-59", "SRE-REL", "Cloud Reliability & Dead-Letter Recovery Agent", DepartmentId.QUALITY_SECURITY_COMPLIANCE, RoleTier.SPECIALIST, "asc-55",
         ["Monitor failed runs, checkpoint recovery & dead-letter queue alerts"],
         ["memory_read", "pipeline_metrics"], _scope_set(MemoryScope.DEPARTMENT, MemoryScope.PERFORMANCE), "groq", "qwen/qwen3.8-27b"),
    ]

    roles: list[AgentRoleSpec] = []
    for agent_id, code, name, dept, tier, reports_to, resp, tools, scopes, provider, model in specs:
        roles.append(
            AgentRoleSpec(
                agent_id=agent_id,
                code=code,
                name=name,
                role=name,
                goal=resp[0],
                backstory=f"ZenLyft Ascension {name} inside {DEPARTMENTS[dept].display_name} reporting to {reports_to}.",
                department=dept,
                tier=tier,
                reports_to=reports_to,
                responsibilities=resp,
                skills=[s.lower().replace(" ", "_") for s in resp[:2]],
                allowed_tools=tools,
                allowed_memory_scopes=scopes,
                permissions=["internal_research", "structured_output"]
                + (["request_founder_approval"] if "approval_request" in tools else []),
                preferred_provider=provider,
                model=model,
                active=(agent_id in INITIAL_ACTIVE_AGENT_IDS),
                evaluation_criteria=[
                    "Zero fabricated entities or contacts",
                    "Respects token budget and max delegation depth",
                ],
            )
        )
    return roles


class UnifiedAgentRegistry:
    """In-memory + cloud-syncable registry managing 59 logical roles and bounded active slots."""

    def __init__(self, max_concurrent_active: int = 5) -> None:
        self.max_concurrent_active = max_concurrent_active
        self._agents: dict[str, AgentRoleSpec] = {
            agent.agent_id: agent for agent in _build_59_roles()
        }

    def count_total(self) -> int:
        return len(self._agents)

    def list_all(self) -> list[AgentRoleSpec]:
        return list(self._agents.values())

    def list_active(self) -> list[AgentRoleSpec]:
        return [a for a in self._agents.values() if a.active]

    def list_by_department(self, department: DepartmentId) -> list[AgentRoleSpec]:
        return [a for a in self._agents.values() if a.department == department]

    def get(self, agent_id: str) -> AgentRoleSpec:
        if agent_id not in self._agents:
            raise KeyError(f"Agent '{agent_id}' not found in UnifiedAgentRegistry.")
        return self._agents[agent_id]

    def activate(self, agent_id: str) -> AgentRoleSpec:
        agent = self.get(agent_id)
        if not agent.active:
            if len(self.list_active()) >= self.max_concurrent_active:
                raise ConcurrencyLimitError(
                    f"Cannot activate '{agent_id}': active agent limit ({self.max_concurrent_active}) reached. Deactivate another agent first."
                )
            agent.active = True
        return agent

    def deactivate(self, agent_id: str) -> AgentRoleSpec:
        agent = self.get(agent_id)
        agent.active = False
        return agent

    def register_agent(self, spec: AgentRoleSpec) -> AgentRoleSpec:
        if spec.reports_to != "founder" and spec.reports_to not in self._agents:
            raise ValueError(f"Reporting manager '{spec.reports_to}' does not exist.")
        if spec.active and len(self.list_active()) >= self.max_concurrent_active:
            raise ConcurrencyLimitError(
                f"Cannot register active agent '{spec.agent_id}': concurrency cap ({self.max_concurrent_active}) reached."
            )
        self._agents[spec.agent_id] = spec
        return spec

    def assign_provider(self, agent_id: str, provider: str, model: str) -> AgentRoleSpec:
        agent = self.get(agent_id)
        agent.preferred_provider = provider
        agent.model = model
        return agent

    def record_outcome(self, agent_id: str, success: bool) -> None:
        agent = self.get(agent_id)
        if success:
            agent.completed_tasks += 1
        else:
            agent.failed_tasks += 1

    def org_summary(self) -> dict[str, Any]:
        dept_counts: dict[str, dict[str, Any]] = {}
        for dept_id, meta in DEPARTMENTS.items():
            members = self.list_by_department(dept_id)
            dept_counts[dept_id.value] = {
                "name": meta.display_name,
                "manager_agent_id": meta.manager_agent_id,
                "total": len(members),
                "active": sum(1 for m in members if m.active),
            }
        return {
            "total_roles": len(self._agents),
            "active_count": len(self.list_active()),
            "max_concurrent_active": self.max_concurrent_active,
            "departments": dept_counts,
        }

