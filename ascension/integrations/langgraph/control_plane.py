"""LangGraph Workflow Control Plane — stateful orchestration, persistence & human approval interrupts."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from ascension.backend.core.security import (
    KillSwitchController,
    compute_approval_hash,
    verify_approval_hash,
)
from ascension.backend.models.schemas import (
    AgentMessage,
    DepartmentId,
    SensitiveActionType,
    TaskSpec,
    TaskStatus,
)
from ascension.integrations.crewai.bridge import ZenLyftSpecialistCrewFactory
from ascension.integrations.n8n.bridge import N8NAutomationBridge
from ascension.orchestration.task_router.router import TaskRouter


class AscensionWorkflowState(TypedDict, total=False):
    thread_id: str
    objective: str
    city: str
    limit: int
    supplied_prospects: list[dict[str, Any]] | None
    task_id: str
    status: str
    pipeline_output: dict[str, Any]
    approval_required: bool
    approval_hash: str
    approval_decision: dict[str, Any]
    dead_letter: bool
    error: str | None


@asynccontextmanager
async def open_checkpointer(database_url: str = "") -> AsyncIterator[Any]:
    """Open a persistent LangGraph checkpointer for Supabase Postgres, SQLite file, or in-memory dev."""
    dsn = (database_url or "").strip()
    if dsn.startswith(("postgresql://", "postgres://")):
        async with AsyncPostgresSaver.from_conn_string(dsn) as saver:
            await saver.setup()
            yield saver
            return

    if dsn.startswith("sqlite:///"):
        sqlite_path = dsn.removeprefix("sqlite:///") or ":memory:"
        async with AsyncSqliteSaver.from_conn_string(sqlite_path) as saver:
            await saver.setup()
            yield saver
            return

    if dsn and dsn.endswith((".db", ".sqlite", ".sqlite3")):
        async with AsyncSqliteSaver.from_conn_string(dsn) as saver:
            await saver.setup()
            yield saver
            return

    yield MemorySaver()


class ZenLyftControlPlane:
    """LangGraph StateGraph orchestrating critical workflows with persistent checkpoints & interrupt() gates."""

    def __init__(
        self,
        router: TaskRouter,
        crew_factory: ZenLyftSpecialistCrewFactory,
        kill_switch: KillSwitchController,
        n8n_bridge: N8NAutomationBridge | None = None,
        checkpointer: Any | None = None,
    ) -> None:
        self.router = router
        self.crew_factory = crew_factory
        self.kill_switch = kill_switch
        self.n8n_bridge = n8n_bridge or N8NAutomationBridge()
        self.checkpointer = checkpointer or MemorySaver()
        self.graph = self._compile_graph()

    def bind_checkpointer(self, checkpointer: Any) -> None:
        """Bind a persistent database checkpointer and recompile the StateGraph cleanly."""
        self.checkpointer = checkpointer
        self.graph = self._compile_graph()

    def _compile_graph(self) -> Any:
        builder = StateGraph(AscensionWorkflowState)
        builder.add_node("ingest_and_route", self._node_ingest_and_route)
        builder.add_node("execute_workforce", self._node_execute_workforce)
        builder.add_node("approval_gate", self._node_approval_gate)
        builder.add_node("finalize_or_dead_letter", self._node_finalize_or_dead_letter)

        builder.add_edge(START, "ingest_and_route")
        builder.add_edge("ingest_and_route", "execute_workforce")
        builder.add_conditional_edges(
            "execute_workforce",
            self._route_after_execution,
            {
                "approval": "approval_gate",
                "finalize": "finalize_or_dead_letter",
            },
        )
        builder.add_edge("approval_gate", "finalize_or_dead_letter")
        builder.add_edge("finalize_or_dead_letter", END)

        return builder.compile(checkpointer=self.checkpointer)

    async def _node_ingest_and_route(self, state: AscensionWorkflowState) -> AscensionWorkflowState:
        self.kill_switch.assert_clear()

        task = TaskSpec(
            description=f"HOMS institutional acquisition pipeline for {state['city']}",
            business_objective=state["objective"],
            assigned_agent="asc-01",
            department=DepartmentId.EXECUTIVE_OFFICE,
            input_data={"city": state["city"], "limit": state.get("limit", 5)},
            requires_approval=True,
            approval_action_type=SensitiveActionType.EXTERNAL_WHATSAPP_TEMPLATE,
            idempotency_key=f"wf:{state['thread_id']}",
        )
        self.router.submit(task)
        self.router.transition(
            task.task_id,
            TaskStatus.RUNNING,
            actor="langgraph",
            note="Workflow state machine acquired execution lock.",
        )

        # Traceable CEO -> Department Specialist delegation message
        self.router.record_message(
            AgentMessage(
                sender_id="asc-01",
                recipient_id="asc-15",
                task_id=task.task_id,
                message_type="delegation",
                priority="high",
                delegation_depth=1,
                payload={"city": state["city"], "objective": state["objective"]},
            )
        )
        return {"task_id": task.task_id, "status": TaskStatus.RUNNING.value}

    async def _node_execute_workforce(self, state: AscensionWorkflowState) -> AscensionWorkflowState:
        self.kill_switch.assert_clear()
        task_id = state["task_id"]
        try:
            output = await self.crew_factory.run_first_five_homs_pipeline(
                city=state["city"],
                objective=state["objective"],
                limit=state.get("limit", 5),
                supplied_prospects=state.get("supplied_prospects"),
            )
        except Exception as exc:
            self.router.move_to_dead_letter(task_id, f"Workforce failure: {exc}")
            return {
                "status": TaskStatus.FAILED.value,
                "dead_letter": True,
                "error": str(exc),
                "approval_required": False,
            }

        drafts = output.get("pending_outreach_drafts", [])
        if drafts:
            payload_hash = compute_approval_hash({"drafts": drafts, "city": state["city"]})
            self.router.transition(
                task_id,
                TaskStatus.WAITING_FOR_APPROVAL,
                actor="langgraph",
                note=f"Paused for Founder 1-Tap Approval ({len(drafts)} draft(s), sha256={payload_hash[:12]}...).",
            )
            return {
                "pipeline_output": output,
                "status": TaskStatus.WAITING_FOR_APPROVAL.value,
                "approval_required": True,
                "approval_hash": payload_hash,
                "dead_letter": False,
            }

        return {
            "pipeline_output": output,
            "status": TaskStatus.COMPLETED.value,
            "approval_required": False,
            "dead_letter": False,
        }

    def _route_after_execution(self, state: AscensionWorkflowState) -> str:
        if state.get("approval_required") and not state.get("dead_letter"):
            return "approval"
        return "finalize"

    async def _node_approval_gate(self, state: AscensionWorkflowState) -> AscensionWorkflowState:
        """LangGraph interrupt(): pauses workflow deterministically until founder approves with hash verification."""
        self.kill_switch.assert_clear()
        approval_request = {
            "thread_id": state["thread_id"],
            "task_id": state["task_id"],
            "action_type": SensitiveActionType.EXTERNAL_WHATSAPP_TEMPLATE.value,
            "approval_hash": state["approval_hash"],
            "draft_count": len(state.get("pipeline_output", {}).get("pending_outreach_drafts", [])),
            "target_organisation": (
                state.get("pipeline_output", {})
                .get("pending_outreach_drafts", [{}])[0]
                .get("target_organisation", "N/A")
            ),
        }
        await self.n8n_bridge.emit_event("founder_approval_required", approval_request)

        decision = interrupt(approval_request)
        return {"approval_decision": decision}

    async def _node_finalize_or_dead_letter(self, state: AscensionWorkflowState) -> AscensionWorkflowState:
        task_id = state["task_id"]
        if state.get("dead_letter"):
            return {"status": TaskStatus.FAILED.value}

        recover_ctx = {
            "description": f"HOMS institutional acquisition pipeline for {state.get('city', '')}",
            "objective": state.get("objective", "Recovered workflow"),
        }
        decision = state.get("approval_decision")
        if state.get("approval_required"):
            approved = bool(decision and decision.get("approved"))
            provided_hash = str((decision or {}).get("approval_hash") or "")
            drafts = state.get("pipeline_output", {}).get("pending_outreach_drafts", [])
            hash_valid = verify_approval_hash(
                {"drafts": drafts, "city": state["city"]},
                provided_hash,
            )

            if not approved or not hash_valid:
                note = (
                    "Rejected by founder."
                    if not approved
                    else "Rejected: cryptographic approval hash mismatch."
                )
                self.router.transition(
                    task_id,
                    TaskStatus.CANCELLED,
                    actor="founder",
                    note=note,
                    recover_context=recover_ctx,
                )
                return {"status": TaskStatus.CANCELLED.value, "error": note}

            self.router.transition(
                task_id,
                TaskStatus.COMPLETED,
                actor="founder",
                note="Founder signed cryptographic approval hash; outreach drafts cleared for dispatch.",
                recover_context=recover_ctx,
            )
            return {"status": TaskStatus.COMPLETED.value}

        self.router.transition(
            task_id,
            TaskStatus.COMPLETED,
            actor="langgraph",
            note="Workflow completed (zero drafts queued for approval).",
            recover_context=recover_ctx,
        )
        return {"status": TaskStatus.COMPLETED.value}

    async def start_homs_workflow(
        self,
        thread_id: str,
        objective: str,
        city: str,
        limit: int = 5,
        supplied_prospects: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        config = {"configurable": {"thread_id": thread_id}}
        initial: AscensionWorkflowState = {
            "thread_id": thread_id,
            "objective": objective,
            "city": city,
            "limit": limit,
            "supplied_prospects": supplied_prospects,
        }
        state = await self.graph.ainvoke(initial, config=config)
        snapshot = await self.graph.aget_state(config)
        return {
            "thread_id": thread_id,
            "status": state.get("status"),
            "task_id": state.get("task_id"),
            "approval_hash": state.get("approval_hash"),
            "interrupted": bool(snapshot.next),
            "next_nodes": list(snapshot.next),
            "pipeline_output": state.get("pipeline_output"),
        }

    async def resume_approval(
        self, thread_id: str, approved: bool, approval_hash: str, actor: str = "founder"
    ) -> dict[str, Any]:
        self.kill_switch.assert_clear()
        config = {"configurable": {"thread_id": thread_id}}
        state = await self.graph.ainvoke(
            Command(
                resume={
                    "approved": approved,
                    "approval_hash": approval_hash,
                    "actor": actor,
                }
            ),
            config=config,
        )
        return {
            "thread_id": thread_id,
            "status": state.get("status"),
            "task_id": state.get("task_id"),
            "error": state.get("error"),
        }

    async def inspect_thread(self, thread_id: str) -> dict[str, Any]:
        config = {"configurable": {"thread_id": thread_id}}
        snapshot = await self.graph.aget_state(config)
        return {
            "thread_id": thread_id,
            "values": dict(snapshot.values) if snapshot.values else {},
            "next_nodes": list(snapshot.next),
            "interrupted": bool(snapshot.next),
        }
