import { createAdminClient } from '@/lib/supabase/server';
import { REGION_HUBS, runGlobalOsmDiscovery } from './global-discovery';
import { notifyFounder } from './web-push';

export interface AutopilotRunSummary {
  status: 'completed' | 'paused' | 'skipped';
  region: string;
  city: string;
  discovered_count: number;
  saved_leads: number;
  skipped_duplicates: number;
  first_cold_auto_sent: number;
  queued_for_founder: number;
  notifications_pushed: number;
  reason?: string;
}

const SETTINGS_ID = 'zenlyft-global-settings';
const ROTATION_REGIONS = Object.keys(REGION_HUBS);

/** Picks a rotating global region based on current 2-hour block so cron covers all continents automatically. */
export function pickAutomatedRegion(explicitRegion?: string): string {
  if (explicitRegion && explicitRegion.trim()) {
    return explicitRegion.trim();
  }
  const slot = Math.floor(Date.now() / (2 * 60 * 60 * 1000)) % ROTATION_REGIONS.length;
  return ROTATION_REGIONS[slot] || 'global';
}

export async function getAutopilotSettings() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      autonomy_level: 3,
      emergency_stop_active: false,
      auto_pilot_enabled: true,
      auto_send_first_cold: true,
      notify_every_event: true,
      next_permission_founder_only: true,
    };
  }

  try {
    const admin = createAdminClient();
    const [{ data }, { data: flagFact }] = await Promise.all([
      admin.from('system_settings').select('*').eq('id', SETTINGS_ID).maybeSingle(),
      admin
        .from('ascension_memory_facts')
        .select('metadata')
        .eq('fact_id', 'reoz_autopilot_flags')
        .maybeSingle(),
    ]);

    const row = (data || {}) as {
      autonomy_level?: number;
      emergency_stop_active?: boolean;
      evolution_api_auto_send?: boolean;
      auto_pilot_enabled?: boolean;
      auto_send_first_cold?: boolean;
      notify_every_event?: boolean;
      next_permission_founder_only?: boolean;
    };

    const flags = (flagFact?.metadata || {}) as {
      auto_pilot_enabled?: boolean;
      auto_send_first_cold?: boolean;
      notify_every_event?: boolean;
      next_permission_founder_only?: boolean;
    };

    const level = row.autonomy_level ?? 3;
    return {
      autonomy_level: level,
      emergency_stop_active: Boolean(row.emergency_stop_active),
      auto_pilot_enabled: row.auto_pilot_enabled ?? flags.auto_pilot_enabled ?? true,
      auto_send_first_cold:
        row.auto_send_first_cold ??
        flags.auto_send_first_cold ??
        (level >= 3 || Boolean(row.evolution_api_auto_send)),
      notify_every_event: row.notify_every_event ?? flags.notify_every_event ?? true,
      next_permission_founder_only:
        row.next_permission_founder_only ?? flags.next_permission_founder_only ?? true,
    };
  } catch {
    return {
      autonomy_level: 3,
      emergency_stop_active: false,
      auto_pilot_enabled: true,
      auto_send_first_cold: true,
      notify_every_event: true,
      next_permission_founder_only: true,
    };
  }
}

/**
 * Executes a full 100% hands-free discovery + autonomous 1st cold outreach + iPhone PWA alert cycle.
 * Next steps (replies, custom pricing, onboarding, contracts) always remain Founder-gated.
 */
export async function runAutonomousRevenueCycle(options?: {
  regionOrCity?: string;
  limit?: number;
  source?: string;
}): Promise<AutopilotRunSummary> {
  const settings = await getAutopilotSettings();
  const region = pickAutomatedRegion(options?.regionOrCity);

  if (settings.emergency_stop_active) {
    return {
      status: 'paused',
      region,
      city: 'N/A',
      discovered_count: 0,
      saved_leads: 0,
      skipped_duplicates: 0,
      first_cold_auto_sent: 0,
      queued_for_founder: 0,
      notifications_pushed: 0,
      reason: 'Master Emergency Stop is active.',
    };
  }

  if (!settings.auto_pilot_enabled && !options?.regionOrCity) {
    return {
      status: 'skipped',
      region,
      city: 'N/A',
      discovered_count: 0,
      saved_leads: 0,
      skipped_duplicates: 0,
      first_cold_auto_sent: 0,
      queued_for_founder: 0,
      notifications_pushed: 0,
      reason: '24/7 Autopilot toggle is currently disabled in Settings.',
    };
  }

  const discovery = await runGlobalOsmDiscovery({
    regionOrCity: region,
    limit: options?.limit || 6,
  });

  let pushed = 0;
  if (discovery.crm_sync.saved_leads > 0 || discovery.crm_sync.first_cold_auto_sent > 0) {
    const pushRes = await notifyFounder({
      category: discovery.crm_sync.first_cold_auto_sent > 0 ? 'first_cold_sent' : 'discovery',
      title:
        discovery.crm_sync.first_cold_auto_sent > 0
          ? `Autopilot Sent ${discovery.crm_sync.first_cold_auto_sent} 1st Cold WhatsApp`
          : `${discovery.crm_sync.saved_leads} New Prospects Found (${discovery.city})`,
      body: `City: ${discovery.city} • Saved: ${discovery.crm_sync.saved_leads} • 1st Cold Sent: ${discovery.crm_sync.first_cold_auto_sent} • Next Permission Queued: ${discovery.crm_sync.created_approvals}`,
      url:
        discovery.crm_sync.created_approvals > 0
          ? '/dashboard/approvals'
          : '/dashboard/whatsapp',
      metadata: {
        source: options?.source || 'autopilot_cycle',
        city: discovery.city,
        region,
        saved_leads: discovery.crm_sync.saved_leads,
        first_cold_auto_sent: discovery.crm_sync.first_cold_auto_sent,
        queued_for_founder: discovery.crm_sync.created_approvals,
      },
    });
    pushed += pushRes.pushedCount;
  }

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    try {
      const admin = createAdminClient();
      await admin.from('agent_executions').insert({
        agent_name: 'reoz-24x7-autopilot',
        command: `autonomous_sweep:${options?.source || 'cron'}:${discovery.city}`,
        status: 'success',
        result_summary: `Found ${discovery.qualified_leads.length}, saved ${discovery.crm_sync.saved_leads}, auto-sent ${discovery.crm_sync.first_cold_auto_sent} 1st cold WhatsApp(s).`,
        data_payload: {
          region,
          city: discovery.city,
          ...discovery.crm_sync,
        },
      });
    } catch {
      // Non-fatal telemetry insert
    }
  }

  return {
    status: 'completed',
    region,
    city: discovery.city,
    discovered_count: discovery.qualified_leads.length,
    saved_leads: discovery.crm_sync.saved_leads,
    skipped_duplicates: discovery.crm_sync.skipped_duplicates,
    first_cold_auto_sent: discovery.crm_sync.first_cold_auto_sent,
    queued_for_founder: discovery.crm_sync.created_approvals,
    notifications_pushed: pushed,
  };
}
