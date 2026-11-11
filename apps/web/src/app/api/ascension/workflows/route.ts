import { NextRequest, NextResponse } from 'next/server';
import { buildAscensionHeaders, getAscensionConfig } from '@/lib/integrations/ascension-client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { apiUrl } = getAscensionConfig();
  if (!apiUrl) {
    return NextResponse.json(
      { error: 'ASCENSION_API_URL is NOT_CONFIGURED.' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const action = String(body.action || 'run');
    const headers = buildAscensionHeaders();

    if (action === 'kill_switch') {
      const res = await fetch(`${apiUrl}/api/v1/security/kill-switch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ engaged: Boolean(body.engaged), reason: String(body.reason || 'Founder console toggle') }),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (action === 'approve') {
      const threadId = String(body.thread_id || '');
      if (!threadId) return NextResponse.json({ error: 'Missing thread_id' }, { status: 400 });
      const res = await fetch(`${apiUrl}/api/v1/approvals/${encodeURIComponent(threadId)}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          approved: Boolean(body.approved),
          approval_hash: String(body.approval_hash || ''),
          actor: 'founder',
        }),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    const res = await fetch(`${apiUrl}/api/v1/workflows/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        objective: String(body.objective || 'Discover & qualify HOMS institutional leads'),
        city: String(body.city || 'Coimbatore'),
        limit: Number(body.limit || 5),
      }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ascension backend call failed' },
      { status: 502 }
    );
  }
}

