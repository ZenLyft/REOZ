import { NextRequest, NextResponse } from 'next/server';
import { buildAscensionHeaders, getAscensionConfig } from '@/lib/integrations/ascension-client';
import { syncPipelineResultsToCrm } from '@/lib/integrations/ascension-sync';
import {
  resolveDiscoveryCity,
  runGlobalOsmDiscovery,
  safeParseJson,
} from '@/lib/integrations/global-discovery';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SETTINGS_ID = 'zenlyft-global-settings';

async function isEmergencyStopActive(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('system_settings')
      .select('emergency_stop_active')
      .eq('id', SETTINGS_ID)
      .maybeSingle();
    return Boolean((data as { emergency_stop_active?: boolean } | null)?.emergency_stop_active);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const { apiUrl } = getAscensionConfig();
  const headers = buildAscensionHeaders();

  try {
    const body = await req.json();
    const action = String(body.action || 'run');

    if (action === 'kill_switch') {
      const engaged = Boolean(body.engaged);
      const reason = String(body.reason || 'Founder console toggle');

      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createAdminClient();
        await admin.from('system_settings').upsert(
          {
            id: SETTINGS_ID,
            emergency_stop_active: engaged,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      }

      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/v1/security/kill-switch`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ engaged, reason }),
            signal: AbortSignal.timeout(6000),
          });
          const parsed = await safeParseJson(res);
          if (parsed.ok && parsed.data) {
            return NextResponse.json(parsed.data, { status: res.status });
          }
        } catch {
          // Persist locally even if Render is sleeping
        }
      }

      return NextResponse.json({
        success: true,
        emergency_stop: engaged,
        reason,
      });
    }

    if (action === 'approve') {
      const threadId = String(body.thread_id || '');
      if (!threadId) return NextResponse.json({ error: 'Missing thread_id' }, { status: 400 });
      if (!apiUrl) {
        return NextResponse.json({ error: 'Cloud approval endpoint unavailable.' }, { status: 503 });
      }
      const res = await fetch(`${apiUrl}/api/v1/approvals/${encodeURIComponent(threadId)}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          approved: Boolean(body.approved),
          approval_hash: String(body.approval_hash || ''),
          actor: 'founder',
        }),
        signal: AbortSignal.timeout(8000),
      });
      const parsed = await safeParseJson(res);
      if (!parsed.data) {
        return NextResponse.json(
          { error: `Cloud engine returned non-JSON (HTTP ${res.status})` },
          { status: 502 }
        );
      }
      return NextResponse.json(parsed.data, { status: res.status });
    }

    // action === 'run'
    if (await isEmergencyStopActive()) {
      return NextResponse.json(
        { error: 'Automation is currently paused. Click "Resume Auto-Finder" first.' },
        { status: 403 }
      );
    }

    const regionOrCity = String(body.city || body.region || 'global');
    const resolvedCity = resolveDiscoveryCity(regionOrCity);
    const objective = String(
      body.objective || `Discover & qualify colleges and hostels in ${resolvedCity} for ZenLyft HOMS`
    );
    const limit = Number(body.limit || 6);

    // 1. Try Render Ascension Cloud Engine if configured, safely parsing non-JSON/HTML errors
    if (apiUrl) {
      try {
        const res = await fetch(`${apiUrl}/api/v1/workflows/run`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            objective,
            city: resolvedCity,
            limit,
          }),
          signal: AbortSignal.timeout(12000),
        });
        const parsed = await safeParseJson<{
          pipeline_output?: Record<string, unknown>;
          qualified_leads?: Array<Record<string, unknown>>;
        }>(res);

        if (parsed.ok && parsed.data) {
          const pipelineOut = parsed.data.pipeline_output;
          const rawQualified = Array.isArray(pipelineOut?.qualified_leads)
            ? (pipelineOut.qualified_leads as Array<Record<string, unknown>>)
            : [];

          if (rawQualified.length > 0) {
            const crmSync = await syncPipelineResultsToCrm(pipelineOut, resolvedCity);
            return NextResponse.json({
              status: 'completed',
              engine: 'render_cloud',
              city: resolvedCity,
              qualified_leads: crmSync.leads.map((l) => ({
                organisation_name: l.organisation_name,
                location: l.city,
                category: l.category,
                homs_score: l.homs_score,
                recommended_package: l.recommended_product,
                whatsapp_draft: l.draft_message || '',
              })),
              crm_sync: {
                saved_leads: crmSync.savedLeadsCount,
                skipped_duplicates: crmSync.skippedDuplicates,
                created_approvals: crmSync.queuedApprovalsCount,
              },
            });
          }
        }
      } catch {
        // Render cold start, timeout, or HTML 502/503 — fall through seamlessly to built-in discovery
      }
    }

    // 2. Built-in Cloudflare-native OpenStreetMap discovery + Supabase CRM & Approvals sync
    const builtInResult = await runGlobalOsmDiscovery({
      regionOrCity,
      limit,
    });

    return NextResponse.json({
      status: 'completed',
      engine: 'cloudflare_built_in',
      ...builtInResult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Discovery run failed' },
      { status: 500 }
    );
  }
}
