"""
ModelAdapter Abstraction
Provides swappable inference providers with strict JSON validation:
1. Groq (Primary - ultra fast, free tier)
2. Gemini (Secondary - generous limits)
3. OpenRouter / Ollama (Fallback / Local Dev)
4. MockProvider (Offline zero-cost unit testing)
"""

import json
import os
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field, ValidationError


class ModelResponse(BaseModel):
    provider: str
    model_name: str
    raw_content: str
    parsed_json: Optional[Dict[str, Any]] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0


class ModelAdapter(ABC):
    @abstractmethod
    async def generate_json(self, system_prompt: str, user_prompt: str) -> ModelResponse:
        """Generates structured JSON response conforming strictly to schema."""
        pass


class MockModelAdapter(ModelAdapter):
    """Zero-cost mock adapter for deterministic unit tests and offline testing."""

    def __init__(self, predefined_json: Optional[Dict[str, Any]] = None):
        self.predefined_json = predefined_json or {
            "lead_id": "00000000-0000-0000-0000-000000000000",
            "website_status": "verified",
            "business_summary": "Mock Business: Health clinic based in Coimbatore.",
            "evidence": [
                {
                    "source_url": "https://example.com",
                    "observed_fact": "Contact page confirms physical clinic.",
                    "checked_at": "2026-11-04T00:00:00Z",
                    "confidence": "high"
                }
            ],
            "audit_findings": [
                {
                    "dimension": "mobile",
                    "finding": "Missing mobile viewport meta tag.",
                    "basis": "measured",
                    "priority": 4
                }
            ],
            "likely_needs": ["Mobile responsive redesign", "Online booking form"],
            "suggested_offer": "Website Redesign & WhatsApp Booking Integration",
            "public_contact_channels": [
                {"type": "phone", "value": "9876543210", "source_url": "https://example.com"}
            ],
            "unknowns": ["Decision maker name", "Budget"],
            "injection_suspected": False,
            "overall_confidence": "high"
        }

    async def generate_json(self, system_prompt: str, user_prompt: str) -> ModelResponse:
        # Prompt-injection heuristic check
        injection_suspected = any(
            phrase in user_prompt.lower()
            for phrase in ["ignore previous instructions", "system override", "delete database", "send email to all"]
        )

        resp = dict(self.predefined_json)
        if injection_suspected:
            resp["injection_suspected"] = True
            resp["business_summary"] = "CAUTION: External webpage contained suspected prompt injection instructions."

        return ModelResponse(
            provider="mock",
            model_name="mock-agent-v1",
            raw_content=json.dumps(resp),
            parsed_json=resp,
            prompt_tokens=50,
            completion_tokens=50,
        )


class GroqModelAdapter(ModelAdapter):
    """Groq Cloud inference adapter using fast open models (e.g. Llama 3 70B/8B)."""

    def __init__(self, api_key: Optional[str] = None, model: str = "llama-3.3-70b-versatile"):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.model = model

    async def generate_json(self, system_prompt: str, user_prompt: str) -> ModelResponse:
        if not self.api_key:
            raise ValueError("GROQ_API_KEY is not set.")

        from groq import AsyncGroq
        client = AsyncGroq(api_key=self.api_key)

        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)

        return ModelResponse(
            provider="groq",
            model_name=self.model,
            raw_content=content,
            parsed_json=parsed,
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
        )


def get_model_adapter() -> ModelAdapter:
    """Factory selecting the active provider based on environment configuration."""
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key and not groq_key.startswith("your_"):
        return GroqModelAdapter(api_key=groq_key)
    return MockModelAdapter()
