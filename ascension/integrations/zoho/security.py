"""Zoho security primitives: regional endpoint allowlist, AES-256-GCM vault, canonical hashes, and inbound sanitization."""

import base64
import hashlib
import hmac
import json
import os
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass(frozen=True)
class ZohoRegionalEndpoints:
    data_center: str
    accounts_base_url: str
    mail_api_base_url: str


ZOHO_DC_REGISTRY: dict[str, ZohoRegionalEndpoints] = {
    "in": ZohoRegionalEndpoints("in", "https://accounts.zoho.in", "https://mail.zoho.in"),
    "us": ZohoRegionalEndpoints("us", "https://accounts.zoho.com", "https://mail.zoho.com"),
    "com": ZohoRegionalEndpoints("us", "https://accounts.zoho.com", "https://mail.zoho.com"),
    "eu": ZohoRegionalEndpoints("eu", "https://accounts.zoho.eu", "https://mail.zoho.eu"),
    "au": ZohoRegionalEndpoints("au", "https://accounts.zoho.com.au", "https://mail.zoho.com.au"),
    "jp": ZohoRegionalEndpoints("jp", "https://accounts.zoho.jp", "https://mail.zoho.jp"),
    "cn": ZohoRegionalEndpoints("cn", "https://accounts.zoho.com.cn", "https://mail.zoho.com.cn"),
    "ca": ZohoRegionalEndpoints("ca", "https://accounts.zohocloud.ca", "https://mail.zohocloud.ca"),
    "sa": ZohoRegionalEndpoints("sa", "https://accounts.zoho.sa", "https://mail.zoho.sa"),
}

_PROMPT_INJECTION_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("ignore_previous_instructions", re.compile(r"ignore\s+(all\s+)?(previous|prior)\s+instructions", re.I)),
    ("override_approval", re.compile(r"override\s+(founder\s+)?approval|skip\s+approval", re.I)),
    ("reveal_secrets", re.compile(r"reveal\s+(system\s+prompt|api[_\s]?key|secret|token|client_secret)", re.I)),
    ("auto_send_command", re.compile(r"execute\s+auto[\s-]?send|send\s+immediately\s+without\s+review", re.I)),
    ("disable_kill_switch", re.compile(r"disable\s+(emergency\s+stop|kill[\s-]?switch)", re.I)),
    ("system_role_spoof", re.compile(r"^\s*(SYSTEM|DEVELOPER|ASSISTANT)\s*:", re.I | re.M)),
]


def resolve_zoho_regional_endpoints(
    accounts_server: str | None = None,
    location: str | None = None,
    default_accounts_url: str | None = None,
) -> ZohoRegionalEndpoints:
    """Validate and map Zoho OAuth accounts-server & location to regional endpoints."""
    server_raw = (accounts_server or "").strip().rstrip("/").lower()
    if server_raw:
        parsed = urlparse(server_raw)
        if parsed.scheme == "https" and parsed.netloc:
            origin = f"https://{parsed.netloc}"
            for entry in ZOHO_DC_REGISTRY.values():
                if entry.accounts_base_url == origin:
                    return entry

    loc_key = (location or "").strip().lower()
    if loc_key in ZOHO_DC_REGISTRY:
        return ZOHO_DC_REGISTRY[loc_key]

    default_origin = (
        default_accounts_url or os.getenv("ZOHO_ACCOUNTS_BASE_URL") or "https://accounts.zoho.in"
    ).strip().rstrip("/").lower()
    for entry in ZOHO_DC_REGISTRY.values():
        if entry.accounts_base_url == default_origin:
            return entry

    return ZOHO_DC_REGISTRY["in"]


def _derive_aes_key(key_override: str | None = None) -> bytes:
    raw = (key_override if key_override is not None else os.getenv("ZOHO_REFRESH_TOKEN_ENCRYPTION_KEY", "")).strip()
    if len(raw) < 16:
        raise ValueError(
            "ZOHO_REFRESH_TOKEN_ENCRYPTION_KEY must be set to at least 16 characters."
        )
    return hashlib.sha256(raw.encode("utf-8")).digest()


def encrypt_zoho_token(plaintext: str, key_override: str | None = None) -> str:
    """Encrypt secret token with AES-256-GCM matching TypeScript `v1:<iv>:<ct+tag>` format."""
    key = _derive_aes_key(key_override)
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ct_and_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    return f"v1:{base64.b64encode(iv).decode('ascii')}:{base64.b64encode(ct_and_tag).decode('ascii')}"


def decrypt_zoho_token(ciphertext: str, key_override: str | None = None) -> str:
    """Decrypt AES-256-GCM token envelope."""
    parts = (ciphertext or "").split(":")
    if len(parts) != 3 or parts[0] != "v1":
        raise ValueError("Invalid encrypted token format.")
    key = _derive_aes_key(key_override)
    iv = base64.b64decode(parts[1])
    combined = base64.b64decode(parts[2])
    if len(iv) != 12 or len(combined) < 17:
        raise ValueError("Malformed encrypted token payload.")
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, combined, None).decode("utf-8")


def compute_email_approval_hash(payload: dict[str, Any]) -> str:
    """Compute canonical SHA-256 hash identical to TypeScript `computeZohoEmailApprovalHash`."""
    cc_list = sorted(str(x).strip().lower() for x in (payload.get("cc") or []) if str(x).strip())
    bcc_list = sorted(str(x).strip().lower() for x in (payload.get("bcc") or []) if str(x).strip())
    canonical_obj = {
        "approval_timestamp": str(payload.get("approval_timestamp") or "").strip(),
        "bcc": bcc_list,
        "body": str(payload.get("body") or ""),
        "campaign_id": str(payload.get("campaign_id") or "default").strip(),
        "cc": cc_list,
        "channel": "email",
        "lead_id": str(payload.get("lead_id") or "").strip(),
        "recipient": str(payload.get("recipient") or "").strip().lower(),
        "sender": str(payload.get("sender") or "").strip().lower(),
        "subject": str(payload.get("subject") or "").strip(),
        "template_version": str(payload.get("template_version") or "research-v2").strip(),
    }
    canonical_json = json.dumps(canonical_obj, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def verify_email_approval_hash(payload: dict[str, Any], expected_hash: str) -> bool:
    if not expected_hash or not re.fullmatch(r"[0-9a-fA-F]{64}", expected_hash.strip()):
        return False
    actual = compute_email_approval_hash(payload)
    return hmac.compare_digest(actual, expected_hash.strip().lower())


def sanitize_email_html(html: str) -> str:
    if not html:
        return ""
    clean = str(html)
    clean = re.sub(r"<script[\s\S]*?>[\s\S]*?</script>", "", clean, flags=re.I)
    clean = re.sub(r"<style[\s\S]*?>[\s\S]*?</style>", "", clean, flags=re.I)
    clean = re.sub(
        r"<(iframe|object|embed|form|meta|base|link)\b[^>]*>([\s\S]*?</\1>)?",
        "",
        clean,
        flags=re.I,
    )
    clean = re.sub(r"\son[a-z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", "", clean, flags=re.I)
    clean = re.sub(
        r"(href|src)\s*=\s*([\"'])\s*(javascript:|vbscript:|data:text/html)[\s\S]*?\2",
        r'\1="#"',
        clean,
        flags=re.I,
    )
    return clean.strip()


def strip_html_to_text(html_or_text: str) -> str:
    text = str(html_or_text or "")
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</(p|div|li|tr|h[1-6])>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def detect_inbound_prompt_injection(text: str) -> list[str]:
    content = str(text or "")
    return [label for label, pattern in _PROMPT_INJECTION_RULES if pattern.search(content)]


def classify_inbound_reply(subject: str, body_text: str) -> tuple[str, bool]:
    text = f"{subject}\n{body_text}".lower()
    if re.search(r"\b(unsubscribe|opt[\s-]?out|remove\s+me|stop\s+(emailing|contacting|sending)|do\s+not\s+(email|contact))\b", text):
        return "Unsubscribe request", True
    if re.search(r"\b(out of office|auto[\s-]?reply|automatic reply|on vacation|away from (office|desk)|pto)\b", text):
        return "Out of office", False
    if re.search(r"\b(mailer-daemon|delivery status notification|undeliverable|auto-generated|do not reply|noreply)\b", text):
        return "Automated response", False
    if re.search(r"\b(not interested|no thanks|no need|not looking|pass for now|already have a vendor)\b", text):
        return "Not interested", False
    if re.search(r"\b(meeting|schedule a call|book a demo|zoom|google meet|tuesday|wednesday|thursday|friday|calendar|slot)\b", text):
        return "Meeting requested", False
    if re.search(r"\b(price|pricing|cost|quote|quotation|estimate|budget|inr|rs\.?|₹|charges|fee)\b", text):
        return "Wants pricing", False
    if re.search(r"\b(next month|next quarter|later|follow up|circle back|busy right now|after exams)\b", text):
        return "Follow-up later", False
    if re.search(r"\b(more info|more details|send deck|brochure|how does it work|share details|tell me more|explain)\b", text):
        return "Needs more information", False
    if re.search(r"\b(interested|sounds good|let'?s discuss|happy to connect|looks relevant|yes please)\b", text):
        return "Interested", False
    return "Unclear", False

