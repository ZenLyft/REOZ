import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { notifyFounder } from '@/lib/integrations/web-push';

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

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error } = await admin.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        device_label: deviceLabel,
        user_agent: ua.slice(0, 300),
        is_active: true,
        updated_at: now,
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const notifyRes = await notifyFounder({
      category: 'system',
      title: 'REOZ iPhone Alerts Activated',
      body: 'Every new prospect, auto-sent 1st cold message, and reply permission will arrive here live.',
      url: '/dashboard/approvals',
    });

    return NextResponse.json({
      success: true,
      device_label: deviceLabel,
      pushedCount: notifyRes.pushedCount,
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

    const admin = createAdminClient();
    await admin
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('endpoint', endpoint);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unsubscribe failed' },
      { status: 500 }
    );
  }
}

