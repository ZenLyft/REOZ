import { NextRequest, NextResponse } from 'next/server';
import { requireFounderSession } from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: { leadId: string } }
) {
  const gate = await requireFounderSession(req);
  if (!gate.ok) return gate.response;

  const { leadId } = context.params;
  if (!leadId) {
    return NextResponse.json({ success: false, error: 'leadId is required.' }, { status: 400 });
  }

  try {
    const [
      { data: emailMessages },
      { data: emailConversations },
      { data: emailApprovals },
      { data: deliveryLogs },
      { data: whatsappMessages },
      { data: unifiedConversations },
    ] = await Promise.all([
      gate.admin
        .from('email_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('received_or_sent_at', { ascending: true }),
      gate.admin
        .from('email_conversations')
        .select('*')
        .eq('lead_id', leadId)
        .order('last_message_at', { ascending: false }),
      gate.admin
        .from('email_approvals')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      gate.admin
        .from('email_delivery_logs')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      gate.admin
        .from('whatsapp_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true }),
      gate.admin
        .from('conversations')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true }),
    ]);

    return NextResponse.json({
      success: true,
      leadId,
      emailMessages: emailMessages || [],
      emailConversations: emailConversations || [],
      emailApprovals: emailApprovals || [],
      deliveryLogs: deliveryLogs || [],
      whatsappMessages: whatsappMessages || [],
      unifiedConversations: unifiedConversations || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch lead conversations.' },
      { status: 500 }
    );
  }
}

