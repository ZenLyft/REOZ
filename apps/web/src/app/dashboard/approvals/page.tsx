import { createAdminClient, createClient } from '@/lib/supabase/server';
import {
  extractDossierFromEvidence,
  extractEvidenceMeta,
  loadLeadDossiersMap,
} from '@/lib/crm/outreach-dossier-store';
import { getZohoPublicStatus } from '@/lib/integrations/zoho-store';
import { ApprovalInboxClient, type EnrichedApprovalItem, type UnmatchedInboundEmail } from './ApprovalInboxClient';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const supabase = createClient();
  const admin = createAdminClient();

  const [{ data: rawApprovals, error }, { data: drafts }, zohoStatus, unmatchedRes] = await Promise.all([
    supabase
      .from('approvals')
      .select('id, action_type, target_id, recipient, reason, evidence, payload_hash, status, expires_at')
      .neq('status', 'cancelled')
      .order('expires_at', { ascending: false }),
    supabase
      .from('outreach_drafts')
      .select('id, lead_id, draft, channel, approved_recipient'),
    getZohoPublicStatus(admin).catch(() => null),
    admin
      .from('email_messages')
      .select('id, from_address, subject, clean_snippet, reply_classification, has_prompt_injection, security_flags, received_or_sent_at')
      .eq('is_unmatched', true)
      .order('received_or_sent_at', { ascending: false })
      .limit(20)
      .then((res) => (res.error ? [] : res.data || []), () => []),
  ]);

  const draftById = new Map((drafts || []).map((d) => [d.id, d]));
  const leadIds = Array.from(
    new Set(
      (rawApprovals || [])
        .map((a) => draftById.get(a.target_id)?.lead_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [{ data: leads }, dossiersMap] = await Promise.all([
    leadIds.length
      ? supabase
          .from('leads')
          .select('id, organisation_name, location, category, website_url, score, pipeline_stage, contact_restriction')
          .in('id', leadIds)
      : Promise.resolve({ data: [] as any[] }),
    loadLeadDossiersMap(supabase, leadIds),
  ]);

  const leadById = new Map((leads || []).map((l) => [l.id, l]));

  const approvals: EnrichedApprovalItem[] = (rawApprovals || []).map((a) => {
    const draft = draftById.get(a.target_id);
    const leadId = draft?.lead_id || null;
    const lead = leadId ? leadById.get(leadId) : null;
    const evidenceMeta = extractEvidenceMeta(a.evidence);
    const dossier =
      extractDossierFromEvidence(a.evidence) || (leadId ? dossiersMap.get(leadId) || null : null);

    const channel: 'whatsapp' | 'email' =
      draft?.channel === 'email' ||
      a.action_type === 'send_email' ||
      evidenceMeta.channel === 'email' ||
      String(a.recipient || '').includes('@')
        ? 'email'
        : 'whatsapp';

    const emailSubject =
      channel === 'email'
        ? String(evidenceMeta.email_subject || dossier?.email_subject || `ZenLyft Solution for ${lead?.organisation_name || 'Your Team'}`)
        : null;

    return {
      id: a.id,
      target_id: a.target_id,
      lead_id: leadId,
      action_type: a.action_type,
      recipient: a.recipient,
      reason: a.reason,
      payload_hash: a.payload_hash,
      status: a.status,
      draft_content: draft?.draft || a.reason || 'Draft message pending review.',
      email_subject: emailSubject,
      organisation_name: lead?.organisation_name || dossier?.research_profile.company_name || 'Verified Prospect',
      location: lead?.location || dossier?.research_profile.location || '',
      category: lead?.category || dossier?.research_profile.industry || 'Business',
      website_url: lead?.website_url || (dossier?.research_profile.official_website !== 'UNKNOWN' ? dossier?.research_profile.official_website : null) || null,
      contact_restriction: lead?.contact_restriction || 'none',
      channel,
      dossier,
    };
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4E7EC] pb-5">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#151B2B]">
          Founder Approval Inbox
        </h1>
        <p className="mt-1 text-sm text-[#525A6B]">
          Research-Driven B2B Approval Gate. Inspect each prospect&apos;s verified Business Intelligence, needs analysis, and quality score before cryptographically approving WhatsApp or Email outreach.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load approvals: {error.message}
        </div>
      ) : (
        <ApprovalInboxClient
          initialApprovals={approvals}
          zohoContext={{
            connected: zohoStatus?.status === 'CONNECTED',
            status: zohoStatus?.status || 'DISCONNECTED',
            selectedSenderEmail: zohoStatus?.selectedSenderEmail || null,
            sendEnabled: Boolean(zohoStatus?.sync?.sendEnabled),
          }}
          unmatchedInbound={(unmatchedRes || []) as UnmatchedInboundEmail[]}
        />
      )}
    </div>
  );
}
