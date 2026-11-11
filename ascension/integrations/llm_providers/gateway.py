"""Provider-independent LLM gateway for ZenLyft Ascension (DeepSeek, Kimi, GLM, Groq, Gemini, Ollama, Future G.E.N.I.)."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx

from ascension.backend.core.config import get_settings
from ascension.backend.core.security import KillSwitchController


class BudgetExceededError(RuntimeError):
    """Raised when a task or company budget cap is reached."""


class PaidProviderBlockedError(PermissionError):
    """Raised when a paid provider fallback is requested while ALLOW_PAID_FALLBACK is False."""


@dataclass(frozen=True)
class ProviderDescriptor:
    name: str
    base_url: str
    env_key_attr: str
    default_model: str
    is_paid_by_default: bool
    protocol: str  # "openai_compat" | "gemini" | "ollama" | "geni"


PROVIDER_CATALOG: dict[str, ProviderDescriptor] = {
    "groq": ProviderDescriptor(
        name="groq",
        base_url="https://api.groq.com/openai/v1/chat/completions",
        env_key_attr="groq_api_key",
        default_model="qwen/qwen3.8-27b",
        is_paid_by_default=False,
        protocol="openai_compat",
    ),
    "gemini": ProviderDescriptor(
        name="gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta/models",
        env_key_attr="gemini_api_key",
        default_model="gemini-flash-lite-latest",
        is_paid_by_default=False,
        protocol="gemini",
    ),
    "deepseek": ProviderDescriptor(
        name="deepseek",
        base_url="https://api.deepseek.com/chat/completions",
        env_key_attr="deepseek_api_key",
        default_model="deepseek-chat",
        is_paid_by_default=True,
        protocol="openai_compat",
    ),
    "kimi": ProviderDescriptor(
        name="kimi",
        base_url="https://api.moonshot.cn/v1/chat/completions",
        env_key_attr="kimi_api_key",
        default_model="moonshot-v1-8k",
        is_paid_by_default=True,
        protocol="openai_compat",
    ),
    "glm": ProviderDescriptor(
        name="glm",
        base_url="https://open.bigmodel.cn/api/paas/v4/chat/completions",
        env_key_attr="glm_api_key",
        default_model="glm-4-flash",
        is_paid_by_default=False,
        protocol="openai_compat",
    ),
    "ollama": ProviderDescriptor(
        name="ollama",
        base_url="",
        env_key_attr="ollama_base_url",
        default_model="qwen2.5:3b",
        is_paid_by_default=False,
        protocol="ollama",
    ),
    "geni": ProviderDescriptor(
        name="geni",
        base_url="",
        env_key_attr="geni_model_endpoint",
        default_model="geni-v1",
        is_paid_by_default=False,
        protocol="geni",
    ),
}


@dataclass
class GatewayResult:
    provider: str
    model: str
    content: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost_usd: float = 0.0
    fallback_used: bool = False
    error: str | None = None


@dataclass
class UsageLedger:
    requests_by_provider: dict[str, int] = field(default_factory=dict)
    tokens_by_provider: dict[str, int] = field(default_factory=dict)
    total_cost_usd: float = 0.0
    last_updated: str | None = None

    def record(self, result: GatewayResult) -> None:
        self.requests_by_provider[result.provider] = (
            self.requests_by_provider.get(result.provider, 0) + 1
        )
        tokens = result.prompt_tokens + result.completion_tokens
        self.tokens_by_provider[result.provider] = (
            self.tokens_by_provider.get(result.provider, 0) + tokens
        )
        self.total_cost_usd += result.estimated_cost_usd
        self.last_updated = datetime.now(UTC).isoformat()


class UnifiedLLMGateway:
    """Routes requests across DeepSeek, Kimi, GLM, Groq, Gemini, Ollama, and Future G.E.N.I."""

    def __init__(
        self,
        kill_switch: KillSwitchController | None = None,
        mock_handler: Any | None = None,
    ) -> None:
        self.settings = get_settings()
        self.kill_switch = kill_switch or KillSwitchController()
        self.mock_handler = mock_handler
        self.ledger = UsageLedger()

    def _has_credentials(self, provider: str) -> bool:
        desc = PROVIDER_CATALOG.get(provider)
        if not desc:
            return False
        value = getattr(self.settings, desc.env_key_attr, "")
        return bool(str(value).strip())

    def configured_providers(self) -> list[dict[str, Any]]:
        return [
            {
                "name": desc.name,
                "default_model": desc.default_model,
                "configured": self._has_credentials(desc.name),
                "is_paid": desc.is_paid_by_default,
                "allowed_now": (not desc.is_paid_by_default) or self.settings.allow_paid_fallback,
            }
            for desc in PROVIDER_CATALOG.values()
        ]

    async def generate(
        self,
        messages: list[dict[str, str]],
        preferred_provider: str | None = None,
        model: str | None = None,
        fallback_providers: list[str] | None = None,
        token_budget: int = 12000,
        tokens_spent_so_far: int = 0,
        timeout_sec: int = 45,
        deterministic_fallback_text: str | None = None,
    ) -> GatewayResult:
        self.kill_switch.assert_clear()

        if tokens_spent_so_far >= token_budget:
            raise BudgetExceededError(
                f"Token budget exceeded ({tokens_spent_so_far}/{token_budget})."
            )

        if self.mock_handler is not None:
            res = self.mock_handler(
                messages=messages,
                provider=preferred_provider or "mock",
                model=model or "mock-deterministic",
            )
            if isinstance(res, GatewayResult):
                self.ledger.record(res)
                return res

        chain = [preferred_provider or self.settings.default_provider]
        for fb in fallback_providers or ["groq", "gemini", "glm"]:
            if fb not in chain:
                chain.append(fb)

        errors: list[str] = []
        for idx, provider_name in enumerate(chain):
            desc = PROVIDER_CATALOG.get(provider_name)
            if not desc:
                errors.append(f"Unknown provider '{provider_name}'")
                continue

            if desc.is_paid_by_default and not self.settings.allow_paid_fallback:
                if idx == 0 and preferred_provider == provider_name and not self._has_credentials(provider_name):
                    errors.append(f"{provider_name}: blocked (ALLOW_PAID_FALLBACK=false)")
                    continue
                if idx > 0:
                    errors.append(f"{provider_name}: skipped paid fallback (ALLOW_PAID_FALLBACK=false)")
                    continue

            if not self._has_credentials(provider_name):
                errors.append(f"{provider_name}: NOT_CONFIGURED")
                continue

            # Use caller-supplied model only for the preferred provider; fallbacks use their native default.
            chosen_model = model if (idx == 0 and model) else desc.default_model
            try:
                result = await self._invoke_provider(desc, chosen_model, messages, timeout_sec)
                result.fallback_used = idx > 0
                self.ledger.record(result)
                return result
            except Exception as exc:
                errors.append(f"{provider_name}: {exc}")

        if deterministic_fallback_text is not None:
            res = GatewayResult(
                provider="deterministic-safe-fallback",
                model="rule-engine-v1",
                content=deterministic_fallback_text,
                fallback_used=True,
                error="; ".join(errors) if errors else "No provider configured",
            )
            self.ledger.record(res)
            return res

        raise RuntimeError(
            "No eligible LLM provider succeeded (strict ₹0 guard prevented paid fallback): "
            + "; ".join(errors)
        )

    async def _invoke_provider(
        self,
        desc: ProviderDescriptor,
        model: str,
        messages: list[dict[str, str]],
        timeout_sec: int,
    ) -> GatewayResult:
        secret_or_url = str(getattr(self.settings, desc.env_key_attr, "")).strip()
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            if desc.protocol == "openai_compat":
                resp = await client.post(
                    desc.base_url,
                    headers={"Authorization": f"Bearer {secret_or_url}"},
                    json={"model": model, "messages": messages, "temperature": 0.1},
                )
                resp.raise_for_status()
                data = resp.json()
                usage = data.get("usage", {})
                text = data["choices"][0]["message"]["content"]
                return GatewayResult(
                    provider=desc.name,
                    model=model,
                    content=text,
                    prompt_tokens=int(usage.get("prompt_tokens", 0)),
                    completion_tokens=int(usage.get("completion_tokens", 0)),
                    estimated_cost_usd=0.0 if not desc.is_paid_by_default else 0.001,
                )

            if desc.protocol == "gemini":
                url = f"{desc.base_url}/{model}:generateContent?key={secret_or_url}"
                combined = "\n\n".join(f"[{m['role']}] {m['content']}" for m in messages)
                resp = await client.post(
                    url,
                    json={"contents": [{"parts": [{"text": combined}]}]},
                )
                resp.raise_for_status()
                data = resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                usage = data.get("usageMetadata", {})
                return GatewayResult(
                    provider="gemini",
                    model=model,
                    content=text,
                    prompt_tokens=int(usage.get("promptTokenCount", 0)),
                    completion_tokens=int(usage.get("candidatesTokenCount", 0)),
                    estimated_cost_usd=0.0,
                )

            if desc.protocol == "ollama":
                endpoint = f"{secret_or_url.rstrip('/')}/api/chat"
                resp = await client.post(
                    endpoint,
                    json={"model": model, "messages": messages, "stream": False},
                )
                resp.raise_for_status()
                data = resp.json()
                return GatewayResult(
                    provider="ollama",
                    model=model,
                    content=data.get("message", {}).get("content", ""),
                    estimated_cost_usd=0.0,
                )

            # Future G.E.N.I. HTTP inference endpoint contract
            headers = {"Authorization": f"Bearer {self.settings.geni_api_key}"} if self.settings.geni_api_key else {}
            resp = await client.post(
                f"{secret_or_url.rstrip('/')}/v1/chat/completions",
                headers=headers,
                json={"model": model, "messages": messages},
            )
            resp.raise_for_status()
            data = resp.json()
            return GatewayResult(
                provider="geni",
                model=model,
                content=data["choices"][0]["message"]["content"],
                estimated_cost_usd=0.0,
            )

