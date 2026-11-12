import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

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

  const [{ data: sources }, { data: contacts }] = await Promise.all([
    supabase
      .from('sources')
      .select('*')
      .eq('lead_id', id)
      .order('checked_at', { ascending: false }),
    supabase.from('contact_channels').select('*').eq('lead_id', id),
  ]);

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

          <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#151B2B]">Opportunity Fit Score</h2>
              <span className="text-lg font-black text-[#FF6B35]">{lead.score ?? 75} / 100</span>
            </div>
            <p className="mt-1 text-xs text-[#525A6B]">
              Deterministic fit score based on digital gap, institutional workflows, and reachable public channels.
            </p>
          </div>
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
