import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyFounder, getVapidConfig } from '@/lib/integrations/web-push';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { publicKey, privateKey } = getVapidConfig();
  const res = await notifyFounder({
    category: 'permission_required',
    title: 'REOZ Autopilot Test Alert',
    body: 'Founder push alert confirmed! All cold sends, replies, and approvals notify your iPhone live.',
    url: '/dashboard/approvals',
  });

  return NextResponse.json({
    success: true,
    stored: res.stored,
    pushedCount: res.pushedCount,
    vapidConfigured: Boolean(publicKey && privateKey),
  });
}

