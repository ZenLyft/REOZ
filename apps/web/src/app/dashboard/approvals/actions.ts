'use server';

import { createClient } from '@/lib/supabase/server';
import { computeDraftHash, verifyDraftHash } from '@/lib/crm/pricing-and-hash';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

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

