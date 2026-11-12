import { NextRequest, NextResponse } from 'next/server';
import { requireFounderSession } from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await requireFounderSession(req);
  if (!gate.ok) return gate.response;

  try {
    const unmatchedOnly = req.nextUrl.searchParams.get('unmatched') === 'true';
    const leadId = req.nextUrl.searchParams.get('leadId');
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 50)));

    let query = gate.admin
      .from('email_messages')
      .select(
        'id, conversation_id, lead_id, zoho_message_id, thread_id, direction, from_address, to_addresses, subject, text_body, html_body, clean_snippet, delivery_status, reply_classification, is_unmatched, has_prompt_injection, security_flags, received_or_sent_at'
      )
      .order('received_or_sent_at', { ascending: false })
      .limit(limit);

    if (unmatchedOnly) {
      query = query.eq('is_unmatched', true);
    } else if (leadId) {
      query = query.eq('lead_id', leadId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, messages: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load email messages.' },
      { status: 500 }
    );
  }
}

