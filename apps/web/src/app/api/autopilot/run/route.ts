import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  getAutopilotSettings,
  runAutonomousRevenueCycle,
} from '@/lib/integrations/autonomous-engine';

export const dynamic = 'force-dynamic';

function isAuthorizedCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const expected = (
    process.env.AUTOPILOT_SECRET ||
    process.env.CRON_SECRET ||
    process.env.ASCENSION_API_SECRET ||
    ''
  ).trim();
  return Boolean(expected && bearer && bearer === expected);
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await getAutopilotSettings();
    const admin = createAdminClient();

    const [
      { data: recentRuns },
      { count: firstColdSentCount },
      { count: pendingApprovalsCount },
      { count: totalLeadsCount },
      { data: openWaSession },
    ] = await Promise.all([
      admin
        .from('agent_executions')
        .select('id, agent_name, command, status, result_summary, data_payload, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
      admin
        .from('approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent'),
      admin
        .from('approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      admin.from('leads').select('id', { count: 'exact', head: true }),
      admin
        .from('whatsapp_sessions')
        .select('id, status, phone, last_active_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      success: true,
      settings,
      metrics: {
        total_leads: totalLeadsCount ?? 0,
        first_cold_sent_count: firstColdSentCount ?? 0,
        pending_founder_permissions_count: pendingApprovalsCount ?? 0,
      },
      whatsapp_session: openWaSession || { status: 'disconnected', phone: '+91 80159 29139' },
      recent_runs: recentRuns || [],
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to load autopilot status' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const cronAllowed = isAuthorizedCron(req);
  let founderAllowed = false;

  if (!cronAllowed) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    founderAllowed = Boolean(user);
  }

  if (!cronAllowed && !founderAllowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const result = await runAutonomousRevenueCycle({
    regionOrCity: body?.city || body?.region ? String(body.city || body.region) : undefined,
    limit: body?.limit ? Number(body.limit) : 6,
    source: cronAllowed ? 'github_cron_24x7' : String(body?.source || 'pwa_auto_sync'),
  });

  return NextResponse.json({
    success: result.status === 'completed',
    ...result,
  });
}

