import { createClient } from '@/lib/supabase/server';
import { getAscensionConfig } from '@/lib/integrations/ascension-client';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = createClient();

  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('id', 'zenlyft-global-settings')
    .maybeSingle();

  const initialSettings = {
    autonomy_level: settings?.autonomy_level ?? 1,
    emergency_stop_active: Boolean(settings?.emergency_stop_active),
    daily_discovery_limit: settings?.daily_discovery_limit ?? 100,
    active_market_country: settings?.active_market_country || 'Global (Worldwide)',
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    ascensionConfigured: Boolean(getAscensionConfig().apiUrl),
    whatsappPhone: process.env.OPENWA_BUSINESS_PHONE || '+91 80159 29139',
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E5DDD0] pb-5">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#11100E]">
          Autonomy, Safety & Governance
        </h1>
        <p className="mt-1 text-sm text-[#5A554C]">
          Real-time system controls persisted to Supabase `system_settings`. Master Emergency Stop immediately halts all outbound sends across API & OpenWA.
        </p>
      </div>

      <SettingsClient initialSettings={initialSettings} />
    </div>
  );
}
