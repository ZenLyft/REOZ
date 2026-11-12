import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  listActivePushSubscriptions,
  listFounderNotifications,
  markFounderNotificationsRead,
  resolveVapidConfig,
} from '@/lib/integrations/web-push';

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

    const [vapid, feed, subscriptions] = await Promise.all([
      resolveVapidConfig(),
      listFounderNotifications(35),
      listActivePushSubscriptions(),
    ]);

    return NextResponse.json({
      success: true,
      vapidConfigured: Boolean(vapid.publicKey && vapid.privateKey),
      vapidPublicKey: vapid.publicKey || null,
      vapidSource: vapid.source,
      subscribedDevicesCount: subscriptions.length,
      devices: subscriptions.map((s) => ({
        id: s.id,
        device_label: s.device_label,
        last_notified_at: s.last_notified_at,
        created_at: s.created_at,
      })),
      unreadCount: feed.unreadCount,
      notifications: feed.notifications,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unable to load notifications',
      },
      { status: 500 }
    );
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

    const body = await req.json().catch(() => ({}));
    await markFounderNotificationsRead({
      markAllRead: Boolean(body?.markAllRead),
      ids: Array.isArray(body?.ids) ? body.ids.map(String) : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update notifications' },
      { status: 500 }
    );
  }
}
