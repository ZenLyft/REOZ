'use server';

import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import {
  canTransitionStage,
  checkDuplicateLead,
  extractDomain,
  LeadCreateInput,
  LeadCreateSchema,
  normalizeOrgName,
  normalizePhone,
  ExistingLeadRef,
} from '@/lib/crm/leads';
import { PipelineStage } from '@/lib/types/database';
import { revalidatePath } from 'next/cache';

export async function createLeadAction(input: LeadCreateInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = LeadCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const data = parsed.data;
  const normalisedName = normalizeOrgName(data.organisation_name);
  const domain = extractDomain(data.website_url);
  const cleanPhone = normalizePhone(data.public_phone);

  // 1. Deduplication check against DB
  const { data: existingLeads } = await supabase
    .from('leads')
    .select('id, organisation_name, normalised_name, website_domain')
    .is('archived_at', null);

  const dedupeRefs: ExistingLeadRef[] = (existingLeads || []).map((l) => ({
    id: l.id,
    organisation_name: l.organisation_name,
    normalised_name: l.normalised_name,
    website_domain: l.website_domain,
    phone: null,
  }));

  const dupResult = checkDuplicateLead(
    { name: data.organisation_name, website_url: data.website_url, phone: data.public_phone },
    dedupeRefs
  );

  if (dupResult.type !== 'none') {
    return {
      success: false,
      error: `Duplicate detected: Matches existing lead "${dupResult.matchedLead.organisation_name}" by ${dupResult.type}.`,
    };
  }

  // 2. Insert Lead
  const { data: newLead, error: insertError } = await supabase
    .from('leads')
    .insert({
      organisation_name: data.organisation_name,
      normalised_name: normalisedName,
      organisation_type: data.organisation_type,
      category: data.category,
      location: data.location,
      website_url: data.website_url || null,
      website_domain: domain,
      website_status: data.website_status,
      service_interest: data.service_interest,
      pipeline_stage: 'discovered',
      owner_id: user.id,
      next_action: data.next_action || 'Initial audit & research',
      next_follow_up: data.next_follow_up || null,
      contact_restriction: data.contact_restriction,
    })
    .select()
    .single();

  if (insertError || !newLead) {
    return { success: false, error: insertError?.message || 'Failed to create lead' };
  }

  // 3. Insert Source & Evidence
  if (data.source_url || data.status_evidence_note) {
    await supabase.from('sources').insert({
      lead_id: newLead.id,
      source_url: data.source_url || data.website_url || 'https://zenlyft.in/manual-entry',
      source_type: 'manual_entry',
      observed_fact: data.status_evidence_note,
      checked_at: new Date().toISOString(),
      confidence: 'high',
    });
  }

  // 4. Insert Contact Channels
  if (cleanPhone) {
    await supabase.from('contact_channels').insert({
      lead_id: newLead.id,
      channel_type: 'phone',
      public_value: cleanPhone,
      verified_at: new Date().toISOString(),
      contact_restriction: data.contact_restriction,
    });
  }

  if (data.public_email) {
    await supabase.from('contact_channels').insert({
      lead_id: newLead.id,
      channel_type: 'email',
      public_value: data.public_email,
      verified_at: new Date().toISOString(),
      contact_restriction: data.contact_restriction,
    });
  }

  // 5. Audit Log
  await logAuditEvent({
    actorType: 'user',
    actorId: user.id,
    action: 'crm.lead.create',
    objectType: 'leads',
    objectId: newLead.id,
    result: 'success',
    metadata: {
      organisation_name: data.organisation_name,
      category: data.category,
      website_status: data.website_status,
    },
  });

  revalidatePath('/dashboard/leads');
  return { success: true, lead: newLead };
}

export async function updateLeadStageAction(leadId: string, targetStage: PipelineStage, reason?: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const { data: currentLead, error: fetchError } = await supabase
    .from('leads')
    .select('id, pipeline_stage, contact_restriction, organisation_name')
    .eq('id', leadId)
    .single();

  if (fetchError || !currentLead) {
    return { success: false, error: 'Lead not found' };
  }

  // Enforce DNC restriction
  if (currentLead.contact_restriction === 'do_not_contact' && targetStage === 'contacted') {
    return { success: false, error: 'Cannot transition to Contacted: Lead is marked Do Not Contact' };
  }

  // Validate allowed pipeline stage transitions
  if (!canTransitionStage(currentLead.pipeline_stage, targetStage)) {
    return {
      success: false,
      error: `Invalid transition from "${currentLead.pipeline_stage}" to "${targetStage}".`,
    };
  }

  const updatePayload: Record<string, unknown> = {
    pipeline_stage: targetStage,
    updated_at: new Date().toISOString(),
  };

  if (targetStage === 'lost' && reason) {
    updatePayload.loss_reason = reason;
  }

  if (targetStage === 'do_not_contact') {
    updatePayload.contact_restriction = 'do_not_contact';
  }

  const { error: updateError } = await supabase.from('leads').update(updatePayload).eq('id', leadId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  await logAuditEvent({
    actorType: 'user',
    actorId: user.id,
    action: 'crm.lead.stage_change',
    objectType: 'leads',
    objectId: leadId,
    result: 'success',
    metadata: {
      from: currentLead.pipeline_stage,
      to: targetStage,
      reason: reason || null,
    },
  });

  revalidatePath('/dashboard/leads');
  return { success: true };
}

