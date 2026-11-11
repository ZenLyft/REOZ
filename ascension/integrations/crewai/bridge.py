"""CrewAI Specialist Workforce Bridge — uses CrewAI Agents/Tasks/Crews routed through ZenLyft Gateway."""

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from crewai import Agent, Crew, Process, Task
from crewai.llms.base_llm import BaseLLM
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from ascension.backend.core.security import assert_tool_allowed
from ascension.backend.models.schemas import AgentRoleSpec, FactClassification, MemoryScope
from ascension.business.homs_acquisition import (
    build_approved_homs_outreach_draft,
    qualify_homs_institution,
    query_public_colleges_and_hostels,
)
from ascension.integrations.llm_providers.gateway import UnifiedLLMGateway
from ascension.integrations.orchester.adapter import OrchesterProtocolAdapter
from ascension.workforce.registry.catalog import UnifiedAgentRegistry


def _run_coro_sync(coro: Any) -> Any:
    """Safely run an async coroutine from synchronous CrewAI tool/LLM callbacks."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


class ZenLyftCrewBaseLLM(BaseLLM):
    """Custom CrewAI BaseLLM routing all inference through ZenLyft's ₹0 UnifiedLLMGateway."""

    model: str = "qwen/qwen3.8-27b"
    provider_name: str = "groq"
    token_budget: int = 8000
    gateway: Any = Field(exclude=True)

    def call(
        self,
        messages: str | list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        callbacks: list[Any] | None = None,
        available_functions: dict[str, Any] | None = None,
        from_task: Any | None = None,
        from_agent: Any | None = None,
        response_model: type[BaseModel] | None = None,
    ) -> str | Any:
        normalized: list[dict[str, str]]
        if isinstance(messages, str):
            normalized = [{"role": "user", "content": messages}]
        else:
            normalized = [
                {"role": str(m.get("role", "user")), "content": str(m.get("content", ""))}
                for m in messages
            ]

        fallback_json = json.dumps(
            {
                "status": "deterministic_fallback",
                "provider": self.provider_name,
                "model": self.model,
                "note": "No live free LLM response available; executed safe deterministic fallback.",
            }
        )
        res = _run_coro_sync(
            self.gateway.generate(
                messages=normalized,
                preferred_provider=self.provider_name,
                model=self.model,
                token_budget=self.token_budget,
                deterministic_fallback_text=fallback_json,
            )
        )
        return res.content

    def supports_function_calling(self) -> bool:
        return False


class _OsmDiscoveryArgs(BaseModel):
    city: str = Field(..., description="Target Indian city name, e.g. Coimbatore")
    limit: int = Field(default=5, ge=1, le=20)


class OsmProspectDiscoveryTool(BaseTool):
    name: str = "osm_discovery"
    description: str = "Discover real colleges, universities, and hostels via OpenStreetMap Overpass API."
    args_schema: type[BaseModel] = _OsmDiscoveryArgs
    agent_spec: AgentRoleSpec = Field(exclude=True)

    def _run(self, city: str, limit: int = 5) -> str:
        assert_tool_allowed(self.agent_spec, "osm_discovery")
        result = _run_coro_sync(query_public_colleges_and_hostels(city=city, limit=limit))
        return json.dumps(result)


class ZenLyftSpecialistCrewFactory:
    """Builds bounded CrewAI specialist agents & teams (CrewAI Flows are intentionally omitted)."""

    def __init__(
        self,
        registry: UnifiedAgentRegistry,
        gateway: UnifiedLLMGateway,
        orchester: OrchesterProtocolAdapter,
    ) -> None:
        self.registry = registry
        self.gateway = gateway
        self.orchester = orchester

    def build_crew_agent(self, agent_id: str, tools: list[BaseTool] | None = None) -> Agent:
        spec = self.registry.get(agent_id)
        llm = ZenLyftCrewBaseLLM(
            model=spec.model,
            provider_name=spec.preferred_provider,
            token_budget=spec.max_token_budget,
            gateway=self.gateway,
        )
        return Agent(
            role=spec.role,
            goal=spec.goal,
            backstory=spec.backstory,
            llm=llm,
            tools=tools or [],
            allow_delegation=False,
            max_iter=min(spec.max_iterations, 5),
            verbose=False,
        )

    async def run_first_five_homs_pipeline(
        self,
        city: str,
        objective: str,
        limit: int = 5,
        supplied_prospects: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Execute ZenLyft's 5-agent specialist pipeline (CEO -> Research -> Discovery -> Qual -> Sales)."""
        # Verify all 5 initial agents are active & registered cleanly
        ceo = self.registry.get("asc-01")
        research = self.registry.get("asc-07")
        discovery = self.registry.get("asc-15")
        qual = self.registry.get("asc-17")
        sales = self.registry.get("asc-25")

        assert_tool_allowed(discovery, "osm_discovery")
        assert_tool_allowed(qual, "lead_scorer")
        assert_tool_allowed(sales, "draft_generator")

        # Stage 1: Market Research brief via G.E.N.I. / Gateway (wrapped through CrewAI LLM contract)
        research_res = await self.gateway.generate(
            messages=[
                {
                    "role": "system",
                    "content": "You are ZenLyft Market Research Agent (asc-07). Output concise JSON with pain_points and homs_positioning.",
                },
                {
                    "role": "user",
                    "content": f"Objective: {objective}. Summarize verified HOMS needs in {city}.",
                },
            ],
            preferred_provider=research.preferred_provider,
            model=research.model,
            token_budget=research.max_token_budget,
            deterministic_fallback_text=json.dumps(
                {
                    "pain_points": [
                        "Paper hostel registers slow warden approvals",
                        "Lack of automated SMS/WhatsApp parent outpass alerts",
                    ],
                    "homs_positioning": "ZenLyft HOMS ₹35,000 digital QR gatepass & register automation",
                }
            ),
        )

        await self.orchester.remember(
            agent=research,
            subject=f"HOMS Market Framing — {city}",
            fact_text=research_res.content[:400],
            source=f"agent:{research.agent_id}",
            confidence=0.75,
            scope=MemoryScope.DEPARTMENT,
            classification=FactClassification.ASSUMPTION,
        )

        # Stage 2: Prospect Discovery (real Overpass or caller-supplied verified test fixtures)
        if supplied_prospects is not None:
            raw_prospects = supplied_prospects[:limit]
            discovery_ok = True
            discovery_error = None
        else:
            osm_result = await query_public_colleges_and_hostels(city=city, limit=limit)
            raw_prospects = osm_result.get("prospects", [])
            discovery_ok = osm_result.get("ok", False)
            discovery_error = osm_result.get("error")

        # Stage 3: Deterministic Qualification & Stage 4: Approval-gated Sales Drafts
        qualified_leads: list[dict[str, Any]] = []
        drafts: list[dict[str, Any]] = []

        for p in raw_prospects:
            q = qualify_homs_institution(p)
            qualified_leads.append(q)
            await self.orchester.remember(
                agent=qual,
                subject=q["organisation_name"],
                fact_text=f"HOMS Score {q['homs_score']}/100 ({q['priority']}) — {q['recommended_product']}",
                source=q["source_ref"],
                source_url=q["source_ref"],
                confidence=0.9,
                scope=MemoryScope.PROSPECT,
                classification=FactClassification.VERIFIED_FACT,
            )
            if q["homs_score"] >= 60:
                drafts.append(build_approved_homs_outreach_draft(q))

        self.registry.record_outcome(ceo.agent_id, True)
        self.registry.record_outcome(research.agent_id, True)
        self.registry.record_outcome(discovery.agent_id, discovery_ok)
        self.registry.record_outcome(qual.agent_id, True)
        self.registry.record_outcome(sales.agent_id, True)

        return {
            "crew_engine": "crewai",
            "orchestrator": ceo.agent_id,
            "market_brief": research_res.content,
            "market_provider": research_res.provider,
            "market_error": research_res.error,
            "discovery_ok": discovery_ok,
            "discovery_error": discovery_error,
            "qualified_count": len(qualified_leads),
            "qualified_leads": qualified_leads,
            "pending_outreach_drafts": drafts,
        }

    def run_crew_task_sync(
        self, agent_id: str, description: str, expected_output: str
    ) -> str:
        """Execute a single bounded CrewAI Crew kickoff synchronously (used when Crew narrative collaboration is needed)."""
        crew_agent = self.build_crew_agent(agent_id)
        task = Task(
            description=description,
            expected_output=expected_output,
            agent=crew_agent,
        )
        crew = Crew(
            agents=[crew_agent],
            tasks=[task],
            process=Process.sequential,
            verbose=False,
        )
        result = crew.kickoff()
        return str(result)
