import { NextRequest, NextResponse } from 'next/server';
import { isEmailSyncEnabled } from '@/lib/integrations/zoho-store';
import { requireFounderSession } from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await requireFounderSession(req);
  if (!gate.ok) return gate.response;

  try {
    const [{ data: syncStates }, { count: unmatchedCount }] = await Promise.all([
      gate.admin
        .from('email_sync_state')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(5),
      gate.admin
        .from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('is_unmatched', true),
    ]);

    return NextResponse.json({
      success: true,
      emailSyncEnabled: isEmailSyncEnabled(),
      intervalSeconds: Math.max(30, Number(process.env.EMAIL_SYNC_INTERVAL_SECONDS || 60)),
      syncStates: syncStates || [],
      unmatchedInboundCount: unmatchedCount || 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Could not load sync status.' },
      { status: 500 }
    );
  }
}

