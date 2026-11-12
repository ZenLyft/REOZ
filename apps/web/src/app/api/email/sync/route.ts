import { NextRequest, NextResponse } from 'next/server';
import { syncZohoInboxNow } from '@/lib/integrations/zoho-store';
import {
  proxyAscensionZohoIfLocalUnconfigured,
  requireFounderSession,
} from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = await requireFounderSession(req, { requireFounderRole: true, maxRequests: 12 });
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const proxied = await proxyAscensionZohoIfLocalUnconfigured({
    path: '/api/email/sync',
    method: 'POST',
    body,
  });
  if (proxied.proxied) {
    return NextResponse.json(proxied.json, { status: proxied.status || 200 });
  }

  try {
    const result = await syncZohoInboxNow(gate.admin, {
      force: Boolean(body?.force),
      maxPages: body?.maxPages ? Number(body.maxPages) : 3,
    });
    return NextResponse.json({ success: result.status === 'CONNECTED', ...result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Email sync failed.' },
      { status: err?.status || 500 }
    );
  }
}

