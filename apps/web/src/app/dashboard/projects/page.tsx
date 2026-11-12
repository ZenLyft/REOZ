import { createClient } from '@/lib/supabase/server';
import { ProjectsClient } from './ProjectsClient';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const supabase = createClient();

  const [{ data: projects }, { data: eligibleLeads }] = await Promise.all([
    supabase
      .from('projects')
      .select('*, clients(*), project_milestones(*), invoices(*)')
      .order('created_at', { ascending: false }),
    supabase
      .from('leads')
      .select('id, organisation_name, location, category, pipeline_stage, service_interest')
      .in('pipeline_stage', ['qualified', 'contacted', 'replied', 'proposal', 'won'])
      .order('score', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E5DDD0] pb-5">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#11100E]">
          Client Onboarding & Delivery
        </h1>
        <p className="mt-1 text-sm text-[#5A554C]">
          Convert qualified or won prospects into live client workspaces with milestone tracking and automated invoice creation.
        </p>
      </div>

      <ProjectsClient
        initialProjects={(projects as any[]) || []}
        eligibleLeads={(eligibleLeads as any[]) || []}
      />
    </div>
  );
}
