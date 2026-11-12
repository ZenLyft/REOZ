"""ZenLyft Ascension Central Command FastAPI Service."""

import asyncio
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

from ascension.backend.core.config import get_settings
from ascension.integrations.zoho.router import zoho_router
from ascension.integrations.zoho.service import zoho_sync_scheduler_loop
from ascension.backend.core.security import (
    KillSwitchController,
    KillSwitchEngagedError,
    SecurityPolicyError,
    verify_hmac_webhook,
)
from ascension.backend.models.schemas import (
    AgentRoleSpec,
    FactClassification,
    MemoryScope,
)
from ascension.integrations.crewai.bridge import ZenLyftSpecialistCrewFactory
from ascension.integrations.langgraph.control_plane import ZenLyftControlPlane, open_checkpointer
from ascension.integrations.llm_providers.gateway import UnifiedLLMGateway
from ascension.integrations.n8n.bridge import N8NAutomationBridge
from ascension.integrations.orchester.adapter import OrchesterProtocolAdapter
from ascension.integrations.paperclip.bridge import (
    PaperclipBridge,
    PaperclipHeartbeatPayload,
)
from ascension.memory.store import MemoryPoisoningError, SharedMemoryStore
from ascension.orchestration.task_router.router import TaskRouter
from ascension.workforce.registry.catalog import ConcurrencyLimitError, UnifiedAgentRegistry


class AscensionRuntime:
    """Singleton dependency container backing the FastAPI service."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.kill_switch = KillSwitchController()
        self.registry = UnifiedAgentRegistry(
            max_concurrent_active=self.settings.max_concurrent_agents
        )
        self.memory = SharedMemoryStore()
        self.memory.seed_verified_product_knowledge()
        self.gateway = UnifiedLLMGateway(kill_switch=self.kill_switch)
        self.orchester = OrchesterProtocolAdapter(registry=self.registry, memory=self.memory)
        self.router = TaskRouter(registry=self.registry)
        self.crew_factory = ZenLyftSpecialistCrewFactory(
            registry=self.registry,
            gateway=self.gateway,
            orchester=self.orchester,
        )
        self.n8n = N8NAutomationBridge()
        self.paperclip = PaperclipBridge(settings=self.settings, registry=self.registry)
        self.control_plane = ZenLyftControlPlane(
            router=self.router,
            crew_factory=self.crew_factory,
            kill_switch=self.kill_switch,
            n8n_bridge=self.n8n,
        )


runtime = AscensionRuntime()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    sync_task: asyncio.Task[None] | None = None
    async with open_checkpointer(runtime.settings.database_url) as saver:
        runtime.control_plane.bind_checkpointer(saver)
        if runtime.settings.email_sync_enabled:
            sync_task = asyncio.create_task(zoho_sync_scheduler_loop(runtime.settings))
        try:
            yield
        finally:
            if sync_task and not sync_task.done():
                sync_task.cancel()


app = FastAPI(
    title="ZenLyft Ascension Control Plane",
    version="0.1.0",
    description="Unified Multi-Agent Workforce (LangGraph + CrewAI + Orchester Adapter + n8n + G.E.N.I.)",
    lifespan=lifespan,
)
app.include_router(zoho_router)


def _require_api_auth(authorization: str | None = Header(default=None)) -> None:
    secret = runtime.settings.ascension_api_secret.strip()
    if not secret:
        return
    if authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="Invalid or missing Ascension bearer token")


class RunWorkflowRequest(BaseModel):
    thread_id: str | None = None
    objective: str = Field(..., min_length=5)
    city: str = Field(default="Global", min_length=2)
    limit: int = Field(default=5, ge=1, le=20)
    supplied_prospects: list[dict[str, Any]] | None = None


class ResolveApprovalRequest(BaseModel):
    approved: bool
    approval_hash: str
    actor: str = "founder"


class KillSwitchRequest(BaseModel):
    engaged: bool
    reason: str = "Founder command"


class StoreMemoryRequest(BaseModel):
    agent_id: str = "asc-01"
    scope: MemoryScope = MemoryScope.COMPANY
    subject: str
    content: str
    classification: FactClassification = FactClassification.VERIFIED_FACT
    provenance_source: str
    provenance_url: str | None = None
    confidence: float = Field(default=0.85, ge=0.0, le=1.0)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": runtime.settings.service_name,
        "environment": runtime.settings.environment,
        "allow_paid_fallback": runtime.settings.allow_paid_fallback,
        "checkpointer_backend": type(runtime.control_plane.checkpointer).__name__,
        "kill_switch": runtime.kill_switch.status(),
        "workforce": runtime.registry.org_summary(),
        "orchester": runtime.orchester.capabilities(),
        "paperclip": runtime.paperclip.status(),
        "providers": runtime.gateway.configured_providers(),
        "zoho_mail": {
            "oauth_configured": bool(
                runtime.settings.zoho_client_id.strip()
                and runtime.settings.zoho_client_secret.strip()
                and len(runtime.settings.zoho_refresh_token_encryption_key.strip()) >= 16
            ),
            "email_sync_enabled": runtime.settings.email_sync_enabled,
            "email_send_enabled": runtime.settings.email_send_enabled,
            "email_require_approval": runtime.settings.email_require_approval,
        },
    }


@app.get("/api/v1/workforce/registry")
async def get_registry(department: str | None = None) -> dict[str, Any]:
    agents = runtime.registry.list_all()
    if department:
        agents = [a for a in agents if a.department.value == department]
    return {
        "summary": runtime.registry.org_summary(),
        "agents": [a.model_dump() for a in agents],
    }


@app.post("/api/v1/workforce/agents/{agent_id}/activation", dependencies=[Depends(_require_api_auth)])
async def toggle_agent(agent_id: str, active: bool) -> dict[str, Any]:
    try:
        agent = (
            runtime.registry.activate(agent_id)
            if active
            else runtime.registry.deactivate(agent_id)
        )
        return {"agent": agent.model_dump(), "summary": runtime.registry.org_summary()}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConcurrencyLimitError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/v1/workforce/agents", dependencies=[Depends(_require_api_auth)])
async def register_custom_agent(spec: AgentRoleSpec) -> dict[str, Any]:
    try:
        created = runtime.registry.register_agent(spec)
        return {"agent": created.model_dump(), "summary": runtime.registry.org_summary()}
    except (ValueError, ConcurrencyLimitError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/workflows/run", dependencies=[Depends(_require_api_auth)])
async def run_workflow(req: RunWorkflowRequest) -> dict[str, Any]:
    thread_id = req.thread_id or f"homs_{uuid4().hex[:10]}"
    try:
        return await runtime.control_plane.start_homs_workflow(
            thread_id=thread_id,
            objective=req.objective,
            city=req.city,
            limit=req.limit,
            supplied_prospects=req.supplied_prospects,
        )
    except KillSwitchEngagedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc


@app.get("/api/v1/workflows/{thread_id}")
async def inspect_workflow(thread_id: str) -> dict[str, Any]:
    return await runtime.control_plane.inspect_thread(thread_id)


@app.post("/api/v1/approvals/{thread_id}/resolve", dependencies=[Depends(_require_api_auth)])
async def resolve_approval(thread_id: str, req: ResolveApprovalRequest) -> dict[str, Any]:
    try:
        return await runtime.control_plane.resume_approval(
            thread_id=thread_id,
            approved=req.approved,
            approval_hash=req.approval_hash,
            actor=req.actor,
        )
    except KillSwitchEngagedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc


@app.get("/api/v1/memory/facts")
async def list_memory_facts(query: str = "", limit: int = 25) -> dict[str, Any]:
    facts = (
        runtime.memory.recall(query=query, allow_system=True, limit=limit)
        if query.strip()
        else runtime.memory.list_recent(limit=limit)
    )
    return {"facts": facts}


@app.post("/api/v1/memory/facts", dependencies=[Depends(_require_api_auth)])
async def write_memory_fact(req: StoreMemoryRequest) -> dict[str, Any]:
    try:
        agent = runtime.registry.get(req.agent_id)
        fact = await runtime.orchester.remember(
            agent=agent,
            subject=req.subject,
            fact_text=req.content,
            source=req.provenance_source,
            source_url=req.provenance_url,
            confidence=req.confidence,
            scope=req.scope,
            classification=req.classification,
        )
        return {"fact": fact.model_dump()}
    except SecurityPolicyError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except MemoryPoisoningError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/v1/security/kill-switch")
async def get_kill_switch() -> dict[str, Any]:
    return runtime.kill_switch.status()


@app.post("/api/v1/security/kill-switch", dependencies=[Depends(_require_api_auth)])
async def set_kill_switch(req: KillSwitchRequest) -> dict[str, Any]:
    if req.engaged:
        return runtime.kill_switch.engage(reason=req.reason, actor="founder")
    return runtime.kill_switch.release(actor="founder")


@app.get("/api/v1/metrics")
async def get_metrics() -> dict[str, Any]:
    return {
        "tasks": [t.model_dump() for t in runtime.router.list_tasks()],
        "dead_letter_queue": runtime.router.dead_letter_queue,
        "messages": [m.model_dump() for m in runtime.router.list_messages()],
        "token_ledger": {
            "requests_by_provider": runtime.gateway.ledger.requests_by_provider,
            "tokens_by_provider": runtime.gateway.ledger.tokens_by_provider,
            "total_cost_usd": runtime.gateway.ledger.total_cost_usd,
            "last_updated": runtime.gateway.ledger.last_updated,
        },
    }


@app.post("/api/v1/webhooks/n8n")
async def n8n_webhook_ingress(
    request: Request,
    x_zenlyft_signature: str | None = Header(default=None),
    x_zenlyft_timestamp: str | None = Header(default=None),
) -> dict[str, Any]:
    raw_body = await request.body()
    secret = runtime.settings.n8n_webhook_secret.strip()
    if secret and not verify_hmac_webhook(
        raw_body, secret, x_zenlyft_signature, x_zenlyft_timestamp
    ):
        raise HTTPException(status_code=401, detail="Invalid n8n webhook HMAC signature")

    payload = await request.json()
    action = payload.get("action")
    if action == "run_homs_discovery":
        return await runtime.control_plane.start_homs_workflow(
            thread_id=f"n8n_{uuid4().hex[:10]}",
            objective="Scheduled HOMS institutional discovery & qualification",
            city=str(payload.get("city") or "Global"),
            limit=int(payload.get("limit") or 5),
        )
    return {"accepted": True, "action": action}


@app.get("/api/v1/paperclip/status")
async def paperclip_status(request: Request) -> dict[str, Any]:
    public_url = str(request.base_url).rstrip("/")
    return runtime.paperclip.status(public_base_url=public_url)


@app.get("/api/v1/paperclip/blueprint")
async def paperclip_blueprint(request: Request) -> dict[str, Any]:
    public_url = str(request.base_url).rstrip("/")
    return runtime.paperclip.build_global_blueprint(public_base_url=public_url)


@app.post("/api/v1/paperclip/sync", dependencies=[Depends(_require_api_auth)])
async def paperclip_sync(request: Request) -> dict[str, Any]:
    public_url = str(request.base_url).rstrip("/")
    return await runtime.paperclip.sync_blueprint_to_server(public_base_url=public_url)


@app.post("/api/v1/paperclip/heartbeat")
async def paperclip_heartbeat(
    request: Request,
    authorization: str | None = Header(default=None),
    x_paperclip_signature: str | None = Header(default=None),
) -> dict[str, Any]:
    """Official Paperclip HTTP adapter heartbeat ingress for autonomous global client acquisition."""
    raw_body = await request.body()
    if not runtime.paperclip.verify_inbound_secret(raw_body, authorization, x_paperclip_signature):
        raise HTTPException(status_code=401, detail="Invalid Paperclip webhook credentials")

    payload = PaperclipHeartbeatPayload.model_validate_json(raw_body or b"{}")
    region = payload.region or str(payload.context.get("region") or "global")
    explicit_city = payload.city or payload.context.get("city")
    hubs = runtime.paperclip.resolve_region_hubs(region, str(explicit_city) if explicit_city else None)
    target_city = (
        str(explicit_city).strip()
        if explicit_city and str(explicit_city).strip().lower() not in {"global", "world", "worldwide", "all"}
        else region
    )
    objective = (
        payload.objective
        or str(payload.context.get("objective") or "")
        or f"Discover & qualify global clients ({region}: {', '.join(hubs[:4])}) for ZenLyft HOMS & Digital Systems"
    )
    thread_id = f"pc_{payload.runId or uuid4().hex[:10]}"

    try:
        workflow_res = await runtime.control_plane.start_homs_workflow(
            thread_id=thread_id,
            objective=objective,
            city=target_city,
            limit=payload.limit,
        )
    except KillSwitchEngagedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc

    pipe = workflow_res.get("pipeline_output") or {}
    qualified = pipe.get("qualified_leads") or []
    drafts = pipe.get("pending_outreach_drafts") or []

    issue_sync = await runtime.paperclip.push_qualified_leads_as_issues(
        qualified_leads=qualified,
        drafts=drafts,
        company_id=payload.companyId,
        parent_task_id=str(payload.context.get("taskId") or ""),
        run_id=payload.runId,
    )
    task_id = str(payload.context.get("taskId") or "")
    if task_id:
        summary = (
            f"ZenLyft Ascension completed sweep (`{target_city}` / `{region}`): "
            f"**{len(qualified)} qualified global leads**, `{pipe.get('market_provider')}` provider, "
            f"`discovery_ok={pipe.get('discovery_ok')}`."
        )
        await runtime.paperclip.report_heartbeat_outcome(
            task_id=task_id,
            summary_markdown=summary,
            run_id=payload.runId,
        )

    return {
        **workflow_res,
        "paperclip": {
            "runId": payload.runId,
            "agentId": payload.agentId,
            "companyId": payload.companyId,
            "region": region,
            "target_hubs": hubs,
            "issue_sync": issue_sync,
        },
    }
