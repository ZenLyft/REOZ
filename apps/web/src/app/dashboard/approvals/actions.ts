'use server';

import { createClient } from '@/lib/supabase/server';
import { verifyDraftHash } from '@/lib/crm/pricing-and-hash';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import {
  sendEvolutionWhatsAppMessage,
  getEvolutionConnectionState,
  ConnectionStateResult,
  SendMessageResult,
} from '@/lib/integrations/evolution-api';

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

  // 1. Fetch current approval record
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

  // 2. Cryptographic payload hash verification
  const isHashValid = verifyDraftHash(currentContent, recipient, approval.payload_hash);
  if (!isHashValid) {
    return {
      success: false,
      error:
        'Cryptographic Integrity Check Failed: Draft content or recipient was edited without re-hashing. Please regenerate approval.',
    };
  }

  // 3. Mark approval as approved
  const now = new Date().toISOString();
  await supabase
    .from('approvals')
    .update({
      status: 'approved',
      decided_at: now,
    })
    .eq('id', approvalId);

  // 4. Update outreach draft record
  await supabase
    .from('outreach_drafts')
    .update({
      approval_status: 'approved',
      approved_content_hash: approval.payload_hash,
      approved_recipient: recipient,
      approved_at: now,
    })
    .eq('id', draftId);

  // 5. Audit Log
  await logAuditEvent({
    actorType: 'user',
    actorId: user.id,
    action: 'approval.approve',
    objectType: 'approvals',
    objectId: approvalId,
    result: 'success',
    metadata: {
      draft_id: draftId,
      recipient,
      payload_hash: approval.payload_hash,
    },
  });

  revalidatePath('/dashboard/approvals');
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
    .update({
      status: 'rejected',
      decided_at: now,
    })
    .eq('id', approvalId);

  await supabase
    .from('outreach_drafts')
    .update({
      approval_status: 'rejected',
    })
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
  return { success: true };
}

export async function getEvolutionStatusAction(): Promise<ConnectionStateResult> {
  return await getEvolutionConnectionState();
}

export async function dispatchApprovedDraftViaEvolutionAction(
  approvalId: string,
  draftId: string,
  currentContent: string,
  recipient: string
): Promise<SendMessageResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized: Founder login required.' };
  }

  // 1. Fetch current approval record
  const { data: approval, error: appError } = await supabase
    .from('approvals')
    .select('*')
    .eq('id', approvalId)
    .single();

  if (appError || !approval) {
    return { success: false, error: 'Approval record not found.' };
  }

  // 2. Cryptographic payload hash verification
  const isHashValid = verifyDraftHash(currentContent, recipient, approval.payload_hash);
  if (!isHashValid) {
    return {
      success: false,
      error: 'Integrity Check Failed: Content was modified without re-hashing.',
    };
  }

  // 3. Send message via Evolution API
  const sendRes = await sendEvolutionWhatsAppMessage(recipient, currentContent);
  if (!sendRes.success) {
    return sendRes;
  }

  const now = new Date().toISOString();

  // 4. Update approval record to approved
  await supabase
    .from('approvals')
    .update({
      status: 'approved',
      decided_at: now,
    })
    .eq('id', approvalId);

  // 5. Update draft status
  const { data: draft } = await supabase
    .from('outreach_drafts')
    .update({
      approval_status: 'approved',
      approved_content_hash: approval.payload_hash,
      approved_recipient: recipient,
      approved_at: now,
    })
    .eq('id', draftId)
    .select('lead_id')
    .single();

  // 6. Transition lead to 'contacted'
  if (draft?.lead_id) {
    await supabase
      .from('leads')
      .update({
        pipeline_stage: 'contacted',
        next_action: 'Automated WhatsApp dispatched via Evolution API. Awaiting prospect reply.',
        updated_at: now,
      })
      .eq('id', draft.lead_id);
  }

  // 7. Audit Log
  await logAuditEvent({
    actorType: 'user',
    actorId: user.id,
    action: 'whatsapp.dispatched_automated',
    objectType: 'outreach_drafts',
    objectId: draftId,
    result: 'success',
    metadata: {
      recipient,
      message_id: sendRes.messageId,
      gateway: 'evolution-api',
      approval_id: approvalId,
    },
  });

  revalidatePath('/dashboard/approvals');
  revalidatePath('/dashboard/leads');
  return { success: true, messageId: sendRes.messageId };
}
