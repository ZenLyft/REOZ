"""Orchester Workspace & Brain Memory Protocol Adapter.

Maintains strict compatibility with lucasmailland/orchester's Brain memory contract
(remember/recall with provenance & poisoning checks) and /api/v1/* workspace surface
without requiring heavy external Postgres pgvector + Redis + Mnemosyne servers at ₹0.
When ORCHESTER_URL and ORCHESTER_API_KEY are supplied, also mirrors compatible API calls.
"""

from typing import Any

import httpx

from ascension.backend.core.config import get_settings
from ascension.backend.models.schemas import (
    AgentRoleSpec,
    FactClassification,
    MemoryFact,
    MemoryScope,
)
from ascension.memory.store import SharedMemoryStore
from ascension.workforce.registry.catalog import UnifiedAgentRegistry


class OrchesterProtocolAdapter:
    """Bridges ZenLyft Ascension's registry and shared memory with Orchester's API contract."""

    def __init__(
        self,
        registry: UnifiedAgentRegistry,
        memory: SharedMemoryStore,
    ) -> None:
        self.registry = registry
        self.memory = memory
        self.settings = get_settings()

    @property
    def mode(self) -> str:
        if self.settings.orchester_url and self.settings.orchester_api_key:
            return "remote_orchester"
        return "embedded_protocol_adapter"

    def capabilities(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "workspace_admin": True,
            "brain_memory_protocol": True,
            "poisoning_guard": True,
            "flow_execution_delegated_to": "langgraph",
            "upstream_limitation": (
                "Upstream Orchester requires Next.js 15 + Postgres pgvector + Redis + external Mnemosyne HTTP server; "
                "using lightweight Python protocol adapter backed by Supabase/SQLite on ₹0 cloud."
            ),
        }

    async def remember(
        self,
        agent: AgentRoleSpec,
        subject: str,
        fact_text: str,
        source: str,
        confidence: float = 0.85,
        scope: MemoryScope = MemoryScope.PROSPECT,
        classification: FactClassification = FactClassification.VERIFIED_FACT,
        source_url: str | None = None,
    ) -> MemoryFact:
        fact = MemoryFact(
            scope=scope,
            subject=subject,
            content=fact_text,
            classification=classification,
            provenance_source=source,
            provenance_url=source_url,
            confidence=confidence,
            created_by_agent=agent.agent_id,
            department=agent.department,
        )
        return self.memory.remember(fact, agent=agent)

    async def recall(
        self,
        agent: AgentRoleSpec,
        query: str,
        min_confidence: float = 0.6,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        return self.memory.recall(
            query=query,
            agent=agent,
            min_confidence=min_confidence,
            limit=limit,
        )

    async def proxy_remote_agent_chat(
        self, remote_agent_id: str, message: str
    ) -> dict[str, Any]:
        """Optional forwarder when a self-hosted remote Orchester instance is connected."""
        if self.mode != "remote_orchester":
            return {
                "proxied": False,
                "mode": self.mode,
                "reason": "ORCHESTER_URL / ORCHESTER_API_KEY not configured",
            }
        url = f"{self.settings.orchester_url.rstrip('/')}/api/v1/agents/{remote_agent_id}/chat"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                headers={"x-api-key": self.settings.orchester_api_key},
                json={"message": message},
            )
            resp.raise_for_status()
            return {"proxied": True, "response": resp.json()}

