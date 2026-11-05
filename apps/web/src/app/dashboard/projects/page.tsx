import { ProjectsClient } from './ProjectsClient';

export const dynamic = 'force-dynamic';

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Client Onboarding & Project Delivery
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Track customer onboarding, milestone execution, requirements collection, and project handovers across won deals.
        </p>
      </div>

      <ProjectsClient />
    </div>
  );
}

