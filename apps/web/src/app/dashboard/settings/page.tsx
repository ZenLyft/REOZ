import { Suspense } from 'react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAscensionConfig } from '@/lib/integrations/ascension-client';
import { listActivePushSubscriptions, resolveVapidConfig } from '@/lib/integrations/web-push';
import { getZohoPublicStatus } from '@/lib/integrations/zoho-store';
import { SettingsClient } from './SettingsClient';
import { ZohoIntegrationCard } from './ZohoIntegrationCard';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = createClient();
  const admin = createAdminClient();

  const [{ data: settings }, { data: flagFact }, subscriptions, vapid, zohoStatus] = await Promise.all([
    supabase
      .from('system_settings')
      .select('*')
      .eq('id', 'zenlyft-global-settings')
      .maybeSingle(),
    admin
      .from('ascension_memory_facts')
      .select('metadata')
      .eq('fact_id', 'reoz_autopilot_flags')
      .maybeSingle(),
    listActivePushSubscriptions(),
    resolveVapidConfig(),
    getZohoPublicStatus(admin).catch(() => null),
  ]);

  const flags = (flagFact?.metadata || {}) as {
    auto_pilot_enabled?: boolean;
    auto_send_first_cold?: boolean;
    notify_every_event?: boolean;
    next_permission_founder_only?: boolean;
  };

  const level = settings?.autonomy_level ?? 3;
  const initialSettings = {
    autonomy_level: level,
    emergency_stop_active: Boolean(settings?.emergency_stop_active),
    daily_discovery_limit: settings?.daily_discovery_limit ?? 100,
    active_market_country: settings?.active_market_country || 'Global (Worldwide)',
    auto_pilot_enabled: settings?.auto_pilot_enabled ?? flags.auto_pilot_enabled ?? true,
    auto_send_first_cold:
      settings?.auto_send_first_cold ??
      flags.auto_send_first_cold ??
      (level >= 3 || Boolean(settings?.evolution_api_auto_send)),
    notify_every_event: settings?.notify_every_event ?? flags.notify_every_event ?? true,
    next_permission_founder_only:
      settings?.next_permission_founder_only ?? flags.next_permission_founder_only ?? true,
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    ascensionConfigured: Boolean(getAscensionConfig().apiUrl),
    whatsappPhone: process.env.OPENWA_BUSINESS_PHONE || '+91 80159 29139',
    vapidConfigured: Boolean(vapid.publicKey && vapid.privateKey),
    pairedDevicesCount: subscriptions.length,
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4E7EC] pb-5">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#151B2B]">
          Autonomy, Founder Permissions & iPhone PWA
        </h1>
        <p className="mt-1 text-sm text-[#525A6B]">
          Configure 24/7 autonomous discovery & 1st cold WhatsApp dispatch, iPhone lock-screen alerts, and Founder-only access for next steps.
        </p>
      </div>

      <SettingsClient initialSettings={initialSettings} />

      <Suspense fallback={null}>
        <ZohoIntegrationCard initialStatus={zohoStatus} />
      </Suspense>
    </div>
  );
}
