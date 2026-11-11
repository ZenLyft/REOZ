import { NextResponse } from 'next/server';
import { ASCENSION_DEPARTMENTS, fetchAscensionSnapshot } from '@/lib/integrations/ascension-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await fetchAscensionSnapshot();
  return NextResponse.json({
    ...snapshot,
    architecture: {
      orchestrator: 'LangGraph StateGraph + PostgresSaver',
      workforce: 'CrewAI Specialist Teams (BaseLLM -> ZenLyft Gateway)',
      memory_protocol: 'Orchester Adapter (Provenance + Poisoning Guard)',
      automation: 'n8n HMAC Webhooks + GitHub Actions 24/7 Keep-Alive',
      departments: ASCENSION_DEPARTMENTS,
      total_roles: ASCENSION_DEPARTMENTS.reduce((sum, d) => sum + d.targetHeadcount, 0),
    },
  });
}

