import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSessionUserProfile, enforcePermission } from '@/lib/security/rbac';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);
    enforcePermission(profile, 'leads.assign');

    const body = await req.json();
    const { leadIds, assignedTo, notes } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ success: false, error: 'leadIds array is required.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify assignedTo member exists if not unassigning
    let targetProfile: any = null;
    if (assignedTo) {
      const { data: member } = await admin
        .from('profiles')
        .select('id, name, email, role, status')
        .eq('id', assignedTo)
        .maybeSingle();

      if (!member) {
        return NextResponse.json({ success: false, error: 'Target team member not found.' }, { status: 404 });
      }
      if (member.status === 'suspended') {
        return NextResponse.json({ success: false, error: 'Cannot assign leads to a suspended member.' }, { status: 400 });
      }
      targetProfile = member;
    }

    const now = new Date().toISOString();

    for (const leadId of leadIds) {
      const { data: currentLead } = await admin
        .from('leads')
        .select('owner_id')
        .eq('id', leadId)
        .maybeSingle();

      // Update lead owner_id
      await admin
        .from('leads')
        .update({ owner_id: assignedTo || null, updated_at: now })
        .eq('id', leadId);

      // Log lead assignment history
      await admin.from('lead_assignments').insert({
        lead_id: leadId,
        assigned_to: assignedTo || null,
        assigned_by: profile?.id,
        previous_assignee: currentLead?.owner_id || null,
        notes: notes || null,
        assigned_at: now,
      });
    }

    await logAuditEvent({
      actorType: 'user',
      actorId: profile?.email || 'admin',
      action: assignedTo ? 'lead.assigned' : 'lead.unassigned',
      objectType: 'leads',
      objectId: leadIds.join(','),
      result: 'success',
      metadata: {
        leadCount: leadIds.length,
        assignedToEmail: targetProfile?.email || null,
        assignedByName: profile?.name,
      },
    });

    return NextResponse.json({
      success: true,
      assignedCount: leadIds.length,
      assignedTo: targetProfile?.name || 'Unassigned',
    });
  } catch (err: any) {
    const status = err.status || (err.code === 'FORBIDDEN' ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

