"""n8n External Automation Bridge & HMAC-Signed Notification Payloads."""

from typing import Any

import httpx

from ascension.backend.core.config import get_settings
from ascension.backend.core.security import sign_hmac_webhook


class N8NAutomationBridge:
    """Sends HMAC-signed event notifications (Telegram/Email/Reports) to n8n webhooks."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def emit_event(self, event_type: str, data: dict[str, Any]) -> dict[str, Any]:
        """Dispatch an external automation event to n8n if N8N_OUTBOUND_WEBHOOK_URL is configured."""
        url = self.settings.n8n_outbound_webhook_url.strip()
        if not url:
            return {
                "dispatched": False,
                "status": "NOT_CONFIGURED",
                "event_type": event_type,
            }

        import json

        body = json.dumps({"event_type": event_type, "data": data}).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.settings.n8n_webhook_secret:
            ts, sig = sign_hmac_webhook(body, self.settings.n8n_webhook_secret)
            headers["x-zenlyft-timestamp"] = ts
            headers["x-zenlyft-signature"] = sig

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, content=body, headers=headers)
            resp.raise_for_status()
            return {"dispatched": True, "status_code": resp.status_code, "event_type": event_type}

