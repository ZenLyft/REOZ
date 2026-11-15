import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionUserProfile, normalizeUserRole, hasPermission } from '@/lib/security/rbac';
import { DeveloperClient } from './DeveloperClient';

export const dynamic = 'force-dynamic';

export default async function DeveloperPage() {
  const supabase = createClient();
  const profile = await getSessionUserProfile(supabase);

  if (!profile) {
    redirect('/login');
  }

  // Developer page requires development.read_assigned permission
  if (!hasPermission(profile, 'development.read_assigned')) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-slate-100">
        <div className="max-w-md w-full bg-slate-800 border border-red-500/30 rounded-xl p-8 text-center shadow-xl">
          <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">
            403
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-slate-400 mb-6">
            Your role ({profile.role}) does not have permission to access the Developer Workstation.
          </p>
          <a
            href="/dashboard"
            className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const role = normalizeUserRole(profile.role);

  return <DeveloperClient currentUserRole={role} />;
}

