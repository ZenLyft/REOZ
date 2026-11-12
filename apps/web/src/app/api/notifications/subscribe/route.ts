import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  deactivatePushSubscription,
  notifyFounder,
  upsertPushSubscription,
} from '@/lib/integrations/web-push';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Founder login required.' }, { status: 401 });
    }

    const body = await req.json();
    const endpoint = String(body?.endpoint || '').trim();
    const p256dh = String(body?.keys?.p256dh || body?.p256dh || '').trim();
    const auth = String(body?.keys?.auth || body?.auth || '').trim();

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'Invalid push subscription payload (missing endpoint/p256dh/auth).' },
        { status: 400 }
      );
    }

    const ua = req.headers.get('user-agent') || '';
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const deviceLabel =
      String(body?.device_label || '').trim() ||
      (isIos ? 'Founder iPhone PWA' : 'Founder Browser PWA');

    const saved = await upsertPushSubscription({
      userId: user.id,
      endpoint,
      p256dh,
      auth,
      deviceLabel,
      userAgent: ua,
    });

    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error || 'Could not save device subscription.' },
        { status: 500 }
      );
    }

    // Only dispatch confirmation alert if explicitly requested (new pairing vs silent refresh)
    let pushedCount = 0;
    if (body?.silent !== true) {
      const notifyRes = await notifyFounder({
        category: 'system',
        title: 'REOZ Push Alerts Activated',
        body: 'Live alerts armed: new prospects, autonomous 1st cold WhatsApp sends, and reply approvals will notify this device.',
        url: '/dashboard/approvals',
      });
      pushedCount = notifyRes.pushedCount;
    }

    return NextResponse.json({
      success: true,
      device_label: deviceLabel,
      pushedCount,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Subscription save failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || '').trim();
    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    await deactivatePushSubscription(endpoint);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unsubscribe failed' },
      { status: 500 }
    );
  }
}
