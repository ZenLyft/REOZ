import { createClient } from '@/lib/supabase/server';
import { ApprovalInboxClient } from './ApprovalInboxClient';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const supabase = createClient();

  const [{ data: rawApprovals, error }, { data: drafts }] = await Promise.all([
    supabase
      .from('approvals')
      .select('id, action_type, target_id, recipient, reason, payload_hash, status, expires_at')
      .order('expires_at', { ascending: false }),
    supabase
      .from('outreach_drafts')
      .select('id, lead_id, draft, channel, approved_recipient'),
  ]);

  const draftIds = (drafts || []).map((d) => d.lead_id).filter(Boolean);
  const { data: leads } = draftIds.length
    ? await supabase
        .from('leads')
        .select('id, organisation_name, location')
        .in('id', draftIds)
    : { data: [] };

  const draftById = new Map((drafts || []).map((d) => [d.id, d]));
  const leadById = new Map((leads || []).map((l) => [l.id, l]));

  const approvals = (rawApprovals || []).map((a) => {
    const draft = draftById.get(a.target_id);
    const lead = draft?.lead_id ? leadById.get(draft.lead_id) : null;
    const channel: 'whatsapp' | 'email' =
      draft?.channel === 'email' || a.recipient.includes('@') ? 'email' : 'whatsapp';

    return {
      id: a.id,
      target_id: a.target_id,
      lead_id: draft?.lead_id || null,
      action_type: a.action_type,
      recipient: a.recipient,
      reason: a.reason,
      payload_hash: a.payload_hash,
      status: a.status,
      draft_content: draft?.draft || a.reason || 'Draft message pending review.',
      organisation_name: lead?.organisation_name || 'Verified Prospect',
      location: lead?.location || '',
      channel,
    };
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4E7EC] pb-5">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#151B2B]">
          Founder Approval Inbox
        </h1>
        <p className="mt-1 text-sm text-[#525A6B]">
          Zero-Trust 1-Tap Sign-off. Review AI-drafted WhatsApp outreach, approve cryptographically, and send directly from +91 80159 29139.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load approvals: {error.message}
        </div>
      ) : (
        <ApprovalInboxClient initialApprovals={approvals} />
      )}
    </div>
  );
}
