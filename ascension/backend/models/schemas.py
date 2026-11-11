"""Typed Pydantic v2 schemas for ZenLyft Ascension agents, tasks, messaging, approvals, and memory."""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


class DepartmentId(StrEnum):
    EXECUTIVE_OFFICE = "executive_office"
    MARKET_INTELLIGENCE = "market_intelligence"
    LEAD_GENERATION = "lead_generation"
    SALES_BD = "sales_bd"
    MARKETING = "marketing"
    ENGINEERING_PRODUCT = "engineering_product"
    FINANCE_ADMIN = "finance_admin"
    RESEARCH_INNOVATION = "research_innovation"
    QUALITY_SECURITY_COMPLIANCE = "quality_security_compliance"


class RoleTier(StrEnum):
    FOUNDER = "founder"
    EXECUTIVE = "executive"
    MANAGER = "manager"
    SPECIALIST = "specialist"


class MemoryScope(StrEnum):
    FOUNDER = "founder"
    COMPANY = "company"
    DEPARTMENT = "department"
    AGENT = "agent"
    TASK = "task"
    PROSPECT = "prospect"
    PRODUCT = "product"
    PERFORMANCE = "performance"


class FactClassification(StrEnum):
    VERIFIED_FACT = "verified_fact"
    USER_INSTRUCTION = "user_instruction"
    HISTORICAL = "historical"
    ASSUMPTION = "assumption"
    UNVERIFIED_RESEARCH = "unverified_research"


class TaskStatus(StrEnum):
    CREATED = "created"
    QUEUED = "queued"
    ASSIGNED = "assigned"
    RUNNING = "running"
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SensitiveActionType(StrEnum):
    EXTERNAL_EMAIL_CAMPAIGN = "external_email_campaign"
    EXTERNAL_WHATSAPP_TEMPLATE = "external_whatsapp_template"
    CONTRACT_COMMITMENT = "contract_commitment"
    FINANCIAL_TRANSACTION = "financial_transaction"
    PURCHASE = "purchase"
    DELETE_RECORD = "delete_record"
    PUBLISH_EXTERNAL_CONTENT = "publish_external_content"
    SECURITY_POLICY_CHANGE = "security_policy_change"
    TEMPLATE_MODIFICATION = "template_modification"


class AgentRoleSpec(BaseModel):
    agent_id: str
    code: str
    name: str
    role: str
    goal: str
    backstory: str
    department: DepartmentId
    tier: RoleTier
    reports_to: str
    responsibilities: list[str]
    skills: list[str] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list)
    allowed_memory_scopes: list[MemoryScope] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    preferred_provider: str = "groq"
    model: str = "qwen/qwen3.8-27b"
    active: bool = False
    is_temporary: bool = False
    max_iterations: int = 8
    max_token_budget: int = 8000
    evaluation_criteria: list[str] = Field(default_factory=list)
    completed_tasks: int = 0
    failed_tasks: int = 0


class AgentMessage(BaseModel):
    message_id: str = Field(default_factory=lambda: f"msg_{uuid4().hex[:12]}")
    sender_id: str
    recipient_id: str
    task_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    message_type: str = Field(pattern="^(delegation|report|review_request|escalation|result|error)$")
    priority: str = Field(default="normal", pattern="^(low|normal|high|critical)$")
    delegation_depth: int = Field(default=0, ge=0)
    payload: dict[str, Any] = Field(default_factory=dict)
    evidence_refs: list[str] = Field(default_factory=list)
    execution_status: str = "sent"

    @model_validator(mode="after")
    def validate_no_self_loop(self) -> "AgentMessage":
        if self.sender_id == self.recipient_id:
            raise ValueError("Agent cannot delegate or send messages directly to itself.")
        return self


class TaskHistoryEntry(BaseModel):
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    status: TaskStatus
    actor: str
    note: str


class TaskSpec(BaseModel):
    task_id: str = Field(default_factory=lambda: f"task_{uuid4().hex[:12]}")
    description: str
    business_objective: str
    assigned_agent: str
    department: DepartmentId
    priority: str = Field(default="normal", pattern="^(low|normal|high|critical)$")
    deadline: datetime | None = None
    input_data: dict[str, Any] = Field(default_factory=dict)
    required_output: str = "structured_json"
    dependencies: list[str] = Field(default_factory=list)
    budget_limit_tokens: int = Field(default=12000, ge=500)
    requires_approval: bool = False
    approval_action_type: SensitiveActionType | None = None
    idempotency_key: str | None = None
    delegation_depth: int = Field(default=0, ge=0)
    retry_count: int = Field(default=0, ge=0)
    max_retries: int = Field(default=2, ge=0, le=5)
    status: TaskStatus = TaskStatus.CREATED
    execution_history: list[TaskHistoryEntry] = Field(default_factory=list)
    final_result: dict[str, Any] | None = None


class MemoryFact(BaseModel):
    fact_id: str = Field(default_factory=lambda: f"fact_{uuid4().hex[:12]}")
    scope: MemoryScope
    subject: str
    content: str
    classification: FactClassification
    provenance_source: str
    provenance_url: str | None = None
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    created_by_agent: str
    department: DepartmentId | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    decay_half_life_days: int = Field(default=30, ge=1)
    metadata: dict[str, Any] = Field(default_factory=dict)

