import { NextRequest, NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit';
import { requireFounderSession } from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = await requireFounderSession(req, { requireFounderRole: true });
  if (!gate.ok) return gate.response;

  try {
    const now = new Date().toISOString();
    const { data: conn } = await gate.admin
      .from('zoho_connections')
      .select('id')
      .eq('connection_key', 'primary')
      .maybeSingle();

    if (conn?.id) {
      await gate.admin
        .from('zoho_connections')
        .update({
          status: 'DISCONNECTED',
          encrypted_refresh_token: null,
          encrypted_access_token: null,
          access_token_expires_at: null,
          selected_account_id: null,
          selected_account_email: null,
          selected_sender_email: null,
          selected_sender_name: null,
          last_error: null,
          updated_at: now,
        })
        .eq('id', conn.id);

      await gate.admin.from('zoho_accounts').delete().eq('connection_id', conn.id);
    }

    await logAuditEvent({
      actorType: 'user',
      actorId: gate.userId,
      action: 'zoho.disconnected',
      objectType: 'zoho_connections',
      objectId: conn?.id || 'primary',
      result: 'success',
    });

    return NextResponse.json({ success: true, status: 'DISCONNECTED' });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to disconnect Zoho.' },
      { status: 500 }
    );
  }
}

