import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { buildAscensionHeaders, getAscensionConfig } from '@/lib/integrations/ascension-client';

export const dynamic = 'force-dynamic';

const SETTINGS_ID = 'zenlyft-global-settings';

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
    const { data, error } = await admin
      .from('system_settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      settings: data || {
        id: SETTINGS_ID,
        autonomy_level: 3,
        emergency_stop_active: false,
        daily_discovery_limit: 100,
        active_market_country: 'Global (Worldwide)',
        active_market_regions: ['Americas', 'Europe & UK', 'Middle East & Africa', 'Asia-Pacific & India'],
        auto_pilot_enabled: true,
        auto_send_first_cold: true,
        notify_every_event: true,
        next_permission_founder_only: true,
      },
      integrations: {
        groqConfigured: Boolean(process.env.GROQ_API_KEY),
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        ascensionConfigured: Boolean(getAscensionConfig().apiUrl),
        whatsappPhone: process.env.OPENWA_BUSINESS_PHONE || '+91 80159 29139',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Founder sign-in required.' }, { status: 401 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {
      id: SETTINGS_ID,
      updated_at: new Date().toISOString(),
    };

    if (typeof body.autonomy_level === 'number') {
      // Levels 1-3 configurable by Founder (Level 3 = Auto 1st Cold Outreach; Level 4 custom contracts always gated)
      const lvl = Math.round(body.autonomy_level);
      updates.autonomy_level = lvl === 3 ? 3 : lvl === 2 ? 2 : 1;
      updates.evolution_api_auto_send = updates.autonomy_level === 3;
    }

    if (typeof body.auto_pilot_enabled === 'boolean') {
      updates.auto_pilot_enabled = body.auto_pilot_enabled;
    }

    if (typeof body.auto_send_first_cold === 'boolean') {
      updates.auto_send_first_cold = body.auto_send_first_cold;
      updates.evolution_api_auto_send = body.auto_send_first_cold;
    }

    if (typeof body.notify_every_event === 'boolean') {
      updates.notify_every_event = body.notify_every_event;
    }

    if (typeof body.next_permission_founder_only === 'boolean') {
      updates.next_permission_founder_only = body.next_permission_founder_only;
    }

    if (typeof body.emergency_stop_active === 'boolean') {
      updates.emergency_stop_active = body.emergency_stop_active;
    }

    if (typeof body.daily_discovery_limit === 'number' && Number.isFinite(body.daily_discovery_limit)) {
      updates.daily_discovery_limit = Math.max(10, Math.min(500, Math.round(body.daily_discovery_limit)));
    }

    if (typeof body.active_market_country === 'string' && body.active_market_country.trim()) {
      updates.active_market_country = body.active_market_country.trim().slice(0, 120);
    }

    if (Array.isArray(body.active_market_regions)) {
      updates.active_market_regions = body.active_market_regions
        .map((r: unknown) => String(r).trim())
        .filter(Boolean)
        .slice(0, 20);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('system_settings')
      .upsert(updates, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mirror emergency stop state to Ascension Cloud backend if configured
    if (typeof body.emergency_stop_active === 'boolean') {
      const { apiUrl } = getAscensionConfig();
      if (apiUrl) {
        try {
          await fetch(`${apiUrl}/api/v1/security/kill-switch`, {
            method: 'POST',
            headers: buildAscensionHeaders(),
            body: JSON.stringify({
              engaged: body.emergency_stop_active,
              reason: body.emergency_stop_active
                ? 'Founder activated Master Emergency Stop'
                : 'Founder restored autonomous operation',
            }),
          });
        } catch {
          // Local DB safeguard remains authoritative even if cloud backend is sleeping
        }
      }
    }

    await logAuditEvent({
      actorType: 'user',
      actorId: user.id,
      action:
        typeof body.emergency_stop_active === 'boolean'
          ? body.emergency_stop_active
            ? 'system.emergency_stop_activated'
            : 'system.emergency_stop_deactivated'
          : 'system.settings_updated',
      objectType: 'system_settings',
      objectId: SETTINGS_ID,
      result: 'success',
      metadata: updates,
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/whatsapp');

    return NextResponse.json({ success: true, settings: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

