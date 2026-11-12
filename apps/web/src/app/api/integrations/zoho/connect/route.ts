import { NextRequest, NextResponse } from 'next/server';
import { createZohoOAuthState } from '@/lib/integrations/zoho-store';
import {
  proxyAscensionZohoIfLocalUnconfigured,
  requireFounderSession,
} from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await requireFounderSession(req, { requireFounderRole: true, maxRequests: 15 });
  if (!gate.ok) return gate.response;

  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/dashboard/settings';
  const redirectMode = req.nextUrl.searchParams.get('redirect') === 'true';

  const proxied = await proxyAscensionZohoIfLocalUnconfigured({
    path: `/api/integrations/zoho/connect?returnTo=${encodeURIComponent(returnTo)}&userId=${encodeURIComponent(gate.userId)}`,
    method: 'GET',
  });
  if (proxied.proxied && proxied.json?.authUrl) {
    if (redirectMode) return NextResponse.redirect(proxied.json.authUrl);
    return NextResponse.json({ success: true, authUrl: proxied.json.authUrl });
  }

  try {
    const { authUrl } = await createZohoOAuthState(gate.admin, {
      userId: gate.userId,
      returnTo,
    });
    if (redirectMode) {
      return NextResponse.redirect(authUrl);
    }
    return NextResponse.json({ success: true, authUrl });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to initiate Zoho OAuth flow.',
      },
      { status: 500 }
    );
  }
}

