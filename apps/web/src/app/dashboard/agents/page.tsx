import { AgentsClient } from './AgentsClient';

export const dynamic = 'force-dynamic';

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <AgentsClient />
    </div>
  );
}
