import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSessionUserProfile, enforcePermission, hasPermission } from '@/lib/security/rbac';
import { generateMeetingBrief } from '@/lib/crm/meetings';
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
      .from('meetings')
      .select('*, leads(organisation_name, category, location, revenue_division, pipeline_stage)')
      .order('scheduled_at', { ascending: true });

    // Non-superadmin sees only assigned meetings or if created by them
    if (profile.role !== 'SUPER_ADMIN') {
      query = query.or(`created_by.eq.${profile.id}`);
    }

    const { data: meetings, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, meetings: meetings || [] });
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
    const { leadId, scheduledAt, meetingLink } = body;

    if (!leadId || !scheduledAt) {
      return NextResponse.json(
        { success: false, error: 'leadId and scheduledAt are mandatory.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Fetch lead details
    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ success: false, error: 'Lead not found.' }, { status: 404 });
    }

    // 2. Generate meeting brief and discovery questions
    const brief = generateMeetingBrief(lead);

    // 3. Create meeting record
    const { data: meeting, error: meetError } = await admin
      .from('meetings')
      .insert({
        lead_id: leadId,
        scheduled_at: scheduledAt,
        meeting_link: meetingLink || null,
        brief,
        discovery_questions: brief.discoveryQuestions,
        created_by: profile.id,
        status: 'scheduled',
      })
      .select()
      .single();

    if (meetError) {
      return NextResponse.json({ success: false, error: meetError.message }, { status: 500 });
    }

    // 4. Update lead stage to meeting and record meeting timestamp
    await admin
      .from('leads')
      .update({
        pipeline_stage: 'meeting',
        meeting_scheduled_at: scheduledAt,
        next_action: `Meeting scheduled: ${scheduledAt}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    await logAuditEvent({
      actorType: 'user',
      actorId: profile.email,
      action: 'crm.meeting.scheduled',
      objectType: 'meetings',
      objectId: meeting.id,
      result: 'success',
      metadata: {
        leadId,
        organisationName: lead.organisation_name,
        scheduledAt,
      },
    });

    return NextResponse.json({ success: true, meeting });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

