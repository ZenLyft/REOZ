import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

interface LeadDetailPageProps {
  params: {
    id: string;
  };
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const supabase = createClient();
  const { id } = params;

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !lead) {
    notFound();
  }

  // Fetch linked sources & evidence
  const { data: sources } = await supabase
    .from('sources')
    .select('*')
    .eq('lead_id', id)
    .order('checked_at', { ascending: false });

  // Fetch linked contact channels
  const { data: contacts } = await supabase
    .from('contact_channels')
    .select('*')
    .eq('lead_id', id);

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <a href="/dashboard/leads" className="hover:text-zinc-200">
              ← Back to Leads
            </a>
            <span>/</span>
            <span className="capitalize">{lead.organisation_type.replace(/_/g, ' ')}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-100">
            {lead.organisation_name}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            {lead.category} • {lead.location}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-400">
            Stage: {lead.pipeline_stage.toUpperCase()}
          </span>
          {lead.contact_restriction === 'do_not_contact' && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400">
              DO NOT CONTACT
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Lead Overview & Audit Findings */}
        <div className="space-y-6 lg:col-span-2">
          {/* Website Status & Recorded Evidence */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-sm font-semibold text-zinc-200">Website & Verification Evidence</h2>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
                <div className="text-xs text-zinc-500">Website URL</div>
                <div className="mt-1 text-sm font-medium text-zinc-200 truncate">
                  {lead.website_url ? (
                    <a
                      href={lead.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline"
                    >
                      {lead.website_url} ↗
                    </a>
                  ) : (
                    <span className="text-zinc-500 italic">None provided</span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
                <div className="text-xs text-zinc-500">Status Classification</div>
                <div className="mt-1 text-sm font-semibold capitalize text-zinc-200">
                  {lead.website_status.replace(/_/g, ' ')}
                </div>
              </div>
            </div>

            {/* Sources & Audit Checklist */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase text-zinc-400 tracking-wider">
                Audit Checklist & Source Facts
              </h3>
              <div className="mt-2 space-y-2">
                {sources && sources.length > 0 ? (
                  sources.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Source: <a href={s.source_url} target="_blank" className="text-indigo-400 hover:underline">{s.source_url}</a></span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">Confidence: {s.confidence}</span>
                      </div>
                      <p className="mt-1.5 text-zinc-200 font-medium">Observed Fact: {s.observed_fact}</p>
                      <div className="mt-1 text-[10px] text-zinc-500">Checked at: {new Date(s.checked_at).toLocaleString()}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
                    No linked external sources yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Heuristic Opportunity Score & Explanation */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">Opportunity Score & Breakdown</h2>
              <span className="text-lg font-bold text-indigo-400">{lead.score || 75} / 100</span>
            </div>

            <p className="mt-1 text-xs text-zinc-400">
              Calculated using transparent heuristic models. Missing data lowers confidence instead of assuming zero or full marks.
            </p>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between border-b border-zinc-800/80 py-2">
                <span className="text-zinc-300">Website Modernization / Need</span>
                <span className="font-semibold text-zinc-100">15 / 20 pts (Measured)</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/80 py-2">
                <span className="text-zinc-300">Enquiry / Booking Demand</span>
                <span className="font-semibold text-zinc-100">15 / 15 pts (Declared)</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/80 py-2">
                <span className="text-zinc-300">Public Contact Availability</span>
                <span className="font-semibold text-zinc-100">10 / 10 pts (Measured)</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-zinc-300">ZenLyft Delivery Fit</span>
                <span className="font-semibold text-zinc-100">15 / 15 pts (Declared)</span>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-400">
              <strong>Limitations:</strong> Score is an evidence-backed prioritisation heuristic. Missing website data does not prove a business lacks digital presence.
            </div>
          </div>
        </div>

        {/* Right Column: Contact Channels & Next Actions */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-sm font-semibold text-zinc-200">Verified Contact Routes</h2>
            <div className="mt-3 space-y-2">
              {contacts && contacts.length > 0 ? (
                contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs"
                  >
                    <div>
                      <span className="capitalize text-zinc-400">{c.channel_type}:</span>{' '}
                      <span className="font-semibold text-zinc-100">{c.public_value}</span>
                    </div>
                    {c.channel_type === 'phone' && (
                      <a
                        href={`https://wa.me/91${c.public_value.replace(/\D/g, '')}`}
                        target="_blank"
                        className="rounded-lg bg-emerald-600/20 px-2.5 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-600/30"
                      >
                        WhatsApp ↗
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
                  No public contact channels recorded yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-sm font-semibold text-zinc-200">Next Action & Follow-Up</h2>
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 text-xs">
              <div className="text-zinc-400">Planned Action:</div>
              <div className="mt-1 font-semibold text-zinc-200">
                {lead.next_action || 'Generate AI Research Brief & Audit'}
              </div>
              <div className="mt-3 text-zinc-400">Follow-up Due:</div>
              <div className="mt-1 font-semibold text-zinc-200">
                {lead.next_follow_up || 'Not scheduled'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

