'use server';

import crypto from 'crypto';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  computeCanonicalApprovalHash,
  type CanonicalApprovalPayload,
} from '@/lib/crm/pricing-and-hash';
import {
  extractEvidenceMeta,
  isMissingColumnError,
  queueResearchOutreachApprovals,
  verifyApprovalRecordIntegrity,
} from '@/lib/crm/outreach-dossier-store';
import { researchAndPrepareOutreach } from '@/lib/ai/outreach-intelligence';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import {
  OpenWAClient,
  getOpenWAConfig,
  formatWhatsAppChatId,
} from '@/lib/integrations/openwa-client';
import {
  approveEmailApprovalDraft,
  createOrUpdateEmailApprovalDraft,
  dispatchApprovedEmailDraft,
  getZohoPublicStatus,
} from '@/lib/integrations/zoho-store';
import { notifyFounder } from '@/lib/integrations/web-push';

export interface OpenWaGatewayStatus {
  status: string;
  phone: string;
  emergencyStopActive: boolean;
}

export async function approveDraftAction(
  approvalId: string,
  draftId: string,
  currentContent: string,
  recipient: string
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized: Founder login required.' };
  }

  const admin = createAdminClient();
  const { data: approval, error: appError } = await admin
    .from('approvals')
    .select('*')
    .eq('id', approvalId)
    .single();

  if (appError || !approval) {
    return { success: false, error: 'Approval record not found.' };
  }

  if (approval.status !== 'pending') {
    return { success: false, error: `Cannot approve: Status is already ${approval.status}.` };
  }

  const { data: draft } = await admin
    .from('outreach_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle();

  if (!draft) {
    return { success: false, error: 'Outreach draft record not found.' };
  }

  const { data: lead } = await admin
    .from('leads')
    .select('contact_restriction, pipeline_stage')
    .eq('id', draft.lead_id)
    .maybeSingle();

  if (
    lead?.contact_restriction === 'opt_out' ||
    lead?.contact_restriction === 'do_not_contact' ||
    lead?.pipeline_stage === 'do_not_contact'
  ) {
    return {
      success: false,
      error: 'PROSPECT_SUPPRESSED: Lead has opted out or is marked Do-Not-Contact.',
    };
  }

  const integrity = verifyApprovalRecordIntegrity({
    approval,
    draft,
    targetRecipient: recipient,
  });

  if (!integrity.valid || draft.draft !== currentContent) {
    return {
      success: false,
      error: `Cryptographic Integrity Check Failed: ${integrity.reason || 'Draft content or recipient was modified without re-hashing.'}`,
    };
  }

  const now = new Date().toISOString();
  await admin
    .from('approvals')
    .update({ status: 'approved', decided_at: now })
    .eq('id', approvalId);

  await admin
    .from('outreach_drafts')
    .update({
      approval_status: 'approved',
      approved_content_hash: approval.payload_hash,
      approved_recipient: recipient,
      approved_at: now,
    })
    .eq('id', draftId);

  await logAuditEvent({
    actorType: 'user',
    actorId: user.id,
    action: 'approval.approve',
    objectType: 'approvals',
    objectId: approvalId,
    result: 'success',
    metadata: {
      draft_id: draftId,
      channel: draft.channel,
      recipient,
      payload_hash: approval.payload_hash,
    },
  });

  revalidatePath('/dashboard/approvals');
  revalidatePath(`/dashboard/leads/${draft.lead_id}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function editDraftMessageAction(params: {
  approvalId: string;
  draftId: string;
  newContent: string;
  newSubject?: string | null;
  newRecipient?: string | null;
}): Promise<{
  success: boolean;
  newHash?: string;
  newRecipient?: string;
  error?: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized: Founder login required.' };
  }

  const cleanContent = String(params.newContent || '').trim();
  if (cleanContent.length < 15) {
    return { success: false, error: 'Edited outreach message is too short (minimum 15 characters).' };
  }

  const admin = createAdminClient();
  const [{ data: approval }, { data: draft }] = await Promise.all([
    admin.from('approvals').select('*').eq('id', params.approvalId).maybeSingle(),
    admin.from('outreach_drafts').select('*').eq('id', params.draftId).maybeSingle(),
  ]);

  if (!approval || !draft) {
    return { success: false, error: 'Approval or draft record not found.' };
  }

  if (approval.status === 'sent' || draft.approval_status === 'sent') {
    return { success: false, error: 'Already sent messages cannot be edited.' };
  }

  const channel: 'whatsapp' | 'email' = draft.channel === 'email' ? 'email' : 'whatsapp';
  const updatedRecipient = String(params.newRecipient ?? approval.recipient ?? '').trim();
  if (!updatedRecipient) {
    return { success: false, error: 'Recipient cannot be empty.' };
  }

  const meta = extractEvidenceMeta(approval.evidence);
  const updatedSubject =
    channel === 'email'
      ? String(params.newSubject ?? meta.email_subject ?? draft.subject ?? '').trim()
      : '';

  const templateVersion = String(draft.template_version ?? meta.template_version ?? 'research-v2');
  const newCanonicalPayload: CanonicalApprovalPayload = {
    lead_id: String(draft.lead_id),
    recipient: updatedRecipient,
    channel,
    message_content: cleanContent,
    subject: updatedSubject,
    template_version: templateVersion,
    approval_scope: 'first_contact',
  };
  const newHash = computeCanonicalApprovalHash(newCanonicalPayload);

  const extDraftUpdate = {
    draft: cleanContent,
    subject: channel === 'email' ? updatedSubject : null,
    version: (Number(draft.version) || 1) + 1,
    approval_status: 'pending' as const,
    approved_content_hash: null,
    approved_recipient: null,
    approved_at: null,
    metadata: {
      ...(typeof draft.metadata === 'object' && draft.metadata ? draft.metadata : {}),
      canonical_payload: newCanonicalPayload,
      edited_by: user.id,
      edited_at: new Date().toISOString(),
    },
  };

  const { error: extErr } = await admin
    .from('outreach_drafts')
    .update(extDraftUpdate)
    .eq('id', params.draftId);

  if (extErr && isMissingColumnError(extErr)) {
    await admin
      .from('outreach_drafts')
      .update({
        draft: cleanContent,
        version: (Number(draft.version) || 1) + 1,
        approval_status: 'pending',
        approved_content_hash: null,
        approved_recipient: null,
        approved_at: null,
      })
      .eq('id', params.draftId);
  }

  const updatedEvidence = [
    {
      ...meta,
      channel,
      email_subject: channel === 'email' ? updatedSubject : meta.email_subject,
      canonical_payload: newCanonicalPayload,
      template_version: templateVersion,
      edited_at: new Date().toISOString(),
    },
  ];

  // Any edit strictly resets status back to 'pending' so previous approvals are invalidated
  await admin
    .from('approvals')
    .update({
      payload_hash: newHash,
      recipient: updatedRecipient,
      status: 'pending',
      decided_at: null,
      evidence: updatedEvidence,
      reason: `[EDITED — Fresh Founder Approval Required] ${String(approval.reason || '').replace(/^\[EDITED[^\]]*\]\s*/, '')}`,
    })
    .eq('id', params.approvalId);

  await logAuditEvent({
    actorType: 'user',
    actorId: user.id,
    action: 'approval.edited_invalidated',
    objectType: 'approvals',
    objectId: params.approvalId,
    result: 'success',
    metadata: {
      draft_id: params.draftId,
      channel,
      new_hash: newHash,
      recipient: updatedRecipient,
    },
  });

  revalidatePath('/dashboard/approvals');
  revalidatePath(`/dashboard/leads/${draft.lead_id}`);
  return { success: true, newHash, newRecipient: updatedRecipient };
}

export async function regenerateLeadOutreachAction(leadId: string): Promise<{
  success: boolean;
  queuedChannels?: Array<'whatsapp' | 'email'>;
  qualityScore?: number;
  error?: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized: Founder login required.' };
  }

  const admin = createAdminClient();
  const [{ data: lead }, { data: sources }, { data: channels }] = await Promise.all([
    admin.from('leads').select('*').eq('id', leadId).maybeSingle(),
    admin.from('sources').select('*').eq('lead_id', leadId),
    admin.from('contact_channels').select('*').eq('lead_id', leadId),
  ]);

  if (!lead) {
    return { success: false, error: 'Lead record not found.' };
  }

  const phoneChannel = (channels || []).find((c) => c.channel_type === 'phone' || c.channel_type === 'whatsapp');
  const emailChannel = (channels || []).find((c) => c.channel_type === 'email');

  const dossier = await researchAndPrepareOutreach(
    {
      lead_id: leadId,
      company_name: lead.organisation_name,
      industry: lead.category,
      category: lead.category,
      location: lead.location,
      website_url: lead.website_url,
      website_status: lead.website_status,
      public_phone: phoneChannel?.public_value || null,
      public_email: emailChannel?.public_value || null,
      decision_maker_name: (lead as any).decision_maker_name || null,
      decision_maker_role: (lead as any).decision_maker_role || null,
      business_description: (lead as any).business_description || null,
      research_sources: [
        ...(sources || []).map((s) => s.source_url).filter(Boolean),
        ...(lead.website_url ? [lead.website_url] : []),
      ],
      observed_facts: (sources || []).map((s) => s.observed_fact).filter(Boolean),
      contact_restriction: lead.contact_restriction,
    },
    { inspectWebsite: Boolean(lead.website_url) }
  );

  const queued = await queueResearchOutreachApprovals({
    supabase: admin,
    leadId,
    dossier,
    replaceExisting: true,
  });

  await logAuditEvent({
    actorType: 'user',
    actorId: user.id,
    action: 'outreach.regenerated',
    objectType: 'leads',
    objectId: leadId,
    result: 'success',
    metadata: {
      quality_score: dossier.quality_evaluation.score,
      status: dossier.status,
      queued_channels: queued.queuedChannels,
    },
  });

  revalidatePath('/dashboard/approvals');
  revalidatePath(`/dashboard/leads/${leadId}`);
  return {
    success: true,
    queuedChannels: queued.queuedChannels,
    qualityScore: dossier.quality_evaluation.score,
  };
}

export async function rejectDraftAction(approvalId: string, draftId: string, reason: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const now = new Date().toISOString();
  await supabase
    .from('approvals')
    .update({ status: 'rejected', decided_at: now })
    .eq('id', approvalId);

  await supabase
    .from('outreach_drafts')
    .update({ approval_status: 'rejected' })
    .eq('id', draftId);

  await logAuditEvent({
    actorType: 'user',
    actorId: user.id,
    action: 'approval.reject',
    objectType: 'approvals',
    objectId: approvalId,
    result: 'success',
    metadata: { reason },
  });

  revalidatePath('/dashboard/approvals');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function getOpenWaStatusAction(): Promise<OpenWaGatewayStatus> {
  const config = getOpenWAConfig();
  try {
    const supabase = createClient();
    const { data: settings } = await supabase
      .from('system_settings')
      .select('emergency_stop_active')
      .eq('id', 'zenlyft-global-settings')
      .maybeSingle();

    const emergencyStopActive = Boolean(settings?.emergency_stop_active);
    const client = new OpenWAClient();
    const session = await client.getSession(config.sessionId);

    return {
      status: emergencyStopActive ? 'emergency_stopped' : session?.status || 'disconnected',
      phone: session?.phone || config.businessPhone,
      emergencyStopActive,
    };
  } catch {
    return {
      status: 'disconnected',
      phone: config.businessPhone,
      emergencyStopActive: false,
    };
  }
}

async function verifyDispatchAuthorization(params: {
  approvalId: string;
  draftId: string;
  currentContent: string;
  recipient: string;
}): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      userId: string;
      admin: ReturnType<typeof createAdminClient>;
      approval: any;
      draft: any;
    }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Unauthorized: Founder login required.' };
  }

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from('system_settings')
    .select('emergency_stop_active')
    .eq('id', 'zenlyft-global-settings')
    .maybeSingle();

  if (settings?.emergency_stop_active) {
    return {
      ok: false,
      error: 'Master Emergency Stop is active. Deactivate it in Settings before dispatching.',
    };
  }

  const [{ data: approval, error: appError }, { data: draft }] = await Promise.all([
    admin.from('approvals').select('*').eq('id', params.approvalId).maybeSingle(),
    admin.from('outreach_drafts').select('*').eq('id', params.draftId).maybeSingle(),
  ]);

  if (appError || !approval || !draft) {
    return { ok: false, error: 'Approval or outreach draft record not found.' };
  }

  if (approval.status !== 'approved') {
    return {
      ok: false,
      error: `AUTHORIZATION_REQUIRED: Approval status is '${approval.status}'. Click Approve before dispatching.`,
    };
  }

  const { data: lead } = await admin
    .from('leads')
    .select('contact_restriction, pipeline_stage')
    .eq('id', draft.lead_id)
    .maybeSingle();

  if (
    lead?.contact_restriction === 'opt_out' ||
    lead?.contact_restriction === 'do_not_contact' ||
    lead?.pipeline_stage === 'do_not_contact'
  ) {
    return {
      ok: false,
      error: 'PROSPECT_SUPPRESSED: Lead has opted out or is marked Do-Not-Contact.',
    };
  }

  const integrity = verifyApprovalRecordIntegrity({
    approval,
    draft,
    targetRecipient: params.recipient,
  });

  if (!integrity.valid || draft.draft !== params.currentContent) {
    return {
      ok: false,
      error: `Integrity Check Failed: ${integrity.reason || 'Content or recipient was modified without re-approval.'}`,
    };
  }

  return { ok: true, userId: user.id, admin, approval, draft };
}

export async function dispatchApprovedDraftViaOpenWAAction(
  approvalId: string,
  draftId: string,
  currentContent: string,
  recipient: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const gate = await verifyDispatchAuthorization({
    approvalId,
    draftId,
    currentContent,
    recipient,
  });
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }

  const cleanPhone = recipient.replace(/[^\d]/g, '');
  if (!cleanPhone || cleanPhone.length < 7) {
    return {
      success: false,
      error: 'Recipient has no valid phone digits for WhatsApp dispatch. Edit/verify contact first.',
    };
  }

  const config = getOpenWAConfig();
  const client = new OpenWAClient();
  const chatId = formatWhatsAppChatId(cleanPhone);
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${cleanPhone}::${currentContent}::${approvalId}`)
    .digest('hex');

  const sendResult = await client.sendTextMessage({
    chatId,
    text: currentContent,
    idempotencyKey,
  });

  if (!sendResult.success) {
    return {
      success: false,
      error: sendResult.error || 'OpenWA gateway offline — use Copy WhatsApp Text or Open WhatsApp Web for manual handoff.',
    };
  }

  const { admin, approval, draft, userId } = gate;
  const now = new Date().toISOString();

  await admin
    .from('approvals')
    .update({ status: 'sent', decided_at: now })
    .eq('id', approvalId);

  await admin
    .from('outreach_drafts')
    .update({
      approval_status: 'sent',
      approved_content_hash: approval.payload_hash,
      approved_recipient: recipient,
      approved_at: now,
      sent_at: now,
    })
    .eq('id', draftId);

  await admin.from('whatsapp_messages').insert({
    session_id: config.sessionId,
    lead_id: draft?.lead_id || null,
    chat_id: chatId,
    sender_number: config.businessPhone.replace(/[^\d]/g, ''),
    recipient_number: cleanPhone,
    direction: 'outbound',
    body: currentContent,
    status: 'submitted',
    external_message_id: sendResult.messageId || null,
    approval_id: approvalId,
    approval_hash: approval.payload_hash,
    sent_at: now,
  });

  if (draft?.lead_id) {
    await admin
      .from('leads')
      .update({
        pipeline_stage: 'contacted',
        next_action: 'WhatsApp outreach dispatched via OpenWA. Awaiting prospect reply.',
        updated_at: now,
      })
      .eq('id', draft.lead_id);
  }

  await logAuditEvent({
    actorType: 'user',
    actorId: userId,
    action: 'whatsapp.dispatched_openwa',
    objectType: 'outreach_drafts',
    objectId: draftId,
    result: 'success',
    metadata: {
      recipient,
      message_id: sendResult.messageId,
      approval_id: approvalId,
    },
  });

  revalidatePath('/dashboard/approvals');
  revalidatePath('/dashboard/whatsapp');
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard');

  await notifyFounder({
    category: 'system',
    title: `Sent via Founder Permission`,
    body: `Dispatched WhatsApp message to ${cleanPhone} with your approval.`,
    url: '/dashboard/whatsapp',
    leadId: draft?.lead_id || null,
    approvalId,
  });

  return { success: true, messageId: sendResult.messageId };
}

export async function dispatchApprovedEmailAction(params: {
  approvalId: string;
  draftId: string;
  currentContent: string;
  subject: string;
  recipient: string;
  senderAddress?: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  deliveryStatus?: string;
  unknownDeliveryStatus?: boolean;
  manualHandoffRequired?: boolean;
  error?: string;
}> {
  const gate = await verifyDispatchAuthorization({
    approvalId: params.approvalId,
    draftId: params.draftId,
    currentContent: params.currentContent,
    recipient: params.recipient,
  });
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }

  const emailTo = params.recipient.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) {
    return {
      success: false,
      error: 'Recipient is not a valid email address. Edit contact email first.',
    };
  }

  const { admin, approval, draft, userId } = gate;

  // Prefer integrated Zoho Mail OAuth 2.0 dispatch when connected
  const zohoStatus = await getZohoPublicStatus(admin).catch(() => null);
  if (zohoStatus && zohoStatus.status === 'CONNECTED') {
    try {
      let existingEmailApproval: { id: string; approval_status: string } | null = null;
      const { data: linked } = await admin
        .from('email_approvals')
        .select('id, approval_status')
        .or(`draft_id.eq.${params.draftId},approval_id.eq.${params.approvalId}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      existingEmailApproval = linked || null;

      if (!existingEmailApproval) {
        const created = await createOrUpdateEmailApprovalDraft(admin, {
          leadId: String(draft.lead_id || ''),
          recipientEmail: emailTo,
          senderAddress: params.senderAddress || zohoStatus.selectedSenderEmail || undefined,
          subject: params.subject,
          textBody: params.currentContent,
          rationale: String(approval.reason || ''),
        });
        await admin
          .from('email_approvals')
          .update({
            draft_id: params.draftId,
            approval_id: params.approvalId,
          })
          .eq('id', created.id);
        existingEmailApproval = { id: created.id, approval_status: created.approval_status };
      }

      if (existingEmailApproval.approval_status === 'DRAFT_PENDING') {
        await approveEmailApprovalDraft(admin, {
          draftId: existingEmailApproval.id,
          userId,
        });
      }

      const dispatched = await dispatchApprovedEmailDraft(admin, {
        draftId: existingEmailApproval.id,
        userId,
      });

      const now = new Date().toISOString();
      await admin
        .from('approvals')
        .update({ status: 'sent', decided_at: now })
        .eq('id', params.approvalId);

      await admin
        .from('outreach_drafts')
        .update({
          approval_status: 'sent',
          approved_content_hash: approval.payload_hash,
          approved_recipient: emailTo,
          approved_at: now,
          sent_at: now,
        })
        .eq('id', params.draftId);

      if (draft?.lead_id) {
        await admin.from('conversations').insert({
          lead_id: draft.lead_id,
          channel: 'email',
          direction: 'outbound',
          sender: params.senderAddress || zohoStatus.selectedSenderEmail || 'zoho-mail',
          recipient: emailTo,
          message_content: `Subject: ${params.subject}\n\n${params.currentContent}`,
          external_message_id: dispatched.zohoMessageId || null,
        });
      }

      revalidatePath('/dashboard/approvals');
      revalidatePath('/dashboard/leads');
      revalidatePath('/dashboard');

      return {
        success: true,
        messageId: dispatched.zohoMessageId || undefined,
        deliveryStatus: dispatched.deliveryStatus,
      };
    } catch (err: any) {
      const unknown = err?.code === 'DELIVERY_STATUS_UNKNOWN';
      return {
        success: false,
        deliveryStatus: unknown ? 'DELIVERY_STATUS_UNKNOWN' : 'FAILED',
        unknownDeliveryStatus: unknown,
        error: err?.message || 'Zoho email dispatch failed.',
      };
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return {
      success: false,
      error:
        'Zoho Mail is not connected yet (and RESEND_API_KEY is unset). Open Settings → Integrations and click Connect Zoho Mail to dispatch via Zoho API.',
    };
  }

  const fromEmail = process.env.ZENLYFT_FROM_EMAIL || 'outreach@zenlyft.in';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [emailTo],
      subject: params.subject,
      text: params.currentContent,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      success: false,
      error: `Email provider error (${res.status}): ${errText.slice(0, 180)}`,
    };
  }

  const resJson = (await res.json()) as { id?: string };
  const now = new Date().toISOString();

  await admin
    .from('approvals')
    .update({ status: 'sent', decided_at: now })
    .eq('id', params.approvalId);

  await admin
    .from('outreach_drafts')
    .update({
      approval_status: 'sent',
      approved_content_hash: approval.payload_hash,
      approved_recipient: emailTo,
      approved_at: now,
      sent_at: now,
    })
    .eq('id', params.draftId);

  if (draft?.lead_id) {
    await admin.from('conversations').insert({
      lead_id: draft.lead_id,
      channel: 'email',
      direction: 'outbound',
      sender: fromEmail,
      recipient: emailTo,
      message_content: `Subject: ${params.subject}\n\n${params.currentContent}`,
      external_message_id: resJson.id || null,
    });

    await admin
      .from('leads')
      .update({
        pipeline_stage: 'contacted',
        next_action: 'Email outreach dispatched after Founder approval. Awaiting prospect reply.',
        updated_at: now,
      })
      .eq('id', draft.lead_id);
  }

  await logAuditEvent({
    actorType: 'user',
    actorId: userId,
    action: 'email.dispatched',
    objectType: 'outreach_drafts',
    objectId: params.draftId,
    result: 'success',
    metadata: {
      recipient: emailTo,
      subject: params.subject,
      message_id: resJson.id,
      approval_id: params.approvalId,
    },
  });

  revalidatePath('/dashboard/approvals');
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard');

  return { success: true, messageId: resJson.id };
}

export async function markManualDispatchSentAction(
  approvalId: string,
  draftId: string,
  currentContent: string,
  recipient: string
): Promise<{ success: boolean; error?: string }> {
  const gate = await verifyDispatchAuthorization({
    approvalId,
    draftId,
    currentContent,
    recipient,
  });
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }

  const { admin, draft, approval, userId } = gate;
  const now = new Date().toISOString();

  await admin
    .from('approvals')
    .update({ status: 'sent', decided_at: now })
    .eq('id', approvalId);

  await admin
    .from('outreach_drafts')
    .update({
      approval_status: 'sent',
      approved_content_hash: approval.payload_hash,
      approved_recipient: recipient,
      approved_at: now,
      sent_at: now,
    })
    .eq('id', draftId);

  if (draft?.lead_id) {
    await admin
      .from('leads')
      .update({
        pipeline_stage: 'contacted',
        next_action: `Manual ${draft.channel || 'outreach'} handoff completed by Founder. Awaiting reply.`,
        updated_at: now,
      })
      .eq('id', draft.lead_id);
  }

  await logAuditEvent({
    actorType: 'user',
    actorId: userId,
    action: 'outreach.manual_handoff_sent',
    objectType: 'outreach_drafts',
    objectId: draftId,
    result: 'success',
    metadata: {
      channel: draft.channel,
      recipient,
      approval_id: approvalId,
    },
  });

  revalidatePath('/dashboard/approvals');
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard');
  return { success: true };
}
