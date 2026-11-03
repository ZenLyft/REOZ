import { createClient } from '@/lib/supabase/server';
import { ApprovalInboxClient } from './ApprovalInboxClient';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const supabase = createClient();

  // Fetch pending or recent approvals joined with lead and draft info
  const { data: rawApprovals, error } = await supabase
    .from('approvals')
    .select(`
      id,
      action_type,
      target_id,
      recipient,
      reason,
      payload_hash,
      status,
      created_at
    `)
    .order('created_at', { ascending: false });

  // Map into UI items
  const approvals = (rawApprovals || []).map((a) => ({
    id: a.id,
    target_id: a.target_id,
    action_type: a.action_type,
    recipient: a.recipient,
    reason: a.reason,
    payload_hash: a.payload_hash,
    status: a.status,
    draft_content: a.reason || 'Draft message pending review.',
    organisation_name: 'Prospect Organisation',
    channel: (a.recipient.includes('@') ? 'email' : 'whatsapp') as 'whatsapp' | 'email',
  }));

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Founder Approval Inbox</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Zero-Trust Human-in-the-Loop Gate. Every outreach draft and proposal requires explicit founder sign-off before transmission.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          Failed to load approvals: {error.message}
        </div>
      ) : (
        <ApprovalInboxClient initialApprovals={approvals} />
      )}
    </div>
  );
}

