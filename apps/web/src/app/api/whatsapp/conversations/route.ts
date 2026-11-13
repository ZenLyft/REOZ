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

    // 3. Fetch real pending first-contact outreach from approvals
    const { data: pendingApprovals } = await supabase
      .from('approvals')
      .select('id, target_id, recipient, action_type, status, evidence')
      .eq('status', 'pending')
      .in('action_type', ['send_whatsapp', 'whatsapp_outreach']);

    const approvalDraftIds = (pendingApprovals || []).map((a) => a.target_id).filter(Boolean);
    const { data: drafts } = await supabase
      .from('outreach_drafts')
      .select('id, lead_id, draft, leads(id, organisation_name, location, category, score)')
      .in('id', approvalDraftIds);

    const draftMap = new Map((drafts || []).map((d) => [d.id, d]));

    const firstContactItems = (pendingApprovals || []).map((a) => {
      const draft = draftMap.get(a.target_id);
      const evidenceDossier = Array.isArray(a.evidence)
        ? (a.evidence[0] as any)?.dossier
        : (a.evidence as any)?.dossier;

      const profile = evidenceDossier?.research_profile;
      const lead = draft?.leads || (profile ? {
        id: draft?.lead_id || (a.evidence as any)?.[0]?.canonical_payload?.lead_id || '',
        organisation_name: profile.company_name,
        location: profile.location,
        category: profile.sub_industry,
        score: evidenceDossier.lead_score || 80,
      } : null);

      const notes =
        draft?.draft ||
        (Array.isArray(a.evidence) ? (a.evidence[0] as any)?.canonical_payload?.message_content : null) ||
        (a.evidence as any)?.draft_content ||
        'Tailored WhatsApp Outreach';

      return {
        id: a.id,
        lead_id: draft?.lead_id || (Array.isArray(a.evidence) ? (a.evidence[0] as any)?.canonical_payload?.lead_id : '') || '',
        stage: '1st_contact',
        status: 'awaiting_approval',
        scheduled_for: new Date().toISOString(),
        notes,
        leads: lead
          ? {
              ...lead,
              public_phone: a.recipient || null,
            }
          : null,
      };
    });

    // 4. Fetch follow-up drafts awaiting approval
    const { data: followupsRaw } = await supabase
      .from('whatsapp_followups')
      .select('id, lead_id, stage, status, scheduled_for, notes, created_at, leads(id, organisation_name, location, category, score)')
      .order('created_at', { ascending: false });

    const followUpLeadIds = (followupsRaw || []).map((f) => f.lead_id).filter(Boolean);
    const { data: channels } = await supabase
      .from('contact_channels')
      .select('lead_id, public_value')
      .eq('channel_type', 'phone')
      .in('lead_id', followUpLeadIds);

    const phoneMap = new Map((channels || []).map((c) => [c.lead_id, c.public_value]));

    const followupItems = (followupsRaw || []).map((f) => ({
      ...f,
      leads: f.leads
        ? {
            ...f.leads,
            public_phone: phoneMap.get(f.lead_id) || null,
          }
        : null,
    }));

    // Merge first-contact items + follow-ups into unified queue
    const allQueueItems = [...firstContactItems, ...followupItems];

    // 5. Calculate real metrics
    const totalInbound = messages?.filter((m) => m.direction === 'inbound').length || 0;
    const totalOutbound = messages?.filter((m) => m.direction === 'outbound').length || 0;
    const awaitingApproval = allQueueItems.filter((f) => f.status === 'awaiting_approval' || f.status === 'pending').length;
    const deliveredCount =
      messages?.filter((m) => m.status === 'delivered' || m.status === 'read' || m.status === 'submitted').length || 0;

    const { data: optOutLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('contact_restriction', 'opt_out');

    return NextResponse.json({
      success: true,
      session: session || null,
      messages: messages || [],
      followups: allQueueItems,
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

