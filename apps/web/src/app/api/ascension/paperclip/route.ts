import { NextRequest, NextResponse } from 'next/server';
import { buildAscensionHeaders, getAscensionConfig } from '@/lib/integrations/ascension-client';
import { syncPipelineResultsToCrm } from '@/lib/integrations/ascension-sync';
import { runGlobalOsmDiscovery, safeParseJson } from '@/lib/integrations/global-discovery';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { apiUrl } = getAscensionConfig();
  if (!apiUrl) {
    return NextResponse.json({
      configured: false,
      ready: true,
      mode: 'built_in_discovery',
      routines_count: 6,
    });
  }
  try {
    const res = await fetch(`${apiUrl}/api/v1/paperclip/blueprint`, {
      headers: buildAscensionHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    const parsed = await safeParseJson<Record<string, unknown>>(res);
    if (!parsed.ok || !parsed.data) {
      return NextResponse.json({
        configured: true,
        ready: true,
        mode: 'built_in_fallback',
        routines_count: 6,
        note: `Render Paperclip waking up (HTTP ${res.status})`,
      });
    }
    return NextResponse.json(parsed.data, { status: res.status });
  } catch {
    return NextResponse.json({
      configured: Boolean(apiUrl),
      ready: true,
      mode: 'built_in_fallback',
      routines_count: 6,
    });
  }
}

export async function POST(req: NextRequest) {
  const { apiUrl } = getAscensionConfig();
  const headers = buildAscensionHeaders();

  try {
    const body = await req.json();
    const action = String(body.action || 'heartbeat');

    if (action === 'sync' && apiUrl) {
      const res = await fetch(`${apiUrl}/api/v1/paperclip/sync`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(8000),
      });
      const parsed = await safeParseJson(res);
      if (parsed.ok && parsed.data) {
        return NextResponse.json(parsed.data, { status: res.status });
      }
      return NextResponse.json(
        { error: `Render Paperclip returned non-JSON (HTTP ${res.status})` },
        { status: 502 }
      );
    }

    if (apiUrl) {
      try {
        const res = await fetch(`${apiUrl}/api/v1/paperclip/heartbeat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            runId: String(body.runId || `pc_ui_${Date.now()}`),
            agentId: String(body.agentId || 'asc-01'),
            region: String(body.region || 'global'),
            city: body.city ? String(body.city) : undefined,
            objective: body.objective ? String(body.objective) : undefined,
            limit: Number(body.limit || 6),
            context: {
              wakeReason: 'founder_paperclip_campaign',
              region: String(body.region || 'global'),
            },
          }),
          signal: AbortSignal.timeout(12000),
        });
        const parsed = await safeParseJson<{ pipeline_output?: Record<string, unknown> }>(res);
        if (parsed.ok && parsed.data) {
          const crmSync = await syncPipelineResultsToCrm(
            parsed.data.pipeline_output,
            String(body.region || body.city || 'Global')
          );
          return NextResponse.json({ ...parsed.data, crmSync }, { status: res.status });
        }
      } catch {
        // Fallback cleanly to built-in OpenStreetMap discovery
      }
    }

    const builtIn = await runGlobalOsmDiscovery({
      regionOrCity: String(body.city || body.region || 'global'),
      limit: Number(body.limit || 6),
    });

    return NextResponse.json({
      status: 'completed',
      engine: 'cloudflare_built_in',
      ...builtIn,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Paperclip orchestration request failed' },
      { status: 500 }
    );
  }
}
