import { NextResponse } from 'next/server';
import { ASCENSION_DEPARTMENTS, fetchAscensionSnapshot } from '@/lib/integrations/ascension-client';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SETTINGS_ID = 'zenlyft-global-settings';

export async function GET() {
  const snapshot = await fetchAscensionSnapshot();
  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let dbEmergencyStop = false;
  if (hasSupabase) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('system_settings')
        .select('emergency_stop_active')
        .eq('id', SETTINGS_ID)
        .maybeSingle();
      dbEmergencyStop = Boolean((data as { emergency_stop_active?: boolean } | null)?.emergency_stop_active);
    } catch {
      dbEmergencyStop = false;
    }
  }

  const renderConnected = snapshot.connectionStatus === 'CONNECTED';
  const metrics = (snapshot.metrics || {}) as Record<string, unknown>;
  const emergencyStop = Boolean(metrics.emergency_stop ?? dbEmergencyStop);
  const totalRoles = ASCENSION_DEPARTMENTS.reduce((sum, d) => sum + d.targetHeadcount, 0);
  const activeSlots = ASCENSION_DEPARTMENTS.reduce((sum, d) => sum + d.initialActive, 0);

  return NextResponse.json({
    ...snapshot,
    cloud_connected: renderConnected || hasSupabase,
    render_connected: renderConnected,
    total_agent_roles: totalRoles,
    active_agent_slots: activeSlots,
    emergency_stop: emergencyStop,
    monthly_budget_cents: 0,
    allow_paid_fallback: false,
    orchestrator: renderConnected
      ? 'LangGraph + CrewAI (Render Cloud)'
      : 'Built-in Global Discovery + Supabase',
    memory_protocol: 'Orchester Adapter (Provenance + Poisoning Guard)',
    departments: ASCENSION_DEPARTMENTS.map((d) => ({
      key: d.id,
      name: d.name,
      role_count: d.targetHeadcount,
      starter_active_count: d.initialActive,
      manager_id: d.managerAgentId,
    })),
    architecture: {
      orchestrator: 'LangGraph StateGraph + PostgresSaver',
      workforce: 'CrewAI Specialist Teams (BaseLLM -> ZenLyft Gateway)',
      memory_protocol: 'Orchester Adapter (Provenance + Poisoning Guard)',
      automation: 'n8n HMAC Webhooks + Cloudflare Built-in Discovery',
      departments: ASCENSION_DEPARTMENTS,
      total_roles: totalRoles,
    },
  });
}
