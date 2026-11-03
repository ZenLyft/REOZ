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
      {/* Page Title & Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Prospects & Leads</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Track, qualify, and advance opportunities across local businesses and institutions.
          </p>
        </div>

        <LeadsHeaderActions existingLeads={existingLeadRefs} />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          Failed to load leads from database: {error.message}
        </div>
      ) : (
        <LeadsTableClient initialLeads={leads || []} />
      )}
    </div>
  );
}

