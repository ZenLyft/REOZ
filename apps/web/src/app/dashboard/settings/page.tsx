import { createClient } from '@/lib/supabase/server';
import { getAscensionConfig } from '@/lib/integrations/ascension-client';
import { getVapidConfig } from '@/lib/integrations/web-push';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = createClient();

  const [{ data: settings }, { count: devicesCount }] = await Promise.all([
    supabase
      .from('system_settings')
      .select('*')
      .eq('id', 'zenlyft-global-settings')
      .maybeSingle(),
    supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
  ]);

  const { publicKey, privateKey } = getVapidConfig();

  const initialSettings = {
    autonomy_level: settings?.autonomy_level ?? 3,
    emergency_stop_active: Boolean(settings?.emergency_stop_active),
    daily_discovery_limit: settings?.daily_discovery_limit ?? 100,
    active_market_country: settings?.active_market_country || 'Global (Worldwide)',
    auto_pilot_enabled: settings?.auto_pilot_enabled ?? true,
    auto_send_first_cold: settings?.auto_send_first_cold ?? true,
    notify_every_event: settings?.notify_every_event ?? true,
    next_permission_founder_only: settings?.next_permission_founder_only ?? true,
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    ascensionConfigured: Boolean(getAscensionConfig().apiUrl),
    whatsappPhone: process.env.OPENWA_BUSINESS_PHONE || '+91 80159 29139',
    vapidConfigured: Boolean(publicKey && privateKey),
    pairedDevicesCount: devicesCount ?? 0,
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
    </div>
  );
}
