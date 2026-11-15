import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSessionUserProfile, hasPermission } from '@/lib/security/rbac';
import { buildProposalForProduct } from '@/lib/crm/proposals';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    let query = admin
      .from('proposals')
      .select('*, leads(organisation_name, category, location, revenue_division)')
      .order('created_at', { ascending: false });

    if (profile.role !== 'SUPER_ADMIN') {
      query = query.or(`created_by.eq.${profile.id}`);
    }

    const { data: proposals, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, proposals: proposals || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { leadId, serviceLine, customQuoteInr, customHours } = body;

    if (!leadId || !serviceLine) {
      return NextResponse.json(
        { success: false, error: 'leadId and serviceLine are required.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ success: false, error: 'Lead not found.' }, { status: 404 });
    }

    const proposalData = buildProposalForProduct({
      leadId,
      division: lead.revenue_division || 'division_a_digital',
      serviceLine,
      clientName: lead.organisation_name,
      customQuoteInr,
      customHours,
    });

    const isSuperAdmin = profile.role === 'SUPER_ADMIN';
    // If created by founder, auto-approve; otherwise requires founder review
    const initialStatus = isSuperAdmin ? 'approved' : 'pending_approval';

    const { data: proposal, error: propErr } = await admin
      .from('proposals')
      .insert({
        lead_id: leadId,
        division: proposalData.division,
        product_name: proposalData.productName,
        scope: proposalData.scope,
        deliverables: proposalData.deliverables,
        exclusions: proposalData.exclusions,
        timeline_days: proposalData.timelineDays,
        quote_inr: proposalData.quoteInr,
        delivery_cost_inr: proposalData.deliveryCostInr,
        gross_margin_percent: proposalData.grossMarginPercent,
        payment_milestones: proposalData.paymentMilestones,
        status: initialStatus,
        founder_approved_at: isSuperAdmin ? new Date().toISOString() : null,
        approved_by: isSuperAdmin ? profile.id : null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (propErr) {
      return NextResponse.json({ success: false, error: propErr.message }, { status: 500 });
    }

    // Update lead record with proposal and estimated value
    await admin
      .from('leads')
      .update({
        proposal_id: proposal.id,
        estimated_value_inr: proposalData.quoteInr,
        delivery_cost_inr: proposalData.deliveryCostInr,
        gross_margin_percent: proposalData.grossMarginPercent,
        pipeline_stage: 'proposal',
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    await logAuditEvent({
      actorType: 'user',
      actorId: profile.email,
      action: 'crm.proposal.generated',
      objectType: 'proposals',
      objectId: proposal.id,
      result: 'success',
      metadata: {
        leadId,
        quoteInr: proposalData.quoteInr,
        grossMarginPercent: proposalData.grossMarginPercent,
        status: initialStatus,
      },
    });

    return NextResponse.json({ success: true, proposal });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
