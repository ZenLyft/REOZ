"""FastAPI router for Zoho Mail OAuth 2.0, account discovery, approved dispatch, and inbox sync."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from ascension.backend.core.config import AscensionSettings, get_settings
from ascension.integrations.zoho.service import ZohoIntegrationError, ZohoMailService


logger = logging.getLogger("ascension.zoho.router")


def get_zoho_service(settings: AscensionSettings = Depends(get_settings)) -> ZohoMailService:
    return ZohoMailService(settings)


def require_service_auth(
    authorization: str | None = Header(default=None),
    settings: AscensionSettings = Depends(get_settings),
) -> None:
    secret = settings.ascension_api_secret.strip()
    if not secret:
        return
    if authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="Invalid or missing Ascension bearer token")


class SelectSenderBody(BaseModel):
    senderEmail: str = Field(..., min_length=3)
    accountId: str | None = None


class CreateOrUpdateDraftBody(BaseModel):
    draftId: str | None = None
    leadId: str | None = None
    senderAddress: str | None = None
    recipientEmail: str | None = None
    cc: list[str] = Field(default_factory=list)
    bcc: list[str] = Field(default_factory=list)
    replyTo: str | None = None
    subject: str | None = None
    textBody: str | None = None
    htmlBody: str | None = None
    rationale: str | None = None
    verifiedResearch: dict[str, Any] | None = None
    selectedService: str | None = None
    campaignId: str | None = None
    campaignName: str | None = None
    templateVersion: str | None = None


class RejectDraftBody(BaseModel):
    reason: str = ""


zoho_router = APIRouter(tags=["zoho-mail"])


@zoho_router.get("/api/integrations/zoho/status", dependencies=[Depends(require_service_auth)])
async def zoho_status(service: ZohoMailService = Depends(get_zoho_service)) -> dict[str, Any]:
    return await service.get_public_status()


@zoho_router.get("/api/integrations/zoho/connect", dependencies=[Depends(require_service_auth)])
@zoho_router.post("/api/integrations/zoho/connect", dependencies=[Depends(require_service_auth)])
async def zoho_connect(
    return_to: str = Query(default="/dashboard/settings"),
    returnTo: str | None = Query(default=None),
    service: ZohoMailService = Depends(get_zoho_service),
) -> dict[str, Any]:
    try:
        res = await service.start_oauth_connect(return_to=returnTo or return_to)
        return {**res, "authUrl": res.get("authorizationUrl")}
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.get("/api/integrations/zoho/callback")
async def zoho_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    location: str | None = Query(default=None),
    accounts_server: str | None = Query(default=None, alias="accounts-server"),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    settings: AscensionSettings = Depends(get_settings),
    service: ZohoMailService = Depends(get_zoho_service),
):
    """Zoho OAuth 2.0 Server-based callback endpoint (https://zenlyft-ascension.onrender.com/api/integrations/zoho/callback)."""
    frontend = settings.frontend_app_url.strip().rstrip("/")
    try:
        result = await service.handle_oauth_callback(
            code=code,
            state=state,
            location=location,
            accounts_server=accounts_server,
            error=error,
            error_description=error_description,
        )
        return_to = result.get("returnTo") or "/dashboard/settings"
        if frontend.startswith("http"):
            return RedirectResponse(
                url=f"{frontend}{return_to}?zoho=connected&dc={quote(str(result.get('dataCenter', 'in')))}",
                status_code=302,
            )
        return HTMLResponse(
            content=(
                "<html><body style='font-family:sans-serif;padding:24px'>"
                "<h2>Zoho Mail Connected</h2>"
                "<p>OAuth authorization succeeded. You may return to the ZenLyft Client Engine dashboard.</p>"
                "</body></html>"
            ),
            status_code=200,
        )
    except ZohoIntegrationError as exc:
        logger.warning("Zoho integration error during OAuth callback: %s", exc)
        if frontend.startswith("http"):
            return RedirectResponse(
                url=f"{frontend}/dashboard/settings?zoho_error={quote(str(exc)[:180])}",
                status_code=302,
            )
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error during Zoho OAuth callback: %s", exc)
        if frontend.startswith("http"):
            return RedirectResponse(
                url=f"{frontend}/dashboard/settings?zoho_error={quote(str(exc)[:180])}",
                status_code=302,
            )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@zoho_router.get("/api/integrations/zoho/accounts", dependencies=[Depends(require_service_auth)])
async def zoho_accounts(service: ZohoMailService = Depends(get_zoho_service)) -> dict[str, Any]:
    try:
        await service.test_connection()
        status = await service.get_public_status()
        return {"accounts": status.get("accounts", []), "senders": status.get("senders", [])}
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.get("/api/integrations/zoho/senders", dependencies=[Depends(require_service_auth)])
async def zoho_senders(service: ZohoMailService = Depends(get_zoho_service)) -> dict[str, Any]:
    status = await service.get_public_status()
    return {
        "senders": status.get("senders", []),
        "selectedSenderEmail": status.get("selectedSenderEmail"),
    }


@zoho_router.post("/api/integrations/zoho/select-sender", dependencies=[Depends(require_service_auth)])
async def zoho_select_sender(
    body: SelectSenderBody,
    service: ZohoMailService = Depends(get_zoho_service),
) -> dict[str, Any]:
    try:
        return await service.select_sender(sender_email=body.senderEmail, account_id=body.accountId)
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.post("/api/integrations/zoho/test", dependencies=[Depends(require_service_auth)])
async def zoho_test(service: ZohoMailService = Depends(get_zoho_service)) -> dict[str, Any]:
    try:
        return await service.test_connection()
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.post("/api/integrations/zoho/disconnect", dependencies=[Depends(require_service_auth)])
async def zoho_disconnect(service: ZohoMailService = Depends(get_zoho_service)) -> dict[str, Any]:
    try:
        return await service.disconnect()
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.get("/api/email/messages", dependencies=[Depends(require_service_auth)])
async def email_messages(
    unmatched: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    service: ZohoMailService = Depends(get_zoho_service),
) -> dict[str, Any]:
    db = service._require_db()
    filters = {"is_unmatched": "eq.true"} if unmatched else {}
    rows = await db.select("email_messages", filters=filters, order="received_or_sent_at.desc", limit=limit)
    return {"messages": rows}


@zoho_router.get("/api/email/conversations/{lead_id}", dependencies=[Depends(require_service_auth)])
async def email_lead_conversations(
    lead_id: str,
    service: ZohoMailService = Depends(get_zoho_service),
) -> dict[str, Any]:
    db = service._require_db()
    convs = await db.select(
        "email_conversations",
        filters={"lead_id": f"eq.{lead_id}"},
        order="last_message_at.desc",
    )
    msgs = await db.select(
        "email_messages",
        filters={"lead_id": f"eq.{lead_id}"},
        order="received_or_sent_at.asc",
    )
    approvals = await db.select(
        "email_approvals",
        filters={"lead_id": f"eq.{lead_id}"},
        order="created_at.desc",
    )
    return {"conversations": convs, "messages": msgs, "approvals": approvals}


@zoho_router.post("/api/email/drafts", dependencies=[Depends(require_service_auth)])
async def email_create_draft(
    body: CreateOrUpdateDraftBody,
    service: ZohoMailService = Depends(get_zoho_service),
) -> dict[str, Any]:
    try:
        draft = await service.create_or_update_draft(body.model_dump())
        return {"draft": draft}
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.patch("/api/email/drafts/{draft_id}", dependencies=[Depends(require_service_auth)])
async def email_update_draft(
    draft_id: str,
    body: CreateOrUpdateDraftBody,
    service: ZohoMailService = Depends(get_zoho_service),
) -> dict[str, Any]:
    try:
        payload = body.model_dump(exclude_none=True)
        payload["draftId"] = draft_id
        draft = await service.create_or_update_draft(payload)
        return {"draft": draft}
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.post("/api/email/drafts/{draft_id}/approve", dependencies=[Depends(require_service_auth)])
async def email_approve_draft(
    draft_id: str,
    service: ZohoMailService = Depends(get_zoho_service),
) -> dict[str, Any]:
    try:
        draft = await service.approve_draft(draft_id)
        return {"draft": draft}
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.post("/api/email/drafts/{draft_id}/reject", dependencies=[Depends(require_service_auth)])
async def email_reject_draft(
    draft_id: str,
    body: RejectDraftBody,
    service: ZohoMailService = Depends(get_zoho_service),
) -> dict[str, Any]:
    try:
        draft = await service.reject_draft(draft_id, reason=body.reason)
        return {"draft": draft}
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.post("/api/email/drafts/{draft_id}/send", dependencies=[Depends(require_service_auth)])
async def email_send_draft(
    draft_id: str,
    service: ZohoMailService = Depends(get_zoho_service),
) -> dict[str, Any]:
    try:
        return await service.send_approved_draft(draft_id)
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.post("/api/email/sync", dependencies=[Depends(require_service_auth)])
async def email_sync_now(service: ZohoMailService = Depends(get_zoho_service)) -> dict[str, Any]:
    try:
        return await service.sync_inbox_now()
    except ZohoIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@zoho_router.get("/api/email/sync/status", dependencies=[Depends(require_service_auth)])
async def email_sync_status(service: ZohoMailService = Depends(get_zoho_service)) -> dict[str, Any]:
    status = await service.get_public_status()
    return {"sync": status.get("sync", {}), "connectionStatus": status.get("status")}

