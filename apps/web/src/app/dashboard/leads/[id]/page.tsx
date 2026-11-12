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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5DDD0] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#5A554C]">
            <Link href="/dashboard/leads" className="font-bold hover:text-[#11100E]">
              &larr; Back to Leads
            </Link>
            <span>/</span>
            <span className="capitalize">{lead.organisation_type.replace(/_/g, ' ')}</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-[#11100E]">
            {lead.organisation_name}
          </h1>
          <p className="mt-0.5 text-xs text-[#5A554C]">
            {lead.category} • {lead.location}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#11100E] px-3 py-1 text-xs font-bold text-[#FAF6EE]">
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
          <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#11100E]">Website & Verification Evidence</h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-3.5">
                <div className="text-xs text-[#7C756A]">Website URL</div>
                <div className="mt-1 text-sm font-semibold text-[#11100E] truncate">
                  {lead.website_url ? (
                    <a
                      href={lead.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-[#8C6A3B]"
                    >
                      {lead.website_url} &nearr;
                    </a>
                  ) : (
                    <span className="text-[#7C756A] italic">None recorded</span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-3.5">
                <div className="text-xs text-[#7C756A]">Status Classification</div>
                <div className="mt-1 text-sm font-bold capitalize text-[#11100E]">
                  {lead.website_status.replace(/_/g, ' ')}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase text-[#7C756A] tracking-wider">
                Source Facts & Attribution
              </h3>
              <div className="mt-2 space-y-2">
                {sources && sources.length > 0 ? (
                  sources.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between text-[#5A554C]">
                        <span>
                          Source:{' '}
                          <a
                            href={s.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold underline text-[#11100E]"
                          >
                            {s.source_url}
                          </a>
                        </span>
                        <span className="rounded bg-[#EFE7DA] px-1.5 py-0.5 text-[10px] font-bold text-[#11100E]">
                          Confidence: {s.confidence}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[#11100E] font-medium">
                        Observed Fact: {s.observed_fact}
                      </p>
                      <div className="mt-1 text-[10px] text-[#7C756A]">
                        Checked: {new Date(s.checked_at).toLocaleString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-3 text-xs text-[#7C756A]">
                    No linked external sources yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#11100E]">Opportunity Fit Score</h2>
              <span className="text-lg font-black text-[#11100E]">{lead.score ?? 75} / 100</span>
            </div>
            <p className="mt-1 text-xs text-[#5A554C]">
              Deterministic fit score based on digital gap, institutional workflows, and reachable public channels.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#11100E]">Verified Contact Routes</h2>
            <div className="mt-3 space-y-2">
              {contacts && contacts.length > 0 ? (
                contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-3 text-xs"
                  >
                    <div>
                      <span className="capitalize text-[#5A554C]">{c.channel_type}:</span>{' '}
                      <span className="font-bold text-[#11100E]">{c.public_value}</span>
                    </div>
                    {c.channel_type === 'phone' && (
                      <a
                        href={getWaHref(c.public_value)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-[#FAF6EE] hover:bg-emerald-800"
                      >
                        WhatsApp &nearr;
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-3 text-xs text-[#7C756A]">
                  No public contact channels recorded yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-[#11100E]">Next Action & Conversion</h2>
            <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-3.5 text-xs space-y-2">
              <div>
                <div className="text-[#7C756A]">Planned Action:</div>
                <div className="font-bold text-[#11100E]">
                  {lead.next_action || 'Review in Approvals & dispatch outreach'}
                </div>
              </div>
              <div>
                <div className="text-[#7C756A]">Follow-up Due:</div>
                <div className="font-bold text-[#11100E]">
                  {lead.next_follow_up || 'Not scheduled'}
                </div>
              </div>
            </div>
            <Link
              href="/dashboard/projects"
              className="block w-full rounded-xl bg-[#11100E] py-2.5 text-center text-xs font-bold text-[#FAF6EE] hover:bg-[#272420]"
            >
              Convert to Paying Client Project &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
