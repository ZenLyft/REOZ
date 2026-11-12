import { createClient } from '@/lib/supabase/server';
import { LeadsTableClient } from './LeadsTableClient';
import { LeadsHeaderActions } from './LeadsHeaderActions';
import { ExistingLeadRef } from '@/lib/crm/leads';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const supabase = createClient();

  const { data: leads, error } = await supabase
    .from('leads')
    .select(
      'id, organisation_name, category, location, website_url, website_status, pipeline_stage, contact_restriction, next_action, score, created_at, normalised_name, website_domain'
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const existingLeadRefs: ExistingLeadRef[] = (leads || []).map((l) => ({
    id: l.id,
    organisation_name: l.organisation_name,
    normalised_name: l.normalised_name || '',
    website_domain: l.website_domain,
    phone: null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5DDD0] pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#11100E]">
            Prospects & Leads
          </h1>
          <p className="mt-1 text-sm text-[#5A554C]">
            Track, qualify, and convert opportunities across colleges, hostels, and local businesses worldwide.
          </p>
        </div>

        <LeadsHeaderActions existingLeads={existingLeadRefs} />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load leads from database: {error.message}
        </div>
      ) : (
        <LeadsTableClient initialLeads={leads || []} />
      )}
    </div>
  );
}
