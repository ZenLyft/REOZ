"""Unified Task Router, Concurrency Semaphore, Loop Detector, Deduplication & Dead-Letter Queue."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from ascension.backend.core.config import get_settings
from ascension.backend.models.schemas import (
    AgentMessage,
    DepartmentId,
    TaskHistoryEntry,
    TaskSpec,
    TaskStatus,
)
from ascension.workforce.registry.catalog import UnifiedAgentRegistry


class DuplicateTaskError(RuntimeError):
    """Raised when an identical idempotency key is already queued or completed."""


class DelegationDepthError(RuntimeError):
    """Raised when delegation depth exceeds configured safety limit."""


class DelegationLoopError(RuntimeError):
    """Raised when an endless A->B->A ping-pong delegation cycle is detected."""


@dataclass
class DeadLetterEntry:
    task_id: str
    reason: str
    failed_at: str
    retry_count: int
    task_snapshot: dict[str, Any]


class TaskRouter:
    """Routes tasks across departments, prevents duplicate runs, enforces depth/loops, and tracks DLQ."""

    def __init__(self, registry: UnifiedAgentRegistry) -> None:
        self.settings = get_settings()
        self.registry = registry
        self._tasks: dict[str, TaskSpec] = {}
        self._idempotency_index: dict[str, str] = {}
        self._messages: list[AgentMessage] = []
        self._delegation_paths: dict[str, list[str]] = {}
        self.dead_letter_queue: list[DeadLetterEntry] = []

    def submit(self, task: TaskSpec) -> TaskSpec:
        if task.idempotency_key and task.idempotency_key in self._idempotency_index:
            existing_id = self._idempotency_index[task.idempotency_key]
            existing = self._tasks[existing_id]
            if existing.status not in {TaskStatus.FAILED, TaskStatus.CANCELLED}:
                raise DuplicateTaskError(
                    f"Duplicate task prevented for idempotency_key='{task.idempotency_key}' (existing={existing_id})."
                )

        if task.delegation_depth > self.settings.max_delegation_depth:
            raise DelegationDepthError(
                f"Delegation depth {task.delegation_depth} exceeds maximum {self.settings.max_delegation_depth}."
            )

        agent = self.registry.get(task.assigned_agent)
        if not agent.active:
            task.status = TaskStatus.QUEUED
            note = f"Queued: target agent '{agent.agent_id}' is standby (max active={self.registry.max_concurrent_active})."
        else:
            task.status = TaskStatus.ASSIGNED
            note = f"Assigned directly to active agent '{agent.agent_id}'."

        task.execution_history.append(
            TaskHistoryEntry(status=task.status, actor="task_router", note=note)
        )
        self._tasks[task.task_id] = task
        self._delegation_paths[task.task_id] = [task.assigned_agent]
        if task.idempotency_key:
            self._idempotency_index[task.idempotency_key] = task.task_id
        return task

    def record_message(self, message: AgentMessage) -> AgentMessage:
        if message.delegation_depth > self.settings.max_delegation_depth:
            raise DelegationDepthError(
                f"Message delegation depth {message.delegation_depth} exceeds max {self.settings.max_delegation_depth}."
            )

        path = self._delegation_paths.setdefault(message.task_id, [])
        if message.message_type == "delegation":
            # Detect circular A -> B -> A ping-pong delegation
            if message.recipient_id in path:
                raise DelegationLoopError(
                    f"Circular delegation loop detected for task '{message.task_id}': {' -> '.join(path)} -> {message.recipient_id}"
                )
            path.append(message.recipient_id)

        self._messages.append(message)
        return message

    def transition(
        self,
        task_id: str,
        new_status: TaskStatus,
        actor: str,
        note: str,
        recover_context: dict[str, Any] | None = None,
    ) -> TaskSpec:
        task = self._tasks.get(task_id)
        if task is None:
            if recover_context is None:
                raise KeyError(task_id)
            task = TaskSpec(
                task_id=task_id,
                description=str(recover_context.get("description") or "Recovered checkpointed workflow"),
                business_objective=str(recover_context.get("objective") or "Recovered objective"),
                assigned_agent="asc-01",
                department=DepartmentId.EXECUTIVE_OFFICE,
                status=new_status,
            )
            self._tasks[task_id] = task
        task.status = new_status
        task.execution_history.append(
            TaskHistoryEntry(status=new_status, actor=actor, note=note)
        )
        return task

    def move_to_dead_letter(self, task_id: str, reason: str) -> DeadLetterEntry:
        task = self._tasks[task_id]
        self.transition(task_id, TaskStatus.FAILED, actor="dlq_handler", note=reason)
        entry = DeadLetterEntry(
            task_id=task.task_id,
            reason=reason,
            failed_at=datetime.now(UTC).isoformat(),
            retry_count=task.retry_count,
            task_snapshot=task.model_dump(mode="json"),
        )
        self.dead_letter_queue.append(entry)
        return entry

    def get_task(self, task_id: str) -> TaskSpec:
        return self._tasks[task_id]

    def list_tasks(self) -> list[TaskSpec]:
        return list(self._tasks.values())

    def list_messages(self, task_id: str | None = None) -> list[AgentMessage]:
        if task_id is None:
            return list(self._messages)
        return [m for m in self._messages if m.task_id == task_id]
