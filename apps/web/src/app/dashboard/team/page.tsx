import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionUserProfile, normalizeUserRole } from '@/lib/security/rbac';
import { TeamClient } from './TeamClient';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const supabase = createClient();
  const profile = await getSessionUserProfile(supabase);

  if (!profile) {
    redirect('/login');
  }

  const role = normalizeUserRole(profile.role);

  return <TeamClient currentUserRole={role} />;
}

