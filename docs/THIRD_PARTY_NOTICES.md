# Third-Party Licenses & Notices — ZenLyft Ascension

ZenLyft Ascension integrates upstream open-source frameworks via isolated adapters without modifying upstream source trees unnecessarily. All upstream copyright notices and license obligations are preserved below.

## 1. CrewAI (`crewAIInc/crewAI`)
- **License:** MIT License
- **Copyright:** Copyright (c) 2025 crewAI, Inc.
- **Usage Scope:** Specialist role/team abstraction (`Agent`, `Task`, `Crew`, `BaseLLM`, `BaseTool`).

## 2. LangGraph (`langchain-ai/langgraph`, `langgraph-checkpoint-*`)
- **License:** MIT License
- **Copyright:** Copyright (c) 2024 LangChain, Inc.
- **Usage Scope:** Stateful workflow control plane, human-in-the-loop `interrupt()` gates, and PostgreSQL/SQLite persistence.

## 3. Orchester (`lucasmailland/orchester`)
- **License:** Apache License, Version 2.0 (`LICENSE` and `NOTICE`)
- **Notice:** Copyright 2026 Lucas Mailland and Orchester contributors (`https://github.com/lucasmailland/orchester`).
- **Usage Scope:** Protocol/memory adapter patterns (`/api/v1/*` contract, Brain provenance + decay + context-poisoning guards). Note upstream runtime dependencies (`sharp` LGPL-3.0 dynamic link, `jszip` dual MIT/GPL-3.0 MIT choice) do not introduce AGPL/SSPL obligations.

## 4. n8n (`n8n-io/n8n`)
- **License:** Sustainable Use License (excluding `.ee.*` enterprise files)
- **Usage Scope:** Permitted self-hosted internal scheduling, webhook delivery, and founder Telegram/Email notifications for ZenLyft operations only (not resold as a standalone hosted workflow SaaS).

