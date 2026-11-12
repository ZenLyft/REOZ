import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getVapidConfig } from '@/lib/integrations/web-push';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { publicKey, privateKey } = getVapidConfig();

    const [{ data: notifications }, { data: subscriptions }] = await Promise.all([
      admin
        .from('founder_notifications')
        .select('id, category, title, body, url, lead_id, approval_id, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(30),
      admin
        .from('push_subscriptions')
        .select('id, device_label, last_notified_at, created_at')
        .eq('is_active', true),
    ]);

    const list = notifications || [];
    const unreadCount = list.filter((n: { read_at?: string | null }) => !n.read_at).length;

    return NextResponse.json({
      success: true,
      vapidConfigured: Boolean(publicKey && privateKey),
      vapidPublicKey: publicKey || null,
      subscribedDevicesCount: (subscriptions || []).length,
      devices: subscriptions || [],
      unreadCount,
      notifications: list,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      success: true,
      vapidConfigured: Boolean(getVapidConfig().publicKey && getVapidConfig().privateKey),
      vapidPublicKey: getVapidConfig().publicKey || null,
      subscribedDevicesCount: 0,
      devices: [],
      unreadCount: 0,
      notifications: [],
      warning: err instanceof Error ? err.message : 'Run migration 20261112000002 to enable persistent push feed.',
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const admin = createAdminClient();
    const now = new Date().toISOString();

    if (body.markAllRead) {
      await admin
        .from('founder_notifications')
        .update({ read_at: now })
        .is('read_at', null);
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      await admin
        .from('founder_notifications')
        .update({ read_at: now })
        .in('id', body.ids);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update notifications' },
      { status: 500 }
    );
  }
}

