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

  const returnTo =
    req.nextUrl.searchParams.get('returnTo') ||
    req.nextUrl.searchParams.get('return_to') ||
    '/dashboard/settings';
  const redirectMode = req.nextUrl.searchParams.get('redirect') === 'true';

  const proxied = await proxyAscensionZohoIfLocalUnconfigured({
    path: `/api/integrations/zoho/connect?returnTo=${encodeURIComponent(returnTo)}&return_to=${encodeURIComponent(returnTo)}&userId=${encodeURIComponent(gate.userId)}`,
    method: 'GET',
  });
  const proxiedAuthUrl = proxied.json?.authUrl || proxied.json?.authorizationUrl;
  if (proxied.proxied && proxiedAuthUrl) {
    if (redirectMode) return NextResponse.redirect(proxiedAuthUrl);
    return NextResponse.json({
      success: true,
      authUrl: proxiedAuthUrl,
      authorizationUrl: proxiedAuthUrl,
    });
  }

  try {
    const { authUrl } = await createZohoOAuthState(gate.admin, {
      userId: gate.userId,
      returnTo,
    });
    if (redirectMode) {
      return NextResponse.redirect(authUrl);
    }
    return NextResponse.json({
      success: true,
      authUrl,
      authorizationUrl: authUrl,
    });
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

