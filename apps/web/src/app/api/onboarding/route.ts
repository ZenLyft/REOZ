import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSessionUserProfile, hasPermission } from '@/lib/security/rbac';
import { getOnboardingChecklistForService, OnboardingChecklistItem } from '@/lib/crm/onboarding';
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
      .from('onboarding_projects')
      .select('*, leads(organisation_name, category, location, revenue_division), profiles(name, email, role)')
      .order('created_at', { ascending: false });

    // Non-superadmin developers/marketing see projects where they are implementation owner or team
    if (profile.role === 'DEVELOPER') {
      query = query.eq('implementation_owner_id', profile.id);
    }

    const { data: projects, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, projects: projects || [] });
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

    // Only founder or superadmin can initiate onboarding from converted paid contract
    if (profile.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Only founder can authorize customer onboarding.' }, { status: 403 });
    }

    const body = await req.json();
    const { leadId, serviceLine, implementationOwnerId, contractedValueInr } = body;

    if (!leadId || !serviceLine) {
      return NextResponse.json({ success: false, error: 'leadId and serviceLine are required.' }, { status: 400 });
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

    const checklist = getOnboardingChecklistForService(serviceLine);
    const now = new Date().toISOString();

    const { data: onboarding, error: onbErr } = await admin
      .from('onboarding_projects')
      .insert({
        lead_id: leadId,
        service_line: serviceLine,
        project_name: `${lead.organisation_name} — ${serviceLine}`,
        contracted_value_inr: contractedValueInr || lead.approved_quote_inr || lead.estimated_value_inr || 0,
        implementation_owner_id: implementationOwnerId || profile.id,
        checklist,
        status: 'pending_intake',
      })
      .select()
      .single();

    if (onbErr) {
      return NextResponse.json({ success: false, error: onbErr.message }, { status: 500 });
    }

    // Transition lead to onboarding stage
    await admin
      .from('leads')
      .update({
        pipeline_stage: 'onboarding',
        payment_verified_at: now,
        next_action: `Customer onboarded: Deliver ${serviceLine} checklist`,
        updated_at: now,
      })
      .eq('id', leadId);

    await logAuditEvent({
      actorType: 'user',
      actorId: profile.email,
      action: 'crm.onboarding.initiated',
      objectType: 'onboarding_projects',
      objectId: onboarding.id,
      result: 'success',
      metadata: {
        leadId,
        serviceLine,
        contractedValueInr,
      },
    });

    return NextResponse.json({ success: true, onboarding });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { onboardingId, checklistItemId, completed } = body;

    if (!onboardingId || !checklistItemId) {
      return NextResponse.json({ success: false, error: 'onboardingId and checklistItemId are required.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: project, error: projErr } = await admin
      .from('onboarding_projects')
      .select('*')
      .eq('id', onboardingId)
      .single();

    if (projErr || !project) {
      return NextResponse.json({ success: false, error: 'Onboarding project not found.' }, { status: 404 });
    }

    const checklist: OnboardingChecklistItem[] = Array.isArray(project.checklist) ? project.checklist : [];
    const updatedChecklist = checklist.map((item) =>
      item.id === checklistItemId
        ? {
            ...item,
            completed: Boolean(completed),
            completedAt: completed ? new Date().toISOString() : null,
          }
        : item
    );

    const allDone = updatedChecklist.every((i) => i.completed);
    const newStatus = allDone ? 'completed' : 'in_progress';
    const now = new Date().toISOString();

    await admin
      .from('onboarding_projects')
      .update({
        checklist: updatedChecklist,
        status: newStatus,
        delivery_confirmed_at: allDone ? now : null,
        updated_at: now,
      })
      .eq('id', onboardingId);

    // If all checklist items are completed, advance lead stage to active_project / completed
    if (allDone && project.lead_id) {
      await admin
        .from('leads')
        .update({
          pipeline_stage: 'active_project',
          updated_at: now,
        })
        .eq('id', project.lead_id);
    }

    return NextResponse.json({ success: true, status: newStatus, checklist: updatedChecklist });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
