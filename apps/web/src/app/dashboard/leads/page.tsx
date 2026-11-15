import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionUserProfile, hasPermission } from '@/lib/security/rbac';
import { LeadsTableClient } from './LeadsTableClient';
import { LeadsHeaderActions } from './LeadsHeaderActions';
import { ExistingLeadRef } from '@/lib/crm/leads';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const supabase = createClient();
  const profile = await getSessionUserProfile(supabase);

  if (!profile) {
    redirect('/login');
  }

  const canReadAll = hasPermission(profile, 'leads.read_all');
  const canReadAssigned = hasPermission(profile, 'leads.read_assigned');

  if (!canReadAll && !canReadAssigned) {
    return (
      <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-8 rounded-2xl text-center max-w-lg mx-auto shadow-sm space-y-3">
        <span className="text-3xl">🔒</span>
        <h2 className="text-lg font-black text-[#151B2B]">Restricted Access</h2>
        <p className="text-xs text-[#525A6B]">
          You do not have permission to view prospect leads or customer records. Contact your administrator to request access.
        </p>
      </div>
    );
  }

  let query = supabase
    .from('leads')
    .select(
      'id, organisation_name, category, location, website_url, website_status, pipeline_stage, contact_restriction, next_action, score, created_at, normalised_name, website_domain, owner_id'
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  // If marketing/sales member without read_all, restrict strictly to their assigned leads
  if (!canReadAll && canReadAssigned) {
    query = query.eq('owner_id', profile.id);
  }

  const { data: leads, error } = await query;

  const canAssign = hasPermission(profile, 'leads.assign');
  let teamMembers: Array<{ id: string; name: string; email: string; role: string; department: string }> = [];

  if (canAssign) {
    const { data: members } = await supabase
      .from('profiles')
      .select('id, name, email, role, department')
      .neq('status', 'suspended')
      .order('name');
    teamMembers = members || [];
  }

  const existingLeadRefs: ExistingLeadRef[] = (leads || []).map((l) => ({
    id: l.id,
    organisation_name: l.organisation_name,
    normalised_name: l.normalised_name || '',
    website_domain: l.website_domain,
    phone: null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E4E7EC] pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#151B2B]">
            Prospects & Leads
          </h1>
          <p className="mt-1 text-sm text-[#525A6B]">
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
        <LeadsTableClient initialLeads={leads || []} canAssign={canAssign} teamMembers={teamMembers} />
      )}
    </div>
  );
}
