import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyFounder, resolveVapidConfig } from '@/lib/integrations/web-push';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const vapid = await resolveVapidConfig();
  const res = await notifyFounder({
    category: 'permission_required',
    title: 'REOZ Autopilot Test Alert',
    body: 'Founder notification test confirmed! All cold sends, prospect replies, and approvals alert your device live.',
    url: '/dashboard/approvals',
  });

  return NextResponse.json({
    success: true,
    stored: res.stored,
    pushedCount: res.pushedCount,
    totalDevices: res.totalDevices,
    errors: res.errors || [],
    vapidConfigured: Boolean(vapid.publicKey && vapid.privateKey),
  });
}
