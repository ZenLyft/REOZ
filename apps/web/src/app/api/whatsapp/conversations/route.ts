import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();

    // 1. Fetch real session
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('id', 'zenlyft-wa-01')
      .maybeSingle();

    // 2. Fetch real messages
    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .order('created_at', { ascending: true });

    // 3. Fetch real follow-up drafts awaiting approval
    const { data: followups } = await supabase
      .from('whatsapp_followups')
      .select('*, leads(organisation_name, location, category, score)')
      .order('created_at', { ascending: false });

    // 4. Calculate real metrics
    const totalInbound = messages?.filter((m) => m.direction === 'inbound').length || 0;
    const totalOutbound = messages?.filter((m) => m.direction === 'outbound').length || 0;
    const awaitingApproval = followups?.filter((f) => f.status === 'awaiting_approval').length || 0;
    const deliveredCount =
      messages?.filter((m) => m.status === 'delivered' || m.status === 'read').length || 0;

    const { data: optOutLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('contact_restriction', 'opt_out');

    return NextResponse.json({
      success: true,
      session: session || null,
      messages: messages || [],
      followups: followups || [],
      stats: {
        totalInbound,
        totalOutbound,
        awaitingApproval,
        deliveredCount,
        optOutCount: optOutLeads?.length || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

