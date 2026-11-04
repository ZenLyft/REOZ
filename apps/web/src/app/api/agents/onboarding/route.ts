import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    const {
      lead_id,
      organisation_name,
      primary_contact_name,
      primary_contact_channel,
      service_line,
      contracted_value_inr,
      approved_scope
    } = await req.json();

    if (!lead_id || !organisation_name) {
      return NextResponse.json({ success: false, error: 'Lead ID and organisation name are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Create or link Client record
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .insert({
        lead_id,
        organisation_name,
        primary_contact_name: primary_contact_name || 'Founder / Business Lead',
        primary_contact_channel: primary_contact_channel || 'WhatsApp',
        status: 'active'
      })
      .select()
      .single();

    if (clientErr || !client) {
      return NextResponse.json({ success: false, error: clientErr?.message || 'Failed to create client' }, { status: 500 });
    }

    // 2. Create Active Project workspace
    const projectVal = contracted_value_inr || 9999;
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .insert({
        client_id: client.id,
        name: `${organisation_name} - ${service_line || 'Website & Automation'}`,
        service_line: service_line || 'Website Development & Automation',
        status: 'requirements',
        approved_scope: approved_scope || 'Discovery, Sitemap, Responsive Next.js Build, WhatsApp Booking Integration',
        contracted_value_inr: projectVal
      })
      .select()
      .single();

    if (projErr || !project) {
      return NextResponse.json({ success: false, error: projErr?.message || 'Failed to create project' }, { status: 500 });
    }

    // 3. Generate standard project milestones automatically
    const milestones = [
      { project_id: project.id, title: 'Requirements & Content Gathering', status: 'completed' },
      { project_id: project.id, title: 'Design Layout & Sitemap Approval', status: 'in_progress' },
      { project_id: project.id, title: 'Development & Booking Integration', status: 'pending' },
      { project_id: project.id, title: 'Staging Review & Production Handover', status: 'pending' }
    ];
    await supabase.from('project_milestones').insert(milestones);

    // 4. Generate initial Invoice record
    const invoiceNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await supabase.from('invoices').insert({
      client_id: client.id,
      project_id: project.id,
      invoice_number: invoiceNum,
      amount_inr: projectVal,
      status: 'issued',
      due_date: dueDate
    });

    // 5. Update lead pipeline stage to 'won'
    await supabase.from('leads').update({
      pipeline_stage: 'won',
      updated_at: new Date().toISOString()
    }).eq('id', lead_id);

    // 6. Log audit record
    await supabase.from('audit_log').insert({
      actor_type: 'agent',
      actor_id: 'agent-client-onboarding',
      action: 'deal.converted_to_client',
      object_type: 'clients',
      object_id: client.id,
      result: 'success',
      metadata_without_secrets: {
        lead_id,
        client_id: client.id,
        project_id: project.id,
        invoice_number: invoiceNum,
        contracted_value_inr: projectVal
      }
    });

    return NextResponse.json({
      success: true,
      client,
      project,
      invoice_number: invoiceNum
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

