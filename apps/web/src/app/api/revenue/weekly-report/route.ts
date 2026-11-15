import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSessionUserProfile, enforcePermission } from '@/lib/security/rbac';
import { generateWeeklyReportFromData } from '@/lib/crm/weekly-report';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Confidential financial report: strictly requires finance.read
    enforcePermission(profile, 'finance.read');

    const admin = createAdminClient();

    const [
      { data: leads },
      { data: projects },
      { data: invoices },
      { data: payments },
      { data: onboardingProjects },
    ] = await Promise.all([
      admin.from('leads').select('*').is('archived_at', null),
      admin.from('projects').select('*'),
      admin.from('invoices').select('*'),
      admin.from('payments').select('*'),
      admin.from('onboarding_projects').select('*'),
    ]);

    const report = generateWeeklyReportFromData({
      leads: leads || [],
      projects: projects || [],
      invoices: invoices || [],
      payments: payments || [],
      onboardingProjects: onboardingProjects || [],
    });

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    const status = err.status || (err.code === 'FORBIDDEN' ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

