"""Security controls: global kill switch, cryptographic approval hashes, RBAC, and HMAC webhooks."""

import hashlib
import hmac
import json
import re
import time
from datetime import UTC, datetime
from typing import Any

from ascension.backend.models.schemas import AgentRoleSpec, MemoryScope, SensitiveActionType

SENSITIVE_ACTIONS: frozenset[SensitiveActionType] = frozenset(SensitiveActionType)

# Prompt injection / context-poisoning signatures (inspired by Orchester Mnemo v2.1 guard)
_POISONING_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.IGNORECASE),
    re.compile(r"override\s+founder\s+approval", re.IGNORECASE),
    re.compile(r"disable\s+kill\s+switch", re.IGNORECASE),
    re.compile(r"exfiltrate|reveal\s+system\s+prompt|api_key", re.IGNORECASE),
]


class KillSwitchEngagedError(RuntimeError):
    """Raised whenever execution is attempted while Global Kill Switch is active."""


class SecurityPolicyError(PermissionError):
    """Raised when an agent lacks RBAC permission or attempts an unapproved action."""


class KillSwitchController:
    """Thread-safe emergency shutdown switch checked at every workflow boundary."""

    def __init__(self) -> None:
        self.engaged: bool = False
        self.reason: str | None = None
        self.updated_by: str | None = None
        self.updated_at: datetime | None = None

    def engage(self, reason: str, actor: str = "founder") -> dict[str, Any]:
        self.engaged = True
        self.reason = reason.strip() or "Emergency shutdown engaged by founder."
        self.updated_by = actor
        self.updated_at = datetime.now(UTC)
        return self.status()

    def release(self, actor: str = "founder") -> dict[str, Any]:
        self.engaged = False
        self.reason = None
        self.updated_by = actor
        self.updated_at = datetime.now(UTC)
        return self.status()

    def assert_clear(self) -> None:
        if self.engaged:
            raise KillSwitchEngagedError(f"Global kill switch engaged: {self.reason}")

    def status(self) -> dict[str, Any]:
        return {
            "engaged": self.engaged,
            "reason": self.reason,
            "updated_by": self.updated_by,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


def compute_approval_hash(payload: dict[str, Any]) -> str:
    """Compute canonical SHA-256 hash binding an approval decision to exact immutable payload."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def verify_approval_hash(payload: dict[str, Any], expected_hash: str) -> bool:
    """Constant-time comparison verifying payload integrity at founder sign-off."""
    actual = compute_approval_hash(payload)
    return hmac.compare_digest(actual, expected_hash.strip().lower())


def requires_founder_approval(action_type: SensitiveActionType | str | None) -> bool:
    """All external campaigns, contracts, spend, deletions, policy/template edits require approval."""
    if action_type is None:
        return False
    try:
        return SensitiveActionType(action_type) in SENSITIVE_ACTIONS
    except ValueError:
        return True


def assert_memory_access(agent: AgentRoleSpec, scope: MemoryScope) -> None:
    """Enforce least-privilege RBAC over shared memory categories."""
    if scope == MemoryScope.FOUNDER and agent.tier.value not in {"founder", "executive"}:
        raise SecurityPolicyError(
            f"Agent '{agent.agent_id}' ({agent.tier.value}) cannot access founder memory."
        )
    if agent.allowed_memory_scopes and scope not in agent.allowed_memory_scopes:
        raise SecurityPolicyError(
            f"Agent '{agent.agent_id}' is not permitted to access memory scope '{scope.value}'."
        )


def assert_tool_allowed(agent: AgentRoleSpec, tool_name: str) -> None:
    """Ensure specialist agents can only invoke tools explicitly listed in their allowlist."""
    if "*" in agent.allowed_tools:
        return
    if tool_name not in agent.allowed_tools:
        raise SecurityPolicyError(
            f"Tool '{tool_name}' blocked by allowlist for agent '{agent.agent_id}'."
        )


def detect_memory_poisoning(content: str) -> list[str]:
    """Scan fact text before storing in long-term memory to block prompt-injection artifacts."""
    findings: list[str] = []
    for pattern in _POISONING_PATTERNS:
        if pattern.search(content):
            findings.append(pattern.pattern)
    return findings


def sign_hmac_webhook(payload_bytes: bytes, secret: str, timestamp: int | None = None) -> tuple[str, str]:
    """Produce timestamp + HMAC-SHA256 signature for outbound/inbound n8n webhook verification."""
    ts = str(timestamp or int(time.time()))
    message = f"{ts}.".encode() + payload_bytes
    sig = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return ts, f"sha256={sig}"


def verify_hmac_webhook(
    payload_bytes: bytes,
    secret: str,
    signature_header: str | None,
    timestamp_header: str | None,
    max_skew_seconds: int = 300,
) -> bool:
    """Constant-time verification with replay window for n8n & automation webhooks."""
    if not secret or not signature_header or not timestamp_header:
        return False
    try:
        ts_int = int(timestamp_header.strip())
    except ValueError:
        return False
    if abs(int(time.time()) - ts_int) > max_skew_seconds:
        return False
    _, expected_sig = sign_hmac_webhook(payload_bytes, secret, timestamp=ts_int)
    return hmac.compare_digest(expected_sig, signature_header.strip().lower())

