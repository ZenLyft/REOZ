import { NextRequest, NextResponse } from 'next/server';
import { buildAscensionHeaders, getAscensionConfig } from '@/lib/integrations/ascension-client';
import { syncPipelineResultsToCrm } from '@/lib/integrations/ascension-sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { apiUrl } = getAscensionConfig();
  if (!apiUrl) {
    return NextResponse.json({ error: 'ASCENSION_API_URL is NOT_CONFIGURED.' }, { status: 503 });
  }
  try {
    const res = await fetch(`${apiUrl}/api/v1/paperclip/blueprint`, {
      headers: buildAscensionHeaders(),
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to fetch Paperclip blueprint' },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { apiUrl } = getAscensionConfig();
  if (!apiUrl) {
    return NextResponse.json({ error: 'ASCENSION_API_URL is NOT_CONFIGURED.' }, { status: 503 });
  }
  try {
    const body = await req.json();
    const action = String(body.action || 'heartbeat');
    const headers = buildAscensionHeaders();

    if (action === 'sync') {
      const res = await fetch(`${apiUrl}/api/v1/paperclip/sync`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

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
    });
    const data = await res.json();
    const crmSync = res.ok
      ? await syncPipelineResultsToCrm(data?.pipeline_output, String(body.region || body.city || 'Global'))
      : undefined;
    return NextResponse.json(crmSync ? { ...data, crmSync } : data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Paperclip orchestration request failed' },
      { status: 502 }
    );
  }
}

