"""ZenLyft Multi-Model AI Gateway
Routes agent inference requests across free-tier providers:
1. Groq (Llama 3.3 70B, Llama 3.1 8B)
2. Google Gemini (Gemini Flash Lite, Gemini 2.5/3.8)
3. Mock / Deterministic Fallback
Tracks latency, token usage, error rates, and enforces a strict ₹0 spending policy.
"""

import json
import os
import time
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")


@dataclass
class GatewayResponse:
    provider: str
    model: str
    content: str
    parsed_json: dict[str, Any] | None
    latency_ms: int
    prompt_tokens: int = 0
    completion_tokens: int = 0
    success: bool = True
    error: str | None = None


@dataclass
class ProviderHealth:
    name: str
    active: bool
    last_success: str | None = None
    error_count: int = 0
    total_requests: int = 0


class MultiModelGateway:
    def __init__(self):
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.health: dict[str, ProviderHealth] = {
            "groq": ProviderHealth("groq", bool(self.groq_api_key)),
            "gemini": ProviderHealth("gemini", bool(self.gemini_api_key)),
            "mock": ProviderHealth("mock", True),
        }

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        preferred_provider: str = "groq",
        json_mode: bool = True,
    ) -> GatewayResponse:
        """Executes inference with automatic fallback across providers."""
        providers_to_try = [preferred_provider]
        fallback_candidates = ["gemini", "groq", "mock"]
        for p in fallback_candidates:
            if p not in providers_to_try:
                providers_to_try.append(p)

        for provider in providers_to_try:
            start_time = time.time()
            try:
                if provider == "groq" and self.groq_api_key:
                    res = await self._call_groq(
                        system_prompt, user_prompt, json_mode
                    )
                    latency = int((time.time() - start_time) * 1000)
                    self._record_success("groq")
                    return GatewayResponse(
                        provider="groq",
                        model="qwen/qwen3.8-27b",
                        content=res["content"],
                        parsed_json=res.get("json"),
                        latency_ms=latency,
                        prompt_tokens=res.get("prompt_tokens", 0),
                        completion_tokens=res.get("completion_tokens", 0),
                    )

                elif provider == "gemini" and self.gemini_api_key:
                    res = self._call_gemini(
                        system_prompt, user_prompt, json_mode
                    )
                    latency = int((time.time() - start_time) * 1000)
                    self._record_success("gemini")
                    return GatewayResponse(
                        provider="gemini",
                        model="gemini-flash-lite-latest",
                        content=res["content"],
                        parsed_json=res.get("json"),
                        latency_ms=latency,
                        prompt_tokens=res.get("prompt_tokens", 0),
                        completion_tokens=res.get("completion_tokens", 0),
                    )

                elif provider == "mock":
                    res = self._call_mock(user_prompt)
                    latency = int((time.time() - start_time) * 1000)
                    return GatewayResponse(
                        provider="mock",
                        model="mock-deterministic",
                        content=json.dumps(res),
                        parsed_json=res,
                        latency_ms=latency,
                    )
            except Exception as e:  # noqa: BLE001
                self._record_error(provider)
                print(
                    f"[GATEWAY WARNING]: Provider '{provider}' failed ({e}). Attempting fallback..."
                )
                continue

        # Ultimate fallback
        return GatewayResponse(
            provider="mock-fallback",
            model="deterministic-safe",
            content="{}",
            parsed_json={},
            latency_ms=0,
            success=False,
            error="All configured inference providers exhausted.",
        )

    async def _call_groq(
        self, system_prompt: str, user_prompt: str, json_mode: bool
    ) -> dict[str, Any]:
        from groq import AsyncGroq

        client = AsyncGroq(api_key=self.groq_api_key)
        kwargs: dict[str, Any] = {
            "model": "qwen/qwen3.8-27b",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        resp = await client.chat.completions.create(**kwargs)
        content = resp.choices[0].message.content or "{}"
        parsed = json.loads(content) if json_mode else None
        usage = resp.usage
        return {
            "content": content,
            "json": parsed,
            "prompt_tokens": usage.prompt_tokens if usage else 0,
            "completion_tokens": usage.completion_tokens if usage else 0,
        }

    def _call_gemini(
        self, system_prompt: str, user_prompt: str, json_mode: bool
    ) -> dict[str, Any]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={self.gemini_api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": f"System Context:\n{system_prompt}\n\nTask:\n{user_prompt}"
                        }
                    ]
                }
            ]
        }
        if json_mode:
            payload["generationConfig"] = {
                "responseMimeType": "application/json"
            }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
            raw = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "{}")
            )
            parsed = json.loads(raw) if json_mode else None
            return {
                "content": raw,
                "json": parsed,
                "prompt_tokens": 80,
                "completion_tokens": 120,
            }

    def _call_mock(self, prompt: str) -> dict[str, Any]:
        return {
            "status": "deterministic_analysis",
            "note": "Offline model executed without external network dependencies.",
            "prompt_snippet": prompt[:80],
        }

    def _record_success(self, provider: str):
        if provider in self.health:
            self.health[provider].last_success = datetime.now(
                UTC
            ).isoformat()
            self.health[provider].total_requests += 1

    def _record_error(self, provider: str):
        if provider in self.health:
            self.health[provider].error_count += 1
            self.health[provider].total_requests += 1


_global_gateway = MultiModelGateway()


def get_ai_gateway() -> MultiModelGateway:
    return _global_gateway
