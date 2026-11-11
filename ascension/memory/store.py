"""Shared provenance-tagged memory store with RBAC & poisoning protection."""

import json
import sqlite3
from typing import Any

from ascension.backend.core.security import (
    SecurityPolicyError,
    assert_memory_access,
    detect_memory_poisoning,
)
from ascension.backend.models.schemas import (
    AgentRoleSpec,
    DepartmentId,
    FactClassification,
    MemoryFact,
    MemoryScope,
)


class MemoryPoisoningError(ValueError):
    """Raised when incoming memory text matches adversarial prompt-injection signatures."""


class SharedMemoryStore:
    """Multi-category persistent memory store (SQLite for CI/tests, Supabase Postgres REST/SQL in cloud)."""

    def __init__(self, sqlite_path: str = ":memory:") -> None:
        self.sqlite_path = sqlite_path
        self._conn = sqlite3.connect(sqlite_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS memory_facts (
                fact_id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                subject TEXT NOT NULL,
                content TEXT NOT NULL,
                classification TEXT NOT NULL,
                provenance_source TEXT NOT NULL,
                provenance_url TEXT,
                confidence REAL NOT NULL,
                created_by_agent TEXT NOT NULL,
                department TEXT,
                created_at TEXT NOT NULL,
                decay_half_life_days INTEGER NOT NULL,
                metadata_json TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    def seed_verified_product_knowledge(self) -> None:
        """Seed factual ZenLyft catalogue & HOMS product specifications idempotently."""
        facts = [
            MemoryFact(
                fact_id="fact_homs_product_v1",
                scope=MemoryScope.PRODUCT,
                subject="HOMS — Hostel & Outpass Management System",
                content=(
                    "ZenLyft HOMS replaces paper hostel registers and manual outpasses with QR/digital pass workflows, "
                    "automated warden approvals, and instant parent alerts. Commercial starter package is ₹35,000."
                ),
                classification=FactClassification.VERIFIED_FACT,
                provenance_source="zenlyft_approved_catalogue",
                confidence=1.0,
                created_by_agent="founder",
                department=DepartmentId.EXECUTIVE_OFFICE,
            ),
            MemoryFact(
                fact_id="fact_starter_growth_v1",
                scope=MemoryScope.PRODUCT,
                subject="ZenLyft Web & Digital Bundles",
                content="Starter Showcase Website: ₹9,999 (7 days). Growth Appointment/Clinic Portal: ₹17,999 (14 days).",
                classification=FactClassification.VERIFIED_FACT,
                provenance_source="zenlyft_approved_catalogue",
                confidence=1.0,
                created_by_agent="founder",
                department=DepartmentId.EXECUTIVE_OFFICE,
            ),
        ]
        for fact in facts:
            self.remember(fact, agent=None, allow_system=True)

    def remember(
        self,
        fact: MemoryFact,
        agent: AgentRoleSpec | None = None,
        allow_system: bool = False,
    ) -> MemoryFact:
        if not allow_system:
            if agent is None:
                raise SecurityPolicyError("Agent context required to write shared memory.")
            assert_memory_access(agent, fact.scope)

        poisoning_hits = detect_memory_poisoning(fact.content)
        if poisoning_hits:
            raise MemoryPoisoningError(
                f"Blocked memory write due to poisoning pattern(s): {poisoning_hits}"
            )

        self._conn.execute(
            """
            INSERT OR REPLACE INTO memory_facts (
                fact_id, scope, subject, content, classification, provenance_source,
                provenance_url, confidence, created_by_agent, department, created_at,
                decay_half_life_days, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fact.fact_id,
                fact.scope.value,
                fact.subject,
                fact.content,
                fact.classification.value,
                fact.provenance_source,
                fact.provenance_url,
                fact.confidence,
                fact.created_by_agent,
                fact.department.value if fact.department else None,
                fact.created_at.isoformat(),
                fact.decay_half_life_days,
                json.dumps(fact.metadata),
            ),
        )
        self._conn.commit()
        return fact

    def recall(
        self,
        query: str,
        agent: AgentRoleSpec | None = None,
        scope: MemoryScope | None = None,
        min_confidence: float = 0.0,
        limit: int = 20,
        allow_system: bool = False,
    ) -> list[dict[str, Any]]:
        if not allow_system:
            if agent is None:
                raise SecurityPolicyError("Agent context required to read shared memory.")
            if scope is not None:
                assert_memory_access(agent, scope)

        sql = "SELECT * FROM memory_facts WHERE confidence >= ?"
        params: list[Any] = [min_confidence]
        if scope is not None:
            sql += " AND scope = ?"
            params.append(scope.value)
        elif not allow_system and agent is not None and agent.allowed_memory_scopes:
            placeholders = ",".join("?" for _ in agent.allowed_memory_scopes)
            sql += f" AND scope IN ({placeholders})"
            params.extend(s.value for s in agent.allowed_memory_scopes)

        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit * 3)
        rows = self._conn.execute(sql, params).fetchall()

        terms = [t.strip().lower() for t in query.split() if t.strip()]
        results: list[dict[str, Any]] = []
        for row in rows:
            haystack = f"{row['subject']} {row['content']} {row['provenance_source']}".lower()
            if terms and not any(term in haystack for term in terms):
                continue
            results.append(
                {
                    "fact_id": row["fact_id"],
                    "scope": row["scope"],
                    "subject": row["subject"],
                    "content": row["content"],
                    "classification": row["classification"],
                    "provenance_source": row["provenance_source"],
                    "provenance_url": row["provenance_url"],
                    "confidence": row["confidence"],
                    "created_by_agent": row["created_by_agent"],
                    "department": row["department"],
                    "created_at": row["created_at"],
                }
            )
            if len(results) >= limit:
                break
        return results

    def list_recent(self, limit: int = 30) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM memory_facts ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

