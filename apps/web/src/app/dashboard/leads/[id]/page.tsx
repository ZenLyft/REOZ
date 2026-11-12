import { createAdminClient, createClient } from '@/lib/supabase/server';
import { loadLeadDossiersMap } from '@/lib/crm/outreach-dossier-store';
import { getZohoPublicStatus } from '@/lib/integrations/zoho-store';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LeadResearchTriggerButton } from './LeadResearchTriggerButton';
import {
  LeadConversationTabs,
  type EmailReplySuggestion,
  type UnifiedTimelineEvent,
} from './LeadConversationTabs';

interface LeadDetailPageProps {
  params: {
    id: string;
  };
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const supabase = createClient();
  const { id } = params;

  const { data: lead, error } = await supabase.from('leads').select('*').eq('id', id).single();

  if (error || !lead) {
    notFound();
  }

  const admin = createAdminClient();
  const [
    { data: sources },
    { data: contacts },
    dossiersMap,
    legacyConvs,
    emailMessages,
    emailConvs,
    zohoStatus,
  ] = await Promise.all([
    supabase
      .from('sources')
      .select('*')
      .eq('lead_id', id)
      .order('checked_at', { ascending: false }),
    supabase.from('contact_channels').select('*').eq('lead_id', id),
    loadLeadDossiersMap(supabase, [id]),
    admin
      .from('conversations')
      .select('id, channel, direction, sender, recipient, message_content, created_at')
      .eq('lead_id', id)
      .order('created_at', { ascending: true })
      .then((r) => (r.error ? [] : r.data || []), () => []),
    admin
      .from('email_messages')
      .select('id, direction, from_address, to_addresses, subject, text_body, clean_snippet, delivery_status, reply_classification, has_prompt_injection, received_or_sent_at')
      .eq('lead_id', id)
      .order('received_or_sent_at', { ascending: true })
      .then((r) => (r.error ? [] : r.data || []), () => []),
    admin
      .from('email_conversations')
      .select('id, subject, reply_classification, ai_suggested_reply, ai_reply_rationale')
      .eq('lead_id', id)
      .order('last_message_at', { ascending: false })
      .then((r) => (r.error ? [] : r.data || []), () => []),
    getZohoPublicStatus(admin).catch(() => null),
  ]);

  const defaultEmail =
    contacts?.find((c) => c.channel_type === 'email')?.public_value ||
    (lead as any).email ||
    '';
  const defaultPhone =
    contacts?.find((c) => c.channel_type === 'phone' || c.channel_type === 'whatsapp')?.public_value ||
    (lead as any).phone ||
    '';

  const unifiedEvents: UnifiedTimelineEvent[] = [
    ...(legacyConvs || [])
      .filter((c: any) => c.channel !== 'email')
      .map((c: any) => ({
        id: `conv-${c.id}`,
        channel: 'whatsapp' as const,
        direction: c.direction === 'inbound' ? ('inbound' as const) : ('outbound' as const),
        sender: String(c.sender || 'ZenLyft'),
        recipient: String(c.recipient || defaultPhone),
        subject: null,
        body: String(c.message_content || ''),
        status: null,
        classification: null,
        hasPromptInjection: false,
        timestamp: c.created_at || new Date().toISOString(),
      })),
    ...(emailMessages || []).map((m: any) => ({
      id: `email-${m.id}`,
      channel: 'email' as const,
      direction: m.direction === 'inbound' ? ('inbound' as const) : ('outbound' as const),
      sender: String(m.from_address || 'Unknown'),
      recipient: Array.isArray(m.to_addresses) ? m.to_addresses.join(', ') : '',
      subject: m.subject || null,
      body: String(m.text_body || m.clean_snippet || ''),
      status: m.delivery_status || null,
      classification: m.reply_classification || null,
      hasPromptInjection: Boolean(m.has_prompt_injection),
      timestamp: m.received_or_sent_at || new Date().toISOString(),
    })),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const replySuggestions: EmailReplySuggestion[] = (emailConvs || [])
    .filter((c: any) => Boolean(c.ai_suggested_reply))
    .map((c: any) => ({
      conversationId: String(c.id),
      subject: String(c.subject || ''),
      classification: c.reply_classification || null,
      suggestedReply: String(c.ai_suggested_reply || ''),
      rationale: c.ai_reply_rationale || null,
    }));

  const dossier = dossiersMap.get(id) || null;
  const profile = dossier?.research_profile || (lead as any).research_profile || null;
  const identifiedNeeds = dossier?.business_needs || (lead as any).identified_needs || [];
  const serviceMatch = dossier?.service_match || (lead as any).service_match || null;
  const qualityEval = dossier?.quality_evaluation || (lead as any).message_quality_breakdown || null;

  function getWaHref(phone: string) {
    const digits = phone.replace(/\D/g, '');
    const formatted = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${formatted}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E4E7EC] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#525A6B]">
            <Link href="/dashboard/leads" className="font-bold hover:text-[#151B2B]">
              &larr; Back to Leads
            </Link>
            <span>/</span>
            <span className="capitalize">{lead.organisation_type.replace(/_/g, ' ')}</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-[#151B2B]">
            {lead.organisation_name}
          </h1>
          <p className="mt-0.5 text-xs text-[#525A6B]">
            {lead.category} • {lead.location}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#FF6B35] bg-[#151B2B] px-3 py-1 text-xs font-bold text-[#F5F6F8]">
            Stage: {lead.pipeline_stage.toUpperCase()}
          </span>
          {lead.contact_restriction === 'do_not_contact' && (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-800">
              DO NOT CONTACT
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#151B2B]">Website & Verification Evidence</h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3.5">
                <div className="text-xs text-[#667085]">Website URL</div>
                <div className="mt-1 text-sm font-semibold text-[#151B2B] truncate">
                  {lead.website_url ? (
                    <a
                      href={lead.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-[#FF6B35]"
                    >
                      {lead.website_url} &nearr;
                    </a>
                  ) : (
                    <span className="text-[#667085] italic">None recorded</span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3.5">
                <div className="text-xs text-[#667085]">Status Classification</div>
                <div className="mt-1 text-sm font-bold capitalize text-[#151B2B]">
                  {lead.website_status.replace(/_/g, ' ')}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase text-[#667085] tracking-wider">
                Source Facts & Attribution
              </h3>
              <div className="mt-2 space-y-2">
                {sources && sources.length > 0 ? (
                  sources.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between text-[#525A6B]">
                        <span>
                          Source:{' '}
                          <a
                            href={s.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold underline text-[#151B2B]"
                          >
                            {s.source_url}
                          </a>
                        </span>
                        <span className="rounded bg-[#ECEFF3] px-1.5 py-0.5 text-[10px] font-bold text-[#151B2B]">
                          Confidence: {s.confidence}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[#151B2B] font-medium">
                        Observed Fact: {s.observed_fact}
                      </p>
                      <div className="mt-1 text-[10px] text-[#667085]">
                        Checked: {new Date(s.checked_at).toLocaleString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3 text-xs text-[#667085]">
                    No linked external sources yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#151B2B]">
                  Business Intelligence &amp; Research Dossier
                </h2>
                <p className="text-xs text-[#525A6B] mt-0.5">
                  Industry-specific needs analysis, verified digital signals, and ZenLyft solution matching.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-[#FF6B35]">{lead.score ?? 75} / 100</span>
                {qualityEval && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                      qualityEval.score >= 75
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    Quality: {qualityEval.score}/100
                  </span>
                )}
              </div>
            </div>

            <LeadResearchTriggerButton leadId={id} hasExistingDossier={Boolean(profile)} />

            {profile && (
              <div className="space-y-4 pt-2 border-t border-[#ECEFF3]">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  {[
                    ['Website', profile.digital_presence?.website_available ? 'VERIFIED' : 'UNKNOWN'],
                    ['Booking', profile.digital_presence?.booking_system || 'UNKNOWN'],
                    ['Portal', profile.digital_presence?.customer_portal || 'UNKNOWN'],
                    ['Mobile App', profile.digital_presence?.mobile_app || 'UNKNOWN'],
                    ['Payments', profile.digital_presence?.online_payments || 'UNKNOWN'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-2.5">
                      <div className="text-[10px] font-bold uppercase text-[#667085]">{k}</div>
                      <div className="font-bold text-[#151B2B] mt-0.5">{v}</div>
                    </div>
                  ))}
                </div>

                {serviceMatch && (
                  <div className="rounded-xl border border-[#E4E7EC] bg-[#F9FAFB] p-4 text-xs space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#EA580C]">
                      Matched ZenLyft Solution • {serviceMatch.primary_service?.replace(/_/g, ' ')}
                    </div>
                    <div className="text-sm font-bold text-[#151B2B]">
                      {serviceMatch.recommended_solution}
                    </div>
                    <p className="text-[#525A6B]">
                      <strong className="text-[#151B2B]">Why Selected:</strong> {serviceMatch.why_this_service}
                    </p>
                    <p className="text-[#525A6B]">
                      <strong className="text-[#151B2B]">Expected Benefit:</strong> {serviceMatch.expected_business_outcome}
                    </p>
                    <p className="text-[#525A6B]">
                      <strong className="text-[#151B2B]">Personalization Reason:</strong> {serviceMatch.personalization_reason}
                    </p>
                  </div>
                )}

                {Array.isArray(identifiedNeeds) && identifiedNeeds.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase text-[#667085] tracking-wider">
                      Identified Business Needs ({identifiedNeeds.length})
                    </h3>
                    <div className="space-y-2">
                      {identifiedNeeds.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#151B2B]">{item.need}</span>
                            <span className="rounded bg-[#ECEFF3] px-2 py-0.5 text-[10px] font-bold text-[#525A6B]">
                              {item.confidence}
                            </span>
                          </div>
                          <p className="text-[#525A6B]">{item.recommended_solution} — {item.potential_benefit}</p>
                          <p className="text-[11px] italic text-[#667085]">
                            Discovery Question: &ldquo;{item.discovery_question}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <LeadConversationTabs
            leadId={id}
            organisationName={lead.organisation_name}
            defaultEmail={defaultEmail}
            defaultPhone={defaultPhone}
            selectedSenderEmail={zohoStatus?.selectedSenderEmail || null}
            events={unifiedEvents}
            suggestions={replySuggestions}
          />
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#151B2B]">Verified Contact Routes</h2>
            <div className="mt-3 space-y-2">
              {contacts && contacts.length > 0 ? (
                contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3 text-xs"
                  >
                    <div>
                      <span className="capitalize text-[#525A6B]">{c.channel_type}:</span>{' '}
                      <span className="font-bold text-[#151B2B]">{c.public_value}</span>
                    </div>
                    {c.channel_type === 'phone' && (
                      <a
                        href={getWaHref(c.public_value)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-[#F5F6F8] hover:bg-emerald-800"
                      >
                        WhatsApp &nearr;
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3 text-xs text-[#667085]">
                  No public contact channels recorded yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-[#151B2B]">Next Action & Conversion</h2>
            <div className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3.5 text-xs space-y-2">
              <div>
                <div className="text-[#667085]">Planned Action:</div>
                <div className="font-bold text-[#151B2B]">
                  {lead.next_action || 'Review in Approvals & dispatch outreach'}
                </div>
              </div>
              <div>
                <div className="text-[#667085]">Follow-up Due:</div>
                <div className="font-bold text-[#151B2B]">
                  {lead.next_follow_up || 'Not scheduled'}
                </div>
              </div>
            </div>
            <Link
              href="/dashboard/projects"
              className="block w-full rounded-xl bg-[#FF6B35] py-2.5 text-center text-xs font-bold text-[#F5F6F8] hover:bg-[#E05220]"
            >
              Convert to Paying Client Project &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
