'use server';

import crypto from 'crypto';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { verifyDraftHash } from '@/lib/crm/pricing-and-hash';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import {
  OpenWAClient,
  getOpenWAConfig,
  formatWhatsAppChatId,
} from '@/lib/integrations/openwa-client';

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

  const { data: approval, error: appError } = await supabase
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

  const isHashValid = verifyDraftHash(currentContent, recipient, approval.payload_hash);
  if (!isHashValid) {
    return {
      success: false,
      error:
        'Cryptographic Integrity Check Failed: Draft content or recipient was altered without re-hashing.',
    };
  }

  const now = new Date().toISOString();
  await supabase
    .from('approvals')
    .update({ status: 'approved', decided_at: now })
    .eq('id', approvalId);

  await supabase
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
    metadata: { draft_id: draftId, recipient, payload_hash: approval.payload_hash },
  });

  revalidatePath('/dashboard/approvals');
  revalidatePath('/dashboard');
  return { success: true };
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

export async function dispatchApprovedDraftViaOpenWAAction(
  approvalId: string,
  draftId: string,
  currentContent: string,
  recipient: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized: Founder login required.' };
  }

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from('system_settings')
    .select('emergency_stop_active')
    .eq('id', 'zenlyft-global-settings')
    .maybeSingle();

  if (settings?.emergency_stop_active) {
    return {
      success: false,
      error: 'Master Emergency Stop is active. Deactivate it in Settings before dispatching.',
    };
  }

  const { data: approval, error: appError } = await admin
    .from('approvals')
    .select('*')
    .eq('id', approvalId)
    .single();

  if (appError || !approval) {
    return { success: false, error: 'Approval record not found.' };
  }

  const isHashValid = verifyDraftHash(currentContent, recipient, approval.payload_hash);
  if (!isHashValid) {
    return {
      success: false,
      error: 'Integrity Check Failed: Content was modified without re-hashing.',
    };
  }

  const cleanPhone = recipient.replace(/[^\d]/g, '');
  if (!cleanPhone || cleanPhone.length < 7) {
    return {
      success: false,
      error: 'Recipient has no valid phone digits for WhatsApp dispatch. Edit/verify contact on the lead first.',
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
      error: sendResult.error || 'OpenWA gateway offline — use Open WhatsApp Web button instead.',
    };
  }

  const now = new Date().toISOString();

  await admin
    .from('approvals')
    .update({ status: 'sent', decided_at: now })
    .eq('id', approvalId);

  const { data: draft } = await admin
    .from('outreach_drafts')
    .update({
      approval_status: 'sent',
      approved_content_hash: approval.payload_hash,
      approved_recipient: recipient,
      approved_at: now,
    })
    .eq('id', draftId)
    .select('lead_id')
    .single();

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
    actorId: user.id,
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

  return { success: true, messageId: sendResult.messageId };
}
