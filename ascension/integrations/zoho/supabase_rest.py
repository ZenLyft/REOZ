"""Lightweight async Supabase PostgREST helper for Ascension Zoho Mail integration."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx


class SupabaseRestError(RuntimeError):
    """Raised when a Supabase REST query returns an HTTP error."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(f"Supabase REST {status_code}: {message}")
        self.status_code = status_code


class SupabaseRestClient:
    """Minimal PostgREST wrapper using httpx.AsyncClient and service role key."""

    def __init__(self, supabase_url: str, service_role_key: str, timeout: float = 15.0) -> None:
        base = (supabase_url or "").strip().rstrip("/")
        self.rest_base = f"{base}/rest/v1" if base else ""
        self.service_role_key = (service_role_key or "").strip()
        self.timeout = timeout

    @property
    def is_configured(self) -> bool:
        return bool(self.rest_base and self.service_role_key)

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        if not self.is_configured:
            raise SupabaseRestError(503, "Supabase URL or service role key is not configured.")
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {"select": columns}
        if filters:
            params.update(filters)
        if order:
            params["order"] = order
        if limit is not None:
            params["limit"] = str(limit)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(
                f"{self.rest_base}/{quote(table)}",
                headers=self._headers(),
                params=params,
            )
        if resp.status_code >= 400:
            raise SupabaseRestError(resp.status_code, resp.text[:400])
        data = resp.json()
        return data if isinstance(data, list) else []

    async def select_one(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        order: str | None = None,
    ) -> dict[str, Any] | None:
        rows = await self.select(table, columns=columns, filters=filters, order=order, limit=1)
        return rows[0] if rows else None

    async def insert(
        self,
        table: str,
        payload: dict[str, Any] | list[dict[str, Any]],
        *,
        returning: bool = True,
    ) -> list[dict[str, Any]]:
        prefer = "return=representation" if returning else "return=minimal"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.rest_base}/{quote(table)}",
                headers=self._headers(prefer),
                json=payload,
            )
        if resp.status_code >= 400:
            raise SupabaseRestError(resp.status_code, resp.text[:400])
        if not returning or not resp.text.strip():
            return []
        data = resp.json()
        return data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])

    async def upsert(
        self,
        table: str,
        payload: dict[str, Any] | list[dict[str, Any]],
        *,
        on_conflict: str,
        returning: bool = True,
    ) -> list[dict[str, Any]]:
        prefer = f"resolution=merge-duplicates,return={'representation' if returning else 'minimal'}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.rest_base}/{quote(table)}",
                headers=self._headers(prefer),
                params={"on_conflict": on_conflict},
                json=payload,
            )
        if resp.status_code >= 400:
            raise SupabaseRestError(resp.status_code, resp.text[:400])
        if not returning or not resp.text.strip():
            return []
        data = resp.json()
        return data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])

    async def update(
        self,
        table: str,
        payload: dict[str, Any],
        *,
        filters: dict[str, str],
        returning: bool = True,
    ) -> list[dict[str, Any]]:
        prefer = "return=representation" if returning else "return=minimal"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.patch(
                f"{self.rest_base}/{quote(table)}",
                headers=self._headers(prefer),
                params=filters,
                json=payload,
            )
        if resp.status_code >= 400:
            raise SupabaseRestError(resp.status_code, resp.text[:400])
        if not returning or not resp.text.strip():
            return []
        data = resp.json()
        return data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])

