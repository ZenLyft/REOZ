"""
Proposal and Outreach Draft Generator Worker
Uses ONLY the Research Brief and Approved Pricing Catalogue entries.
Never invents prices or promises unapproved discounts.
"""

from typing import Dict, Any, Optional
from workers.common.model_adapter import ModelAdapter, get_model_adapter


DRAFT_SYSTEM_PROMPT = """You are the ZenLyft Revenue Engine Outreach & Proposal Drafter.
Your role is to write a concise, highly respectful, personalized outreach draft for founder Niresh Senthoor.

RULES:
1. ONLY reference approved catalog packages (Starter Business Showcase at ₹9,999, Growth Booking Suite at ₹17,999, or HOMS Pilot at ₹35,000). Never invent prices.
2. Focus on observed facts from research (e.g. mobile usability, WhatsApp booking, online reach).
3. Keep the tone professional, helpful, and concise (under 120 words for WhatsApp / under 180 words for Email).
4. No deceptive claims. Never assume interest without evidence.
5. End with an open invitation to share a free demo or review, with a clear opt-out ("If you prefer not to receive updates, please let us know and we will not contact you again").
"""


def generate_draft_prompts(
    lead: Dict[str, Any],
    channel: str,
    target_language: str = "English"
) -> str:
    return f"""
TARGET LEAD:
- Name: {lead.get('organisation_name')}
- Category: {lead.get('category')}
- Location: {lead.get('location')}
- Website: {lead.get('website_url') or 'None found in checked sources'}
- Channel: {channel} (e.g. WhatsApp or Email)
- Language: {target_language}

Generate a clear draft message.
"""


async def draft_outreach(
    lead: Dict[str, Any],
    channel: str = "whatsapp",
    target_language: str = "English",
    adapter: Optional[ModelAdapter] = None
) -> str:
    model = adapter or get_model_adapter()
    prompt = generate_draft_prompts(lead, channel, target_language)

    # For drafting we request a direct message structure
    response = await model.generate_json(
        DRAFT_SYSTEM_PROMPT,
        prompt + "\nReturn JSON with single key: {\"draft_text\": \"...\"}"
    )

    if response.parsed_json and "draft_text" in response.parsed_json:
        return response.parsed_json["draft_text"]

    return (
        f"Hello from ZenLyft! We noticed {lead.get('organisation_name')} in {lead.get('location')} "
        f"and reviewed your digital presence. We specialize in fast mobile websites and automated booking. "
        f"Would you be open to seeing a 2-minute concept for your business? "
        f"(Let us know if you prefer not to be contacted.)"
    )

