import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const [{ data: projects, error }, { data: leads }] = await Promise.all([
      admin
        .from('projects')
        .select('*, clients(*), project_milestones(*), invoices(*)')
        .order('created_at', { ascending: false }),
      admin
        .from('leads')
        .select('id, organisation_name, location, category, pipeline_stage, service_interest')
        .in('pipeline_stage', ['qualified', 'contacted', 'replied', 'proposal', 'won'])
        .order('score', { ascending: false })
        .limit(50),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      projects: projects || [],
      eligibleLeads: leads || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch projects';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Founder sign-in required.' }, { status: 401 });
    }

    const body = await req.json();
    const organisationName = String(body.organisation_name || '').trim();
    const primaryContactName = String(body.primary_contact_name || 'Decision Maker').trim();
    const primaryContactChannel = String(body.primary_contact_channel || '').trim();
    const serviceLine = String(body.service_line || 'Hostel Outpass Management System (HOMS)').trim();
    const approvedScope = String(
      body.approved_scope ||
        'Discovery, brand/domain setup, core module deployment, WhatsApp notification workflow, and team handover.'
    ).trim();
    const contractedValue = Math.max(0, Math.round(Number(body.contracted_value_inr) || 35000));
    const leadId = body.lead_id ? String(body.lead_id) : null;
    const issueAdvanceInvoice = body.issue_advance_invoice !== false;

    if (!organisationName || !primaryContactChannel) {
      return NextResponse.json(
        { error: 'Organisation name and primary contact (WhatsApp or email) are required.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Create Client
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .insert({
        lead_id: leadId,
        organisation_name: organisationName,
        primary_contact_name: primaryContactName,
        primary_contact_channel: primaryContactChannel,
        billing_email: body.billing_email ? String(body.billing_email).trim() : null,
        status: 'active',
      })
      .select()
      .single();

    if (clientErr || !client) {
      return NextResponse.json({ error: clientErr?.message || 'Failed to create client' }, { status: 500 });
    }

    // 2. Create Project
    const targetDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: project, error: projErr } = await admin
      .from('projects')
      .insert({
        client_id: client.id,
        name: `${organisationName} — ${serviceLine}`,
        service_line: serviceLine,
        status: 'requirements',
        target_date: targetDate,
        approved_scope: approvedScope,
        contracted_value_inr: contractedValue,
      })
      .select()
      .single();

    if (projErr || !project) {
      return NextResponse.json({ error: projErr?.message || 'Failed to create project' }, { status: 500 });
    }

    // 3. Seed real delivery milestones in DB
    const todayPlus = (days: number) =>
      new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: milestones } = await admin
      .from('project_milestones')
      .insert([
        {
          project_id: project.id,
          title: 'Kickoff, Requirements & Scope Lock',
          due_date: todayPlus(2),
          status: 'in_progress',
        },
        {
          project_id: project.id,
          title: 'Architecture, Design & Portal Configuration',
          due_date: todayPlus(5),
          status: 'pending',
        },
        {
          project_id: project.id,
          title: 'WhatsApp & Workflow Verification Testing',
          due_date: todayPlus(8),
          status: 'pending',
        },
        {
          project_id: project.id,
          title: 'Production Launch & Team Handover',
          due_date: todayPlus(10),
          status: 'pending',
        },
      ])
      .select();

    // 4. Optional initial 50% advance invoice
    let createdInvoice = null;
    if (issueAdvanceInvoice && contractedValue > 0) {
      const advanceInr = Math.round(contractedValue * 0.5);
      const invoiceNumber = `ZL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const { data: inv } = await admin
        .from('invoices')
        .insert({
          client_id: client.id,
          project_id: project.id,
          invoice_number: invoiceNumber,
          amount_inr: advanceInr,
          status: 'issued',
          due_date: todayPlus(3),
        })
        .select()
        .single();
      createdInvoice = inv || null;
    }

    // 5. Mark linked CRM lead as Won
    if (leadId) {
      await admin
        .from('leads')
        .update({
          pipeline_stage: 'won',
          next_action: `Onboarded client project (${serviceLine})`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);
    }

    await logAuditEvent({
      actorType: 'user',
      actorId: user.id,
      action: 'project.onboarded',
      objectType: 'projects',
      objectId: project.id,
      result: 'success',
      metadata: {
        client_id: client.id,
        organisation_name: organisationName,
        contracted_value_inr: contractedValue,
        lead_id: leadId,
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/projects');
    revalidatePath('/dashboard/revenue');
    revalidatePath('/dashboard/leads');

    return NextResponse.json({
      success: true,
      project: {
        ...project,
        clients: client,
        project_milestones: milestones || [],
        invoices: createdInvoice ? [createdInvoice] : [],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to onboard client';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const admin = createAdminClient();

    if (body.milestone_id && body.milestone_status) {
      const validStatuses = ['pending', 'in_progress', 'completed'];
      if (!validStatuses.includes(body.milestone_status)) {
        return NextResponse.json({ error: 'Invalid milestone status' }, { status: 400 });
      }
      const { data: milestone, error } = await admin
        .from('project_milestones')
        .update({ status: body.milestone_status })
        .eq('id', String(body.milestone_id))
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      revalidatePath('/dashboard/projects');
      return NextResponse.json({ success: true, milestone });
    }

    if (body.project_id && body.status) {
      const validStages = ['requirements', 'planning', 'development', 'client_review', 'completed', 'on_hold'];
      if (!validStages.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid project stage' }, { status: 400 });
      }
      const { data: project, error } = await admin
        .from('projects')
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq('id', String(body.project_id))
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await logAuditEvent({
        actorType: 'user',
        actorId: user.id,
        action: 'project.stage_updated',
        objectType: 'projects',
        objectId: String(body.project_id),
        result: 'success',
        metadata: { status: body.status },
      });

      revalidatePath('/dashboard/projects');
      return NextResponse.json({ success: true, project });
    }

    return NextResponse.json({ error: 'Missing milestone or project update payload' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update project';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

