"""Bi-directional Paperclip HTTP Adapter & Control-Plane Bridge for Worldwide Client Acquisition."""

from __future__ import annotations

import hmac
from hashlib import sha256
from typing import Any

import httpx
from pydantic import BaseModel, Field

from ascension.backend.core.config import AscensionSettings
from ascension.workforce.registry.catalog import INITIAL_ACTIVE_AGENT_IDS, UnifiedAgentRegistry

CONTINENTAL_CAMPAIGNS: dict[str, dict[str, Any]] = {
    "global": {
        "label": "All Continents (Global Sweep)",
        "hubs": ["London", "New York", "Singapore", "Dubai", "Toronto", "Sydney"],
        "cron": "0 */6 * * *",
        "timezone": "UTC",
    },
    "north_america": {
        "label": "North America",
        "hubs": ["New York", "Toronto", "Austin", "Chicago"],
        "cron": "0 14 * * 1-5",
        "timezone": "America/New_York",
    },
    "europe": {
        "label": "Europe & UK",
        "hubs": ["London", "Berlin", "Amsterdam", "Dublin"],
        "cron": "0 9 * * 1-5",
        "timezone": "Europe/London",
    },
    "middle_east": {
        "label": "Middle East & Africa",
        "hubs": ["Dubai", "Abu Dhabi", "Riyadh", "Cape Town"],
        "cron": "0 8 * * 0-4",
        "timezone": "Asia/Dubai",
    },
    "apac": {
        "label": "Asia-Pacific & India",
        "hubs": ["Singapore", "Bengaluru", "Tokyo", "Sydney"],
        "cron": "0 7 * * 1-5",
        "timezone": "Asia/Singapore",
    },
    "latam": {
        "label": "Latin America",
        "hubs": ["Sao Paulo", "Mexico City", "Bogota", "Santiago"],
        "cron": "0 13 * * 1-5",
        "timezone": "America/Sao_Paulo",
    },
}


class PaperclipHeartbeatPayload(BaseModel):
    """Official Paperclip HTTP adapter heartbeat payload (`docs/adapters/http.md`)."""

    runId: str = Field(default="")
    agentId: str = Field(default="asc-01")
    companyId: str = Field(default="")
    context: dict[str, Any] = Field(default_factory=dict)
    city: str | None = None
    region: str | None = None
    objective: str | None = None
    limit: int = Field(default=6, ge=1, le=15)


class PaperclipBridge:
    """Connects ZenLyft Ascension to Paperclip goals, org charts, HTTP heartbeats, and issue queues."""

    def __init__(self, settings: AscensionSettings, registry: UnifiedAgentRegistry) -> None:
        self.settings = settings
        self.registry = registry

    @property
    def is_configured(self) -> bool:
        return bool(
            self.settings.paperclip_api_url.strip()
            and self.settings.paperclip_company_id.strip()
        )

    def _base_api_url(self) -> str:
        raw = self.settings.paperclip_api_url.strip().rstrip("/")
        if not raw:
            return ""
        return raw if raw.endswith("/api") else f"{raw}/api"

    def _headers(self, run_id: str = "") -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.settings.paperclip_api_key.strip():
            headers["Authorization"] = f"Bearer {self.settings.paperclip_api_key.strip()}"
        if run_id:
            headers["X-Paperclip-Run-Id"] = run_id
        return headers

    def verify_inbound_secret(
        self,
        raw_body: bytes,
        authorization: str | None = None,
        x_paperclip_signature: str | None = None,
    ) -> bool:
        """Accept Bearer secret or HMAC-SHA256 signature when configured; allow in open dev mode."""
        secret = (
            self.settings.paperclip_webhook_secret.strip()
            or self.settings.ascension_api_secret.strip()
        )
        if not secret:
            return True

        if authorization and authorization.startswith("Bearer "):
            token = authorization.removeprefix("Bearer ").strip()
            if hmac.compare_digest(token, secret):
                return True

        if x_paperclip_signature:
            provided = x_paperclip_signature.removeprefix("sha256=").strip().lower()
            expected = hmac.new(secret.encode("utf-8"), raw_body, sha256).hexdigest()
            if hmac.compare_digest(provided, expected):
                return True

        return False

    def heartbeat_url(self, public_base_url: str = "") -> str:
        base = (public_base_url or self.settings.ascension_public_url or "").strip().rstrip("/")
        if not base:
            return "/api/v1/paperclip/heartbeat"
        return f"{base}/api/v1/paperclip/heartbeat"

    def resolve_region_hubs(self, region: str | None, fallback_city: str | None = None) -> list[str]:
        if fallback_city and fallback_city.strip() and fallback_city.strip().lower() not in {"global", "world", "worldwide", "all"}:
            return [fallback_city.strip()]
        key = (region or "global").strip().lower()
        campaign = CONTINENTAL_CAMPAIGNS.get(key)
        if campaign:
            return list(campaign["hubs"])
        return list(CONTINENTAL_CAMPAIGNS["global"]["hubs"])

    def status(self, public_base_url: str = "") -> dict[str, Any]:
        return {
            "enabled": True,
            "connected": self.is_configured,
            "mode": "connected_server" if self.is_configured else "embedded_blueprint_ready",
            "api_url": self._base_api_url() or None,
            "company_id": self.settings.paperclip_company_id.strip() or None,
            "webhook_secret_configured": bool(
                self.settings.paperclip_webhook_secret.strip()
                or self.settings.ascension_api_secret.strip()
            ),
            "adapter_type": "http",
            "heartbeat_endpoint": self.heartbeat_url(public_base_url),
            "campaigns": {
                k: {"label": v["label"], "hubs": v["hubs"], "cron": v["cron"], "timezone": v["timezone"]}
                for k, v in CONTINENTAL_CAMPAIGNS.items()
            },
        }

    def build_global_blueprint(self, public_base_url: str = "") -> dict[str, Any]:
        """Build a Paperclip-compatible Company Blueprint for worldwide 24/7 acquisition."""
        hb_url = self.heartbeat_url(public_base_url)
        starter_agents = []
        role_map = {
            "asc-01": "ceo",
            "asc-07": "researcher",
            "asc-15": "growth",
            "asc-17": "analyst",
            "asc-25": "sales",
        }
        for agent_id in sorted(INITIAL_ACTIVE_AGENT_IDS):
            spec = self.registry.get(agent_id)
            starter_agents.append(
                {
                    "externalKey": spec.agent_id,
                    "name": f"{spec.code} — {spec.name}",
                    "role": role_map.get(spec.agent_id, "general"),
                    "title": spec.name,
                    "capabilities": "; ".join(spec.responsibilities),
                    "budgetMonthlyCents": 0,
                    "adapterType": "http",
                    "adapterConfig": {
                        "url": hb_url,
                        "timeoutSec": 90,
                        "headers": {
                            "Content-Type": "application/json",
                        },
                    },
                }
            )

        routines = []
        for region_key, cfg in CONTINENTAL_CAMPAIGNS.items():
            routines.append(
                {
                    "title": f"Global Client Sweep — {cfg['label']}",
                    "description": (
                        f"Discover & qualify colleges, hostels, and digital institutions across "
                        f"{', '.join(cfg['hubs'])} via ZenLyft Ascension ({region_key})."
                    ),
                    "region": region_key,
                    "assigneeExternalKey": "asc-01",
                    "priority": "high" if region_key == "global" else "medium",
                    "status": "active",
                    "concurrencyPolicy": "coalesce_if_active",
                    "catchUpPolicy": "skip_missed",
                    "trigger": {
                        "kind": "schedule",
                        "cronExpression": cfg["cron"],
                        "timezone": cfg["timezone"],
                    },
                }
            )

        return {
            "schema": "paperclip.company.blueprint.v1",
            "source_repo": "https://github.com/paperclipai/paperclip",
            "companyName": "ZenLyft Global Acquisition HQ",
            "zeroCostPolicy": {"allowPaidFallback": False, "budgetMonthlyCents": 0},
            "goal": {
                "title": "Acquire 100+ Global HOMS & Digital Transformation Clients Worldwide",
                "description": (
                    "Autonomous multi-continent lead discovery, evidence-verified qualification, "
                    "and Founder 1-tap approval outreach across Americas, Europe, MEA, and APAC."
                ),
                "level": "company",
                "status": "active",
            },
            "agents": starter_agents,
            "routines": routines,
        }

    async def push_qualified_leads_as_issues(
        self,
        *,
        qualified_leads: list[dict[str, Any]],
        drafts: list[dict[str, Any]],
        company_id: str = "",
        parent_task_id: str = "",
        run_id: str = "",
    ) -> dict[str, Any]:
        """Push qualified global leads into Paperclip's issue queue when configured."""
        target_company = company_id.strip() or self.settings.paperclip_company_id.strip()
        api_base = self._base_api_url()
        if not api_base or not target_company:
            return {"pushed": False, "created_count": 0, "reason": "PAPERCLIP_API_URL / PAPERCLIP_COMPANY_ID not configured"}

        draft_by_org = {d.get("organisation_name"): d for d in drafts}
        created: list[dict[str, Any]] = []
        errors: list[str] = []

        async with httpx.AsyncClient(timeout=10.0) as client:
            for lead in qualified_leads:
                score = int(lead.get("homs_score") or 0)
                if score < 60:
                    continue
                org = lead.get("organisation_name", "Verified Prospect")
                city = lead.get("city", "Global")
                draft = draft_by_org.get(org, {})
                description = (
                    f"**Verified Source:** {lead.get('source_ref')}\n"
                    f"**Market / City:** {city}\n"
                    f"**Category:** {lead.get('category')}\n"
                    f"**HOMS Fit Score:** {score}/100 ({lead.get('priority')})\n"
                    f"**Recommended Offer:** {lead.get('recommended_product')}\n\n"
                    f"### Founder-Gated Outreach Draft\n"
                    f"**Approval Hash:** `{draft.get('approval_hash', 'pending')}`\n\n"
                    f"{draft.get('draft_message', '')}"
                )
                payload: dict[str, Any] = {
                    "title": f"[Lead {score}/100] {org} ({city})",
                    "description": description,
                    "status": "todo",
                    "priority": "high" if score >= 80 else "medium",
                }
                if parent_task_id:
                    payload["parentId"] = parent_task_id

                try:
                    resp = await client.post(
                        f"{api_base}/companies/{target_company}/issues",
                        json=payload,
                        headers=self._headers(run_id=run_id),
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    created.append({"id": data.get("id"), "identifier": data.get("identifier"), "title": payload["title"]})
                except Exception as exc:
                    errors.append(f"{org}: {exc}")

        return {"pushed": True, "created_count": len(created), "issues": created, "errors": errors}

    async def report_heartbeat_outcome(
        self,
        *,
        task_id: str,
        summary_markdown: str,
        run_id: str = "",
    ) -> bool:
        """Comment execution outcome back onto the Paperclip task that woke Ascension."""
        api_base = self._base_api_url()
        if not api_base or not task_id.strip():
            return False
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.patch(
                    f"{api_base}/issues/{task_id.strip()}",
                    json={"comment": summary_markdown},
                    headers=self._headers(run_id=run_id),
                )
                resp.raise_for_status()
                return True
        except Exception:
            return False

    async def sync_blueprint_to_server(self, public_base_url: str = "") -> dict[str, Any]:
        """Idempotently provision ZenLyft's Global Acquisition goal & agents into Paperclip."""
        blueprint = self.build_global_blueprint(public_base_url)
        api_base = self._base_api_url()
        company_id = self.settings.paperclip_company_id.strip()
        if not api_base or not company_id:
            return {
                "synced": False,
                "mode": "embedded_blueprint_ready",
                "reason": "Configure PAPERCLIP_API_URL and PAPERCLIP_COMPANY_ID to push directly to a Paperclip server.",
                "blueprint": blueprint,
            }

        headers = self._headers()
        async with httpx.AsyncClient(timeout=12.0) as client:
            goals_resp = await client.get(f"{api_base}/companies/{company_id}/goals", headers=headers)
            goals_resp.raise_for_status()
            existing_goals = goals_resp.json()
            goal_title = blueprint["goal"]["title"]
            goal_id = next((g.get("id") for g in existing_goals if g.get("title") == goal_title), None)
            if not goal_id:
                create_goal = await client.post(
                    f"{api_base}/companies/{company_id}/goals",
                    json=blueprint["goal"],
                    headers=headers,
                )
                create_goal.raise_for_status()
                goal_id = create_goal.json().get("id")

            agents_resp = await client.get(f"{api_base}/companies/{company_id}/agents", headers=headers)
            agents_resp.raise_for_status()
            existing_agents = {a.get("name"): a.get("id") for a in agents_resp.json()}
            created_agents: list[str] = []
            for agent in blueprint["agents"]:
                if agent["name"] in existing_agents:
                    continue
                create_agent = await client.post(
                    f"{api_base}/companies/{company_id}/agents",
                    json={k: v for k, v in agent.items() if k != "externalKey"},
                    headers=headers,
                )
                create_agent.raise_for_status()
                existing_agents[agent["name"]] = create_agent.json().get("id")
                created_agents.append(agent["name"])

        return {
            "synced": True,
            "mode": "connected_server",
            "company_id": company_id,
            "goal_id": goal_id,
            "created_agents": created_agents,
            "total_blueprint_agents": len(blueprint["agents"]),
            "total_blueprint_routines": len(blueprint["routines"]),
        }

