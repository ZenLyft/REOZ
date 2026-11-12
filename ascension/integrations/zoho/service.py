"""Zoho Mail OAuth 2.0, transactional send, incremental sync, and reply intelligence service."""

from __future__ import annotations

import asyncio
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from ascension.backend.core.config import AscensionSettings
from ascension.integrations.zoho.security import (
    ZohoRegionalEndpoints,
    classify_inbound_reply,
    compute_email_approval_hash,
    decrypt_zoho_token,
    detect_inbound_prompt_injection,
    encrypt_zoho_token,
    resolve_zoho_regional_endpoints,
    sanitize_email_html,
    strip_html_to_text,
    verify_email_approval_hash,
)
from ascension.integrations.zoho.supabase_rest import SupabaseRestClient

logger = logging.getLogger(__name__)

ZOHO_SCOPES = (
    "ZohoMail.accounts.READ",
    "ZohoMail.messages.READ",
    "ZohoMail.messages.CREATE",
)
EMAIL_PATTERN = re.compile(r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_iso(dt: datetime | None = None) -> str:
    return (dt or _utc_now()).isoformat()


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def extract_bare_email(raw: str | None) -> str:
    if not raw:
        return ""
    m = EMAIL_PATTERN.search(str(raw))
    return m.group(1).strip().lower() if m else str(raw).strip().lower()


def build_safe_ai_email_reply_draft(
    *,
    company_name: str,
    classification: str,
    selected_service: str | None,
    has_prompt_injection: bool,
) -> tuple[str, str]:
    """Generate a factual, non-fabricated reply draft strictly for Founder review."""
    service = selected_service or "AI & business workflow automation"
    if classification == "Unsubscribe request":
        return (
            "Your email address has been removed from our outreach list.",
            "Prospect requested opt-out; suppression applied. Reply only if confirming removal.",
        )
    if classification == "Out of office":
        return (
            "",
            "Automated out-of-office detected. Recommend pausing outreach until return.",
        )
    if classification == "Automated response":
        return (
            "",
            "Automated/no-reply message detected. No response required.",
        )
    if classification == "Not interested":
        return (
            f"Thank you for letting us know. Wishing {company_name} continued success — we will not follow up further unless helpful in the future.",
            "Polite close honoring negative response.",
        )
    if classification == "Meeting requested":
        return (
            f"Thank you for your reply. I would be glad to walk through how ZenLyft approaches {service} for {company_name}.\n\nPlease share two or three time slots that work well for a brief 15-minute call.",
            "Prospect requested a meeting; proposes scheduling without fabricating unavailable calendar slots.",
        )
    if classification == "Wants pricing":
        return (
            f"Thank you for reaching out. Our engagement scope for {service} depends on your workflow requirements and existing systems.\n\nIf you can share your key priorities for {company_name}, I can outline a tailored scope and transparent estimate on a short call.",
            "Prospect asked for pricing; invites brief scope clarification without inventing unapproved quotes.",
        )
    if classification == "Follow-up later":
        return (
            f"Understood, thank you for the update. We will check back with {company_name} next month at a more convenient time.",
            "Acknowledges deferred timeline.",
        )
    if classification == "Interested":
        return (
            f"Glad to hear from you. Happy to share how ZenLyft implements {service} tailored to {company_name}'s workflow.\n\nWould a quick 15-minute introductory call this week work to understand your setup?",
            "Positive interest detected; suggests a brief discovery conversation.",
        )
    if classification == "Needs more information":
        return (
            f"Thank you for your note. ZenLyft builds custom {service} solutions tailored to a team's operational workflow and existing stack.\n\nHappy to answer any specific questions about how it could fit {company_name}.",
            "Answers inquiry honestly using only approved ZenLyft capabilities.",
        )

    injection_note = (
        " Potential prompt injection text in inbound email was ignored."
        if has_prompt_injection
        else ""
    )
    return (
        f"Thank you for your response, team at {company_name}. Please let us know if you would like to explore {service} for your workflow or prefer no further messages.",
        f"Fallback polite acknowledgment queued for human review.{injection_note}",
    )


def extract_authorized_senders(accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    senders: list[dict[str, Any]] = []
    seen: set[str] = set()
    for acc in accounts:
        account_id = str(acc.get("account_id") or acc.get("accountId") or "")
        primary_email = extract_bare_email(acc.get("primary_email") or acc.get("primaryEmailAddress"))
        display_name = str(acc.get("display_name") or acc.get("displayName") or "").strip() or None
        raw_details = acc.get("send_mail_details") or acc.get("sendMailDetails") or []
        if isinstance(raw_details, list):
            for detail in raw_details:
                if not isinstance(detail, dict):
                    continue
                email = extract_bare_email(detail.get("fromAddress"))
                if not email or email in seen:
                    continue
                seen.add(email)
                validated = detail.get("validated")
                senders.append(
                    {
                        "accountId": account_id,
                        "email": email,
                        "displayName": str(detail.get("displayName") or display_name or "").strip() or None,
                        "isPrimary": email == primary_email,
                        "isAlias": email != primary_email,
                        "validated": True if validated is None else bool(validated),
                        "mode": str(detail.get("mode") or "mailbox"),
                    }
                )
        if primary_email and primary_email not in seen:
            seen.add(primary_email)
            senders.append(
                {
                    "accountId": account_id,
                    "email": primary_email,
                    "displayName": display_name,
                    "isPrimary": True,
                    "isAlias": False,
                    "validated": True,
                    "mode": "primary",
                }
            )
    return senders


class ZohoIntegrationError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


class ZohoMailService:
    """Unified async service encapsulating Zoho OAuth, Accounts, Dispatch, and 60s Sync."""

    def __init__(self, settings: AscensionSettings, db: SupabaseRestClient | None = None) -> None:
        self.settings = settings
        self.db = db or SupabaseRestClient(settings.supabase_url, settings.supabase_service_role_key)

    def _require_db(self) -> SupabaseRestClient:
        if not self.db.is_configured:
            raise ZohoIntegrationError(
                503,
                "Supabase persistence is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).",
            )
        return self.db

    def _require_oauth_credentials(self) -> tuple[str, str, str]:
        cid = self.settings.zoho_client_id.strip()
        csec = self.settings.zoho_client_secret.strip()
        redir = self.settings.zoho_redirect_uri.strip()
        if not cid or not csec or not redir:
            raise ZohoIntegrationError(
                500,
                "Zoho OAuth credentials (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REDIRECT_URI) are not configured.",
            )
        return cid, csec, redir

    def _encryption_key(self) -> str:
        key = self.settings.zoho_refresh_token_encryption_key.strip()
        if len(key) < 16:
            raise ZohoIntegrationError(
                500,
                "ZOHO_REFRESH_TOKEN_ENCRYPTION_KEY is missing or shorter than 16 characters.",
            )
        return key

    async def get_public_status(self) -> dict[str, Any]:
        configured = bool(
            self.settings.zoho_client_id.strip()
            and self.settings.zoho_client_secret.strip()
            and self.settings.zoho_redirect_uri.strip()
            and len(self.settings.zoho_refresh_token_encryption_key.strip()) >= 16
        )
        base_status: dict[str, Any] = {
            "configured": configured,
            "redirectUri": self.settings.zoho_redirect_uri.strip(),
            "accountsBaseUrl": self.settings.zoho_accounts_base_url.strip(),
            "mailApiBaseUrl": self.settings.zoho_mail_api_base_url.strip(),
            "dataCenter": resolve_zoho_regional_endpoints(
                default_accounts_url=self.settings.zoho_accounts_base_url
            ).data_center,
            "status": "DISCONNECTED",
            "selectedAccountId": None,
            "selectedAccountEmail": None,
            "selectedSenderEmail": None,
            "selectedSenderName": None,
            "scopes": list(ZOHO_SCOPES),
            "connectedAt": None,
            "lastError": None,
            "accounts": [],
            "senders": [],
            "sync": {
                "enabled": self.settings.email_sync_enabled,
                "intervalSeconds": max(15, int(self.settings.email_sync_interval_seconds or 60)),
                "sendEnabled": self.settings.email_send_enabled,
                "requireApproval": self.settings.email_require_approval,
                "lastSuccessfulSyncAt": None,
                "lastError": None,
                "totalSyncedCount": 0,
            },
        }
        if not self.db.is_configured:
            return base_status

        conn = await self.db.select_one(
            "zoho_connections",
            filters={"connection_key": "eq.primary"},
        )
        if not conn:
            return base_status

        accounts = await self.db.select(
            "zoho_accounts",
            filters={"connection_id": f"eq.{conn['id']}"},
            order="primary_email.asc",
        )
        sync_row = None
        if conn.get("selected_account_id"):
            sync_row = await self.db.select_one(
                "email_sync_state",
                filters={"account_id": f"eq.{conn['selected_account_id']}"},
            )

        senders = extract_authorized_senders(accounts)
        base_status.update(
            {
                "status": conn.get("status") or "DISCONNECTED",
                "accountsBaseUrl": conn.get("accounts_base_url") or base_status["accountsBaseUrl"],
                "mailApiBaseUrl": conn.get("mail_api_base_url") or base_status["mailApiBaseUrl"],
                "dataCenter": conn.get("data_center") or base_status["dataCenter"],
                "selectedAccountId": conn.get("selected_account_id"),
                "selectedAccountEmail": conn.get("selected_account_email"),
                "selectedSenderEmail": conn.get("selected_sender_email"),
                "selectedSenderName": conn.get("selected_sender_name"),
                "scopes": conn.get("scopes") or list(ZOHO_SCOPES),
                "connectedAt": conn.get("connected_at"),
                "lastError": conn.get("last_error"),
                "accounts": [
                    {
                        "accountId": row.get("account_id"),
                        "primaryEmail": row.get("primary_email"),
                        "displayName": row.get("display_name"),
                        "accountName": row.get("account_name"),
                        "incomingBlocked": bool(row.get("incoming_blocked")),
                        "outgoingBlocked": bool(row.get("outgoing_blocked")),
                        "isSelected": bool(row.get("is_selected")),
                    }
                    for row in accounts
                ],
                "senders": senders,
            }
        )
        if sync_row:
            base_status["sync"].update(
                {
                    "lastSuccessfulSyncAt": sync_row.get("last_successful_sync_at"),
                    "lastError": sync_row.get("last_error"),
                    "totalSyncedCount": int(sync_row.get("total_synced_count") or 0),
                    "syncStatus": sync_row.get("status"),
                }
            )
        return base_status

    async def start_oauth_connect(self, *, return_to: str = "/dashboard/settings") -> dict[str, Any]:
        cid, _, redir = self._require_oauth_credentials()
        self._encryption_key()
        db = self._require_db()

        safe_return = return_to if return_to.startswith("/") and not return_to.startswith("//") else "/dashboard/settings"
        state_token = secrets.token_urlsafe(32)
        expires_at = _utc_iso(_utc_now() + timedelta(minutes=10))
        endpoints = resolve_zoho_regional_endpoints(
            default_accounts_url=self.settings.zoho_accounts_base_url
        )

        await db.insert(
            "zoho_oauth_states",
            {
                "state_token": state_token,
                "return_to": safe_return,
                "expected_dc": endpoints.data_center,
                "expires_at": expires_at,
            },
            returning=False,
        )
        await db.upsert(
            "zoho_connections",
            {
                "connection_key": "primary",
                "status": "CONNECTING",
                "accounts_base_url": endpoints.accounts_base_url,
                "mail_api_base_url": endpoints.mail_api_base_url,
                "data_center": endpoints.data_center,
                "last_error": None,
                "updated_at": _utc_iso(),
            },
            on_conflict="connection_key",
            returning=False,
        )

        params = {
            "scope": " ".join(ZOHO_SCOPES),
            "client_id": cid,
            "response_type": "code",
            "access_type": "offline",
            "redirect_uri": redir,
            "prompt": "consent",
            "state": state_token,
        }
        return {
            "authorizationUrl": f"{endpoints.accounts_base_url}/oauth/v2/auth?{urlencode(params)}",
            "dataCenter": endpoints.data_center,
        }

    async def handle_oauth_callback(
        self,
        *,
        code: str | None,
        state: str | None,
        location: str | None = None,
        accounts_server: str | None = None,
        error: str | None = None,
        error_description: str | None = None,
    ) -> dict[str, Any]:
        db = self._require_db()
        if not state:
            raise ZohoIntegrationError(400, "Missing Zoho OAuth state parameter.")

        state_row = await db.select_one(
            "zoho_oauth_states",
            filters={"state_token": f"eq.{state}"},
        )
        if not state_row:
            raise ZohoIntegrationError(400, "Invalid Zoho OAuth state token.")
        if state_row.get("used_at"):
            raise ZohoIntegrationError(400, "Zoho OAuth state token was already consumed.")
        exp = _parse_iso(state_row.get("expires_at"))
        if exp and exp < _utc_now():
            raise ZohoIntegrationError(400, "Zoho OAuth state token expired. Please retry.")

        await db.update(
            "zoho_oauth_states",
            {"used_at": _utc_iso()},
            filters={"state_token": f"eq.{state}"},
            returning=False,
        )

        return_to = str(state_row.get("return_to") or "/dashboard/settings")
        if error:
            msg = error_description or f"Zoho OAuth rejected: {error}"
            await db.upsert(
                "zoho_connections",
                {
                    "connection_key": "primary",
                    "status": "DISCONNECTED",
                    "last_error": msg,
                    "updated_at": _utc_iso(),
                },
                on_conflict="connection_key",
                returning=False,
            )
            raise ZohoIntegrationError(400, msg)

        if not code:
            raise ZohoIntegrationError(400, "Missing authorization code from Zoho OAuth callback.")

        cid, csec, redir = self._require_oauth_credentials()
        enc_key = self._encryption_key()
        endpoints: ZohoRegionalEndpoints = resolve_zoho_regional_endpoints(
            accounts_server=accounts_server,
            location=location,
            default_accounts_url=self.settings.zoho_accounts_base_url,
        )

        async with httpx.AsyncClient(timeout=15.0) as client:
            token_resp = await client.post(
                f"{endpoints.accounts_base_url}/oauth/v2/token",
                data={
                    "grant_type": "authorization_code",
                    "client_id": cid,
                    "client_secret": csec,
                    "redirect_uri": redir,
                    "code": code,
                },
            )
        token_data = token_resp.json() if token_resp.text else {}
        if token_resp.status_code >= 400 or token_data.get("error") or not token_data.get("access_token"):
            err_msg = str(
                token_data.get("error_description")
                or token_data.get("error")
                or f"Zoho token exchange failed (HTTP {token_resp.status_code})"
            )
            await db.upsert(
                "zoho_connections",
                {
                    "connection_key": "primary",
                    "status": "AUTH_EXPIRED",
                    "last_error": err_msg,
                    "updated_at": _utc_iso(),
                },
                on_conflict="connection_key",
                returning=False,
            )
            raise ZohoIntegrationError(400, err_msg)

        existing = await db.select_one("zoho_connections", filters={"connection_key": "eq.primary"})
        raw_refresh = str(token_data.get("refresh_token") or "").strip()
        if raw_refresh:
            encrypted_refresh = encrypt_zoho_token(raw_refresh, enc_key)
        elif existing and existing.get("encrypted_refresh_token"):
            encrypted_refresh = str(existing["encrypted_refresh_token"])
        else:
            raise ZohoIntegrationError(
                400,
                "Zoho did not return a refresh_token. Revoke previous app authorization in Zoho Accounts and reconnect with prompt=consent.",
            )

        encrypted_access = encrypt_zoho_token(str(token_data["access_token"]), enc_key)
        expires_in = int(token_data.get("expires_in") or 3600)
        expires_at = _utc_iso(_utc_now() + timedelta(seconds=expires_in))
        scopes = (
            str(token_data.get("scope")).split()
            if token_data.get("scope")
            else list(ZOHO_SCOPES)
        )

        saved_rows = await db.upsert(
            "zoho_connections",
            {
                "connection_key": "primary",
                "status": "CONNECTED",
                "accounts_base_url": endpoints.accounts_base_url,
                "mail_api_base_url": endpoints.mail_api_base_url,
                "data_center": endpoints.data_center,
                "encrypted_refresh_token": encrypted_refresh,
                "encrypted_access_token": encrypted_access,
                "access_token_expires_at": expires_at,
                "token_type": str(token_data.get("token_type") or "Zoho-oauthtoken"),
                "scopes": scopes,
                "last_error": None,
                "connected_at": _utc_iso(),
                "updated_at": _utc_iso(),
            },
            on_conflict="connection_key",
        )
        conn = saved_rows[0]
        await self._discover_and_persist_accounts(
            conn=conn,
            access_token=str(token_data["access_token"]),
            mail_api_base_url=endpoints.mail_api_base_url,
        )
        await db.insert(
            "audit_log",
            {
                "actor": "founder",
                "action": "zoho_oauth_connected",
                "details": {"dataCenter": endpoints.data_center},
            },
            returning=False,
        )
        return {
            "returnTo": return_to,
            "dataCenter": endpoints.data_center,
            "status": "CONNECTED",
        }

    async def _discover_and_persist_accounts(
        self,
        *,
        conn: dict[str, Any],
        access_token: str,
        mail_api_base_url: str,
    ) -> list[dict[str, Any]]:
        db = self._require_db()
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{mail_api_base_url.rstrip('/')}/api/accounts",
                headers={"Authorization": f"Zoho-oauthtoken {access_token}"},
            )
        if resp.status_code >= 400:
            raise ZohoIntegrationError(
                resp.status_code,
                f"Failed to fetch Zoho Mail accounts (HTTP {resp.status_code}).",
            )
        payload = resp.json() if resp.text else {}
        raw_accounts = payload.get("data") if isinstance(payload, dict) else []
        if not isinstance(raw_accounts, list):
            raw_accounts = []

        selected_account_id = conn.get("selected_account_id")
        if not selected_account_id and raw_accounts:
            selected_account_id = str(raw_accounts[0].get("accountId") or "")

        selected_email = conn.get("selected_account_email")
        selected_sender = conn.get("selected_sender_email")
        selected_sender_name = conn.get("selected_sender_name")

        persisted: list[dict[str, Any]] = []
        for idx, acc in enumerate(raw_accounts):
            acc_id = str(acc.get("accountId") or "")
            if not acc_id:
                continue
            primary_email = extract_bare_email(acc.get("primaryEmailAddress"))
            display_name = str(acc.get("displayName") or "").strip() or None
            is_sel = acc_id == selected_account_id or (not selected_account_id and idx == 0)
            row_payload = {
                "connection_id": conn["id"],
                "account_id": acc_id,
                "primary_email": primary_email,
                "display_name": display_name,
                "account_name": str(acc.get("accountName") or "").strip() or None,
                "send_mail_details": acc.get("sendMailDetails") or [],
                "incoming_blocked": bool(acc.get("incomingBlocked")),
                "outgoing_blocked": bool(acc.get("outgoingBlocked")),
                "is_selected": is_sel,
                "raw_meta": {"accountId": acc_id, "primaryEmailAddress": primary_email},
                "updated_at": _utc_iso(),
            }
            persisted.append(row_payload)
            if is_sel:
                selected_account_id = acc_id
                selected_email = primary_email

        if persisted:
            await db.upsert("zoho_accounts", persisted, on_conflict="account_id", returning=False)

        available_senders = extract_authorized_senders(persisted)
        if not selected_sender and available_senders:
            selected_sender = available_senders[0]["email"]
            selected_sender_name = available_senders[0].get("displayName")

        await db.update(
            "zoho_connections",
            {
                "selected_account_id": selected_account_id,
                "selected_account_email": selected_email,
                "selected_sender_email": selected_sender,
                "selected_sender_name": selected_sender_name,
                "updated_at": _utc_iso(),
            },
            filters={"id": f"eq.{conn['id']}"},
            returning=False,
        )
        return persisted

    async def get_valid_access_context(self) -> dict[str, Any]:
        db = self._require_db()
        enc_key = self._encryption_key()
        conn = await db.select_one("zoho_connections", filters={"connection_key": "eq.primary"})
        if not conn or conn.get("status") == "DISCONNECTED":
            raise ZohoIntegrationError(409, "Zoho Mail is not connected.")
        if not conn.get("encrypted_refresh_token"):
            raise ZohoIntegrationError(401, "No encrypted refresh token available. Reconnect Zoho Mail.")

        exp = _parse_iso(conn.get("access_token_expires_at"))
        if conn.get("encrypted_access_token") and exp and exp > (_utc_now() + timedelta(minutes=5)):
            return {
                "conn": conn,
                "access_token": decrypt_zoho_token(str(conn["encrypted_access_token"]), enc_key),
                "mail_api_base_url": str(conn.get("mail_api_base_url") or self.settings.zoho_mail_api_base_url),
                "account_id": conn.get("selected_account_id"),
                "sender_email": conn.get("selected_sender_email"),
            }

        cid, csec, _ = self._require_oauth_credentials()
        refresh_token = decrypt_zoho_token(str(conn["encrypted_refresh_token"]), enc_key)
        accounts_base = str(conn.get("accounts_base_url") or self.settings.zoho_accounts_base_url).rstrip("/")

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{accounts_base}/oauth/v2/token",
                data={
                    "grant_type": "refresh_token",
                    "client_id": cid,
                    "client_secret": csec,
                    "refresh_token": refresh_token,
                },
            )
        data = resp.json() if resp.text else {}
        if resp.status_code >= 400 or data.get("error") or not data.get("access_token"):
            err = str(data.get("error_description") or data.get("error") or f"HTTP {resp.status_code}")
            revoked = any(k in err.lower() for k in ("invalid_grant", "invalid_token", "revoked", "expired"))
            await db.update(
                "zoho_connections",
                {
                    "status": "AUTH_EXPIRED" if revoked else "SYNC_ERROR",
                    "last_error": err,
                    "updated_at": _utc_iso(),
                },
                filters={"id": f"eq.{conn['id']}"},
                returning=False,
            )
            raise ZohoIntegrationError(401 if revoked else 502, err)

        new_access = str(data["access_token"])
        expires_in = int(data.get("expires_in") or 3600)
        expires_at = _utc_iso(_utc_now() + timedelta(seconds=expires_in))
        await db.update(
            "zoho_connections",
            {
                "status": "CONNECTED",
                "encrypted_access_token": encrypt_zoho_token(new_access, enc_key),
                "access_token_expires_at": expires_at,
                "last_error": None,
                "updated_at": _utc_iso(),
            },
            filters={"id": f"eq.{conn['id']}"},
            returning=False,
        )
        return {
            "conn": conn,
            "access_token": new_access,
            "mail_api_base_url": str(conn.get("mail_api_base_url") or self.settings.zoho_mail_api_base_url),
            "account_id": conn.get("selected_account_id"),
            "sender_email": conn.get("selected_sender_email"),
        }

    async def test_connection(self) -> dict[str, Any]:
        ctx = await self.get_valid_access_context()
        persisted = await self._discover_and_persist_accounts(
            conn=ctx["conn"],
            access_token=ctx["access_token"],
            mail_api_base_url=ctx["mail_api_base_url"],
        )
        senders = extract_authorized_senders(persisted)
        return {
            "ok": True,
            "status": "CONNECTED",
            "accountCount": len(persisted),
            "senderCount": len(senders),
            "checkedAt": _utc_iso(),
        }

    async def select_sender(self, *, sender_email: str, account_id: str | None = None) -> dict[str, Any]:
        db = self._require_db()
        conn = await db.select_one("zoho_connections", filters={"connection_key": "eq.primary"})
        if not conn:
            raise ZohoIntegrationError(409, "Zoho Mail is not connected.")
        accounts = await db.select("zoho_accounts", filters={"connection_id": f"eq.{conn['id']}"})
        senders = extract_authorized_senders(accounts)
        target = extract_bare_email(sender_email)
        matched = next(
            (s for s in senders if s["email"] == target and (not account_id or s["accountId"] == account_id)),
            None,
        )
        if not matched:
            raise ZohoIntegrationError(
                400,
                f"Sender address {sender_email} is not verified on this Zoho Mail connection.",
            )
        if matched.get("validated") is False:
            raise ZohoIntegrationError(400, f"Sender address {sender_email} is not validated in Zoho Mail.")

        await db.update(
            "zoho_accounts",
            {"is_selected": False},
            filters={"connection_id": f"eq.{conn['id']}"},
            returning=False,
        )
        await db.update(
            "zoho_accounts",
            {"is_selected": True},
            filters={"account_id": f"eq.{matched['accountId']}"},
            returning=False,
        )
        matching_acc = next((a for a in accounts if a.get("account_id") == matched["accountId"]), {})
        await db.update(
            "zoho_connections",
            {
                "selected_account_id": matched["accountId"],
                "selected_account_email": matching_acc.get("primary_email"),
                "selected_sender_email": matched["email"],
                "selected_sender_name": matched.get("displayName"),
                "updated_at": _utc_iso(),
            },
            filters={"id": f"eq.{conn['id']}"},
            returning=False,
        )
        return {"ok": True, "selectedSender": matched}

    async def disconnect(self) -> dict[str, Any]:
        db = self._require_db()
        conn = await db.select_one("zoho_connections", filters={"connection_key": "eq.primary"})
        if not conn:
            return {"ok": True, "status": "DISCONNECTED"}
        await db.update(
            "zoho_connections",
            {
                "status": "DISCONNECTED",
                "encrypted_refresh_token": None,
                "encrypted_access_token": None,
                "access_token_expires_at": None,
                "selected_account_id": None,
                "selected_account_email": None,
                "selected_sender_email": None,
                "selected_sender_name": None,
                "last_error": None,
                "updated_at": _utc_iso(),
            },
            filters={"id": f"eq.{conn['id']}"},
            returning=False,
        )
        await db.insert(
            "audit_log",
            {"actor": "founder", "action": "zoho_oauth_disconnected", "details": {}},
            returning=False,
        )
        return {"ok": True, "status": "DISCONNECTED"}

    async def create_or_update_draft(self, payload: dict[str, Any]) -> dict[str, Any]:
        db = self._require_db()
        status = await self.get_public_status()
        sender = extract_bare_email(payload.get("senderAddress") or status.get("selectedSenderEmail"))
        if not sender:
            raise ZohoIntegrationError(400, "No authorized Zoho sender address selected.")

        draft_id = payload.get("draftId")
        existing = (
            await db.select_one("email_approvals", filters={"id": f"eq.{draft_id}"})
            if draft_id
            else None
        )
        now_iso = _utc_iso()
        recipient = extract_bare_email(payload.get("recipientEmail") or (existing or {}).get("recipient_email"))
        if not recipient:
            raise ZohoIntegrationError(400, "Recipient email address is required.")

        cc_list = [extract_bare_email(x) for x in (payload.get("cc") or []) if extract_bare_email(x)]
        bcc_list = [extract_bare_email(x) for x in (payload.get("bcc") or []) if extract_bare_email(x)]
        subject = str(payload.get("subject") if payload.get("subject") is not None else (existing or {}).get("subject") or "").strip()
        text_body = str(payload.get("textBody") if payload.get("textBody") is not None else (existing or {}).get("text_body") or "")
        html_body = (
            sanitize_email_html(str(payload["htmlBody"]))
            if payload.get("htmlBody")
            else (existing.get("html_body") if existing else None)
        )
        lead_id = str(payload.get("leadId") or (existing or {}).get("lead_id") or "")
        campaign_id = str(payload.get("campaignId") or (existing or {}).get("campaign_id") or "default")
        campaign_name = str(payload.get("campaignName") or (existing or {}).get("campaign_name") or "ZenLyft Direct Outreach")
        template_version = str(payload.get("templateVersion") or (existing or {}).get("template_version") or "research-v2")

        canonical_hash = compute_email_approval_hash(
            {
                "lead_id": lead_id,
                "channel": "email",
                "sender": sender,
                "recipient": recipient,
                "cc": cc_list,
                "bcc": bcc_list,
                "subject": subject,
                "body": text_body,
                "campaign_id": campaign_id,
                "template_version": template_version,
                "approval_timestamp": now_iso,
            }
        )

        row_data = {
            "lead_id": lead_id or None,
            "sender_address": sender,
            "recipient_email": recipient,
            "cc_addresses": cc_list,
            "bcc_addresses": bcc_list,
            "reply_to": payload.get("replyTo") or sender,
            "subject": subject,
            "html_body": html_body,
            "text_body": text_body,
            "rationale": payload.get("rationale") or (existing or {}).get("rationale"),
            "verified_research": payload.get("verifiedResearch") or (existing or {}).get("verified_research") or {},
            "selected_service": payload.get("selectedService") or (existing or {}).get("selected_service"),
            "campaign_id": campaign_id,
            "campaign_name": campaign_name,
            "template_version": template_version,
            "canonical_hash": canonical_hash,
            "approval_status": "DRAFT_PENDING",
            "approved_by": None,
            "approved_at": now_iso,
            "updated_at": now_iso,
        }
        if existing:
            updated = await db.update("email_approvals", row_data, filters={"id": f"eq.{existing['id']}"})
            return updated[0]
        inserted = await db.insert("email_approvals", row_data)
        return inserted[0]

    async def approve_draft(self, draft_id: str) -> dict[str, Any]:
        db = self._require_db()
        draft = await db.select_one("email_approvals", filters={"id": f"eq.{draft_id}"})
        if not draft:
            raise ZohoIntegrationError(404, "Email draft not found.")
        if draft.get("approval_status") in ("SENT", "ACCEPTED", "SENDING"):
            return draft

        approved_at = _utc_iso()
        canonical_hash = compute_email_approval_hash(
            {
                "lead_id": draft.get("lead_id") or "",
                "channel": "email",
                "sender": draft["sender_address"],
                "recipient": draft["recipient_email"],
                "cc": draft.get("cc_addresses") or [],
                "bcc": draft.get("bcc_addresses") or [],
                "subject": draft["subject"],
                "body": draft["text_body"],
                "campaign_id": draft.get("campaign_id") or "default",
                "template_version": draft.get("template_version") or "research-v2",
                "approval_timestamp": approved_at,
            }
        )
        rows = await db.update(
            "email_approvals",
            {
                "approval_status": "APPROVED",
                "approved_at": approved_at,
                "canonical_hash": canonical_hash,
                "updated_at": approved_at,
            },
            filters={"id": f"eq.{draft_id}"},
        )
        return rows[0]

    async def reject_draft(self, draft_id: str, reason: str = "") -> dict[str, Any]:
        db = self._require_db()
        rows = await db.update(
            "email_approvals",
            {
                "approval_status": "REJECTED",
                "rationale": reason or "Rejected by Founder",
                "updated_at": _utc_iso(),
            },
            filters={"id": f"eq.{draft_id}"},
        )
        if not rows:
            raise ZohoIntegrationError(404, "Email draft not found.")
        return rows[0]

    async def send_approved_draft(self, draft_id: str, *, auto_approve_for_founder: bool = True) -> dict[str, Any]:
        db = self._require_db()
        if not self.settings.email_send_enabled:
            raise ZohoIntegrationError(
                403,
                "Email dispatch is disabled (EMAIL_SEND_ENABLED=false). Enable it in backend environment before live sending.",
            )

        sys_row = await db.select_one("system_settings", filters={"id": "eq.1"})
        if sys_row and sys_row.get("emergency_stop"):
            raise ZohoIntegrationError(423, "Master emergency stop is active. Email sending is halted.")

        draft = await db.select_one("email_approvals", filters={"id": f"eq.{draft_id}"})
        if not draft:
            raise ZohoIntegrationError(404, "Email approval draft not found.")

        if draft.get("approval_status") in ("SENT", "ACCEPTED"):
            return {
                "ok": True,
                "idempotentHit": True,
                "status": draft["approval_status"],
                "zohoMessageId": draft.get("zoho_message_id"),
            }
        if draft.get("approval_status") == "DELIVERY_STATUS_UNKNOWN":
            raise ZohoIntegrationError(
                409,
                "Previous send attempt timed out (DELIVERY_STATUS_UNKNOWN). Check Zoho Sent folder manually before creating a new send.",
            )
        if draft.get("approval_status") == "SENDING":
            raise ZohoIntegrationError(409, "Email send is already in progress for this draft.")

        recipient_bare = extract_bare_email(draft.get("recipient_email"))
        suppressed = await db.select_one(
            "email_suppressions",
            filters={"email": f"eq.{recipient_bare}"},
        )
        if suppressed:
            raise ZohoIntegrationError(403, f"Recipient {recipient_bare} has opted out (email_suppressions).")

        if draft.get("approval_status") == "DRAFT_PENDING":
            if self.settings.email_require_approval and auto_approve_for_founder:
                draft = await self.approve_draft(draft_id)
            elif self.settings.email_require_approval:
                raise ZohoIntegrationError(403, "Founder approval is required before sending email.")

        # Verify canonical hash integrity before dispatch
        hash_valid = verify_email_approval_hash(
            {
                "lead_id": draft.get("lead_id") or "",
                "channel": "email",
                "sender": draft["sender_address"],
                "recipient": draft["recipient_email"],
                "cc": draft.get("cc_addresses") or [],
                "bcc": draft.get("bcc_addresses") or [],
                "subject": draft["subject"],
                "body": draft["text_body"],
                "campaign_id": draft.get("campaign_id") or "default",
                "template_version": draft.get("template_version") or "research-v2",
                "approval_timestamp": draft.get("approved_at") or "",
            },
            draft.get("canonical_hash") or "",
        )
        if not hash_valid:
            raise ZohoIntegrationError(
                409,
                "Canonical SHA-256 verification failed because draft fields were modified after approval.",
            )

        ctx = await self.get_valid_access_context()
        if not ctx.get("account_id"):
            raise ZohoIntegrationError(409, "No Zoho Mail account selected.")

        # Validate sender against verified Zoho senders
        status = await self.get_public_status()
        allowed_senders = {s["email"] for s in status.get("senders", []) if s.get("validated", True)}
        chosen_sender = extract_bare_email(draft["sender_address"])
        if allowed_senders and chosen_sender not in allowed_senders:
            raise ZohoIntegrationError(403, f"Sender {chosen_sender} is not authorized in Zoho Mail.")

        idempotency_key = draft.get("idempotency_key") or f"zoho-draft-{draft['id']}"
        lock_token = secrets.token_hex(12)
        await db.update(
            "email_approvals",
            {
                "approval_status": "SENDING",
                "idempotency_key": idempotency_key,
                "dispatch_lock_token": lock_token,
                "dispatch_locked_at": _utc_iso(),
                "updated_at": _utc_iso(),
            },
            filters={"id": f"eq.{draft['id']}"},
            returning=False,
        )

        body_html = draft.get("html_body") or "".join(
            f"<p>{line}</p>" for line in str(draft["text_body"]).split("\n") if line.strip()
        )
        send_payload: dict[str, Any] = {
            "fromAddress": draft["sender_address"],
            "toAddress": draft["recipient_email"],
            "subject": draft["subject"],
            "content": body_html or draft["text_body"],
            "mailFormat": "html",
            "askReceipt": "no",
        }
        if draft.get("cc_addresses"):
            send_payload["ccAddress"] = ",".join(draft["cc_addresses"])
        if draft.get("bcc_addresses"):
            send_payload["bccAddress"] = ",".join(draft["bcc_addresses"])

        mail_base = str(ctx["mail_api_base_url"]).rstrip("/")
        send_url = f"{mail_base}/api/accounts/{ctx['account_id']}/messages"

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    send_url,
                    headers={
                        "Authorization": f"Zoho-oauthtoken {ctx['access_token']}",
                        "Content-Type": "application/json",
                    },
                    json=send_payload,
                )
        except httpx.TimeoutException as exc:
            await db.update(
                "email_approvals",
                {
                    "approval_status": "DELIVERY_STATUS_UNKNOWN",
                    "updated_at": _utc_iso(),
                },
                filters={"id": f"eq.{draft['id']}"},
                returning=False,
            )
            await db.insert(
                "email_delivery_logs",
                {
                    "email_approval_id": draft["id"],
                    "lead_id": draft.get("lead_id"),
                    "idempotency_key": idempotency_key,
                    "status": "DELIVERY_STATUS_UNKNOWN",
                    "error_message": f"Zoho API timed out: {exc}",
                },
                returning=False,
            )
            return {
                "ok": False,
                "status": "DELIVERY_STATUS_UNKNOWN",
                "error": "Zoho API request timed out; verify Sent folder before retrying.",
            }

        resp_json = resp.json() if resp.text else {}
        if resp.status_code >= 400:
            err_msg = str(resp_json.get("data", {}).get("moreInfo") or resp_json.get("status", {}).get("description") or f"HTTP {resp.status_code}")
            await db.update(
                "email_approvals",
                {"approval_status": "FAILED", "updated_at": _utc_iso()},
                filters={"id": f"eq.{draft['id']}"},
                returning=False,
            )
            await db.insert(
                "email_delivery_logs",
                {
                    "email_approval_id": draft["id"],
                    "lead_id": draft.get("lead_id"),
                    "idempotency_key": idempotency_key,
                    "status": "FAILED",
                    "http_status": resp.status_code,
                    "error_message": err_msg,
                },
                returning=False,
            )
            raise ZohoIntegrationError(502, err_msg)

        zoho_msg_id = str(resp_json.get("data", {}).get("messageId") or "") or None
        delivery_status = "SENT" if zoho_msg_id else "ACCEPTED"

        conv_id = await self._ensure_conversation(
            lead_id=draft.get("lead_id"),
            prospect_email=recipient_bare,
            sender_address=draft["sender_address"],
            subject=draft["subject"],
            thread_id=zoho_msg_id,
        )

        msg_rows = await db.insert(
            "email_messages",
            {
                "conversation_id": conv_id,
                "lead_id": draft.get("lead_id"),
                "zoho_account_id": ctx["account_id"],
                "zoho_message_id": zoho_msg_id,
                "thread_id": zoho_msg_id,
                "direction": "outbound",
                "from_address": draft["sender_address"],
                "to_addresses": [recipient_bare],
                "cc_addresses": draft.get("cc_addresses") or [],
                "bcc_addresses": draft.get("bcc_addresses") or [],
                "reply_to": draft.get("reply_to"),
                "subject": draft["subject"],
                "html_body": body_html,
                "text_body": draft["text_body"],
                "clean_snippet": str(draft["text_body"])[:220],
                "delivery_status": delivery_status,
                "idempotency_key": idempotency_key,
                "received_or_sent_at": _utc_iso(),
            },
        )
        msg_id = msg_rows[0]["id"] if msg_rows else None

        await db.update(
            "email_approvals",
            {
                "approval_status": delivery_status,
                "conversation_id": conv_id,
                "zoho_message_id": zoho_msg_id,
                "updated_at": _utc_iso(),
            },
            filters={"id": f"eq.{draft['id']}"},
            returning=False,
        )
        await db.insert(
            "email_delivery_logs",
            {
                "email_approval_id": draft["id"],
                "email_message_id": msg_id,
                "lead_id": draft.get("lead_id"),
                "idempotency_key": idempotency_key,
                "status": delivery_status,
                "zoho_message_id": zoho_msg_id,
                "http_status": resp.status_code,
            },
            returning=False,
        )
        if draft.get("lead_id"):
            await db.update(
                "leads",
                {"status": "contacted", "last_contacted_at": _utc_iso()},
                filters={"id": f"eq.{draft['lead_id']}"},
                returning=False,
            )
        return {
            "ok": True,
            "status": delivery_status,
            "zohoMessageId": zoho_msg_id,
            "emailMessageId": msg_id,
            "conversationId": conv_id,
        }

    async def _ensure_conversation(
        self,
        *,
        lead_id: str | None,
        prospect_email: str,
        sender_address: str | None,
        subject: str,
        thread_id: str | None = None,
    ) -> str | None:
        db = self._require_db()
        existing = None
        if thread_id:
            existing = await db.select_one("email_conversations", filters={"thread_id": f"eq.{thread_id}"})
        if not existing and lead_id:
            existing = await db.select_one(
                "email_conversations",
                filters={"lead_id": f"eq.{lead_id}"},
                order="last_message_at.desc",
            )
        if not existing and prospect_email:
            existing = await db.select_one(
                "email_conversations",
                filters={"prospect_email": f"eq.{prospect_email}"},
                order="last_message_at.desc",
            )
        if existing:
            await db.update(
                "email_conversations",
                {
                    "lead_id": lead_id or existing.get("lead_id"),
                    "last_message_at": _utc_iso(),
                    "message_count": int(existing.get("message_count") or 0) + 1,
                    "updated_at": _utc_iso(),
                },
                filters={"id": f"eq.{existing['id']}"},
                returning=False,
            )
            return str(existing["id"])

        rows = await db.insert(
            "email_conversations",
            {
                "lead_id": lead_id,
                "thread_id": thread_id,
                "subject": subject or "(No Subject)",
                "prospect_email": prospect_email,
                "sender_address": sender_address,
                "message_count": 1,
                "last_message_at": _utc_iso(),
            },
        )
        return str(rows[0]["id"]) if rows else None

    async def _match_inbound_to_lead(
        self,
        *,
        from_email: str,
        thread_id: str | None,
        in_reply_to: str | None,
        subject: str,
    ) -> tuple[str | None, str | None, str]:
        db = self._require_db()
        if in_reply_to:
            ref = await db.select_one(
                "email_messages",
                columns="lead_id,conversation_id",
                filters={"internet_message_id": f"eq.{in_reply_to}"},
            )
            if ref and ref.get("lead_id"):
                return str(ref["lead_id"]), ref.get("conversation_id"), "in_reply_to"
        if thread_id:
            conv = await db.select_one(
                "email_conversations",
                columns="id,lead_id",
                filters={"thread_id": f"eq.{thread_id}"},
            )
            if conv and conv.get("lead_id"):
                return str(conv["lead_id"]), str(conv["id"]), "thread_id"
        if from_email:
            lead = await db.select_one("leads", columns="id", filters={"email": f"ilike.{from_email}"})
            if lead:
                return str(lead["id"]), None, "prospect_email"
        cleaned_subj = re.sub(r"^(re|fwd?)\s*:\s*", "", subject or "", flags=re.I).strip()
        if len(cleaned_subj) >= 6:
            conv = await db.select_one(
                "email_conversations",
                columns="id,lead_id,prospect_email",
                filters={"subject": f"ilike.{cleaned_subj}"},
            )
            if conv and conv.get("lead_id") and (
                not from_email or extract_bare_email(conv.get("prospect_email")) == from_email
            ):
                return str(conv["lead_id"]), str(conv["id"]), "subject_fallback"
        return None, None, "unmatched"

    async def sync_inbox_now(self, *, max_pages: int = 3) -> dict[str, Any]:
        db = self._require_db()
        ctx = await self.get_valid_access_context()
        account_id = ctx.get("account_id")
        if not account_id:
            raise ZohoIntegrationError(409, "No Zoho Mail account selected.")

        sync_state = await db.select_one("email_sync_state", filters={"account_id": f"eq.{account_id}"})
        if sync_state and sync_state.get("backoff_until"):
            backoff_dt = _parse_iso(sync_state["backoff_until"])
            if backoff_dt and backoff_dt > _utc_now():
                return {
                    "ok": False,
                    "skippedBackoff": True,
                    "backoffUntil": sync_state["backoff_until"],
                    "syncedCount": 0,
                }

        last_ms = int((sync_state or {}).get("last_synced_message_time_ms") or 0)
        await db.upsert(
            "email_sync_state",
            {
                "account_id": account_id,
                "folder_id": "inbox",
                "last_sync_started_at": _utc_iso(),
                "status": "SYNCING",
                "updated_at": _utc_iso(),
            },
            on_conflict="account_id",
            returning=False,
        )

        mail_base = str(ctx["mail_api_base_url"]).rstrip("/")
        imported = 0
        matched = 0
        unmatched = 0
        newest_ms = last_ms

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                for page in range(max_pages):
                    resp = await client.get(
                        f"{mail_base}/api/accounts/{account_id}/messages/view",
                        headers={"Authorization": f"Zoho-oauthtoken {ctx['access_token']}"},
                        params={"start": str(page * 25), "limit": "25", "sortorder": "false"},
                    )
                    if resp.status_code == 429 or resp.status_code >= 500:
                        failures = int((sync_state or {}).get("consecutive_failures") or 0) + 1
                        backoff_seconds = min(900, 60 * (2 ** min(failures, 4)))
                        await db.upsert(
                            "email_sync_state",
                            {
                                "account_id": account_id,
                                "consecutive_failures": failures,
                                "backoff_until": _utc_iso(_utc_now() + timedelta(seconds=backoff_seconds)),
                                "last_error": f"Zoho sync HTTP {resp.status_code}",
                                "status": "SYNC_ERROR",
                                "updated_at": _utc_iso(),
                            },
                            on_conflict="account_id",
                            returning=False,
                        )
                        raise ZohoIntegrationError(resp.status_code, f"Zoho sync rate/server limit HTTP {resp.status_code}")

                    if resp.status_code >= 400:
                        raise ZohoIntegrationError(resp.status_code, f"Zoho list messages failed HTTP {resp.status_code}")

                    data = resp.json() if resp.text else {}
                    items = data.get("data") if isinstance(data, dict) else []
                    if not isinstance(items, list) or not items:
                        break

                    reached_older = False
                    for item in items:
                        msg_id = str(item.get("messageId") or "")
                        if not msg_id:
                            continue
                        received_ms = int(item.get("receivedTime") or item.get("sentDateInGMT") or 0)
                        if last_ms and received_ms and received_ms <= last_ms:
                            reached_older = True
                            continue

                        dup = await db.select_one(
                            "email_messages",
                            columns="id",
                            filters={"zoho_message_id": f"eq.{msg_id}"},
                        )
                        if dup:
                            if received_ms > newest_ms:
                                newest_ms = received_ms
                            continue

                        folder_id = str(item.get("folderId") or "inbox")
                        content_resp = await client.get(
                            f"{mail_base}/api/accounts/{account_id}/folders/{folder_id}/messages/{msg_id}/content",
                            headers={"Authorization": f"Zoho-oauthtoken {ctx['access_token']}"},
                        )
                        raw_html = ""
                        if content_resp.status_code < 400:
                            cjson = content_resp.json() if content_resp.text else {}
                            raw_html = str((cjson.get("data") or {}).get("content") or "")

                        safe_html = sanitize_email_html(raw_html)
                        body_text = strip_html_to_text(safe_html or str(item.get("summary") or ""))
                        from_email = extract_bare_email(item.get("fromAddress") or item.get("sender"))
                        subject = str(item.get("subject") or "(No Subject)")
                        thread_id = str(item.get("threadId") or "") or None
                        in_reply_to = str(item.get("inReplyTo") or "") or None

                        injection_flags = detect_inbound_prompt_injection(f"{subject}\n{body_text}")
                        classification, is_unsub = classify_inbound_reply(subject, body_text)
                        lead_id, conv_id, _strategy = await self._match_inbound_to_lead(
                            from_email=from_email,
                            thread_id=thread_id,
                            in_reply_to=in_reply_to,
                            subject=subject,
                        )

                        lead_row = (
                            await db.select_one(
                                "leads",
                                columns="company_name,recommended_service",
                                filters={"id": f"eq.{lead_id}"},
                            )
                            if lead_id
                            else None
                        )
                        ai_reply, ai_rationale = build_safe_ai_email_reply_draft(
                            company_name=(lead_row or {}).get("company_name") or from_email or "there",
                            classification=classification,
                            selected_service=(lead_row or {}).get("recommended_service"),
                            has_prompt_injection=bool(injection_flags),
                        )

                        if not conv_id:
                            conv_id = await self._ensure_conversation(
                                lead_id=lead_id,
                                prospect_email=from_email,
                                sender_address=extract_bare_email(ctx.get("sender_email")),
                                subject=subject,
                                thread_id=thread_id,
                            )
                        if conv_id:
                            await db.update(
                                "email_conversations",
                                {
                                    "reply_classification": classification,
                                    "ai_suggested_reply": ai_reply,
                                    "ai_reply_rationale": ai_rationale,
                                    "updated_at": _utc_iso(),
                                },
                                filters={"id": f"eq.{conv_id}"},
                                returning=False,
                            )

                        to_list = [extract_bare_email(x) for x in str(item.get("toAddress") or "").split(",") if extract_bare_email(x)]
                        await db.insert(
                            "email_messages",
                            {
                                "conversation_id": conv_id,
                                "lead_id": lead_id,
                                "zoho_account_id": account_id,
                                "zoho_message_id": msg_id,
                                "thread_id": thread_id,
                                "in_reply_to": in_reply_to,
                                "direction": "inbound",
                                "from_address": from_email,
                                "to_addresses": to_list,
                                "subject": subject,
                                "html_body": safe_html,
                                "text_body": body_text,
                                "clean_snippet": body_text[:220],
                                "delivery_status": "RECEIVED",
                                "reply_classification": classification,
                                "is_unmatched": lead_id is None,
                                "has_prompt_injection": bool(injection_flags),
                                "security_flags": injection_flags,
                                "received_or_sent_at": (
                                    datetime.fromtimestamp(received_ms / 1000, tz=timezone.utc).isoformat()
                                    if received_ms
                                    else _utc_iso()
                                ),
                            },
                            returning=False,
                        )
                        if is_unsub and from_email:
                            await db.upsert(
                                "email_suppressions",
                                {
                                    "email": from_email,
                                    "lead_id": lead_id,
                                    "reason": "unsubscribe_request",
                                    "source_message_id": msg_id,
                                },
                                on_conflict="email",
                                returning=False,
                            )
                            if lead_id:
                                await db.update(
                                    "email_approvals",
                                    {"approval_status": "CANCELLED", "updated_at": _utc_iso()},
                                    filters={"lead_id": f"eq.{lead_id}", "approval_status": "in.(DRAFT_PENDING,APPROVED)"},
                                    returning=False,
                                )

                        imported += 1
                        if lead_id:
                            matched += 1
                        else:
                            unmatched += 1
                        if received_ms > newest_ms:
                            newest_ms = received_ms

                    if reached_older or len(items) < 25:
                        break

            await db.upsert(
                "email_sync_state",
                {
                    "account_id": account_id,
                    "folder_id": "inbox",
                    "last_synced_message_time_ms": newest_ms,
                    "last_sync_completed_at": _utc_iso(),
                    "last_successful_sync_at": _utc_iso(),
                    "consecutive_failures": 0,
                    "backoff_until": None,
                    "last_error": None,
                    "total_synced_count": int((sync_state or {}).get("total_synced_count") or 0) + imported,
                    "status": "CONNECTED",
                    "updated_at": _utc_iso(),
                },
                on_conflict="account_id",
                returning=False,
            )
            return {
                "ok": True,
                "syncedCount": imported,
                "matchedCount": matched,
                "unmatchedCount": unmatched,
                "lastSuccessfulSyncAt": _utc_iso(),
            }
        except ZohoIntegrationError:
            raise
        except Exception as exc:
            await db.upsert(
                "email_sync_state",
                {
                    "account_id": account_id,
                    "last_sync_completed_at": _utc_iso(),
                    "last_error": str(exc)[:300],
                    "status": "SYNC_ERROR",
                    "updated_at": _utc_iso(),
                },
                on_conflict="account_id",
                returning=False,
            )
            raise ZohoIntegrationError(502, f"Inbox sync failed: {exc}") from exc


async def zoho_sync_scheduler_loop(settings: AscensionSettings) -> None:
    """In-process async background loop performing incremental Zoho sync at EMAIL_SYNC_INTERVAL_SECONDS."""
    interval = max(15, int(settings.email_sync_interval_seconds or 60))
    service = ZohoMailService(settings)
    while True:
        await asyncio.sleep(interval)
        if not settings.email_sync_enabled:
            continue
        try:
            status = await service.get_public_status()
            if status.get("status") == "CONNECTED":
                await service.sync_inbox_now(max_pages=2)
        except Exception as exc:
            logger.warning("Background Zoho sync cycle skipped/failed: %s", str(exc)[:200])

