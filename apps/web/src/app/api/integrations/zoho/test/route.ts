import { NextRequest, NextResponse } from 'next/server';
import {
  getValidZohoAccessContext,
  syncDiscoveredZohoAccounts,
} from '@/lib/integrations/zoho-store';
import {
  proxyAscensionZohoIfLocalUnconfigured,
  requireFounderSession,
} from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = await requireFounderSession(req, { requireFounderRole: true, maxRequests: 15 });
  if (!gate.ok) return gate.response;

  const proxied = await proxyAscensionZohoIfLocalUnconfigured({
    path: '/api/integrations/zoho/test',
    method: 'POST',
  });
  if (proxied.proxied) {
    return NextResponse.json(proxied.json, { status: proxied.status || 200 });
  }

  try {
    const ctx = await getValidZohoAccessContext(gate.admin);
    const discovery = await syncDiscoveredZohoAccounts(gate.admin, {
      connectionId: ctx.connectionId,
      accessToken: ctx.accessToken,
      mailApiBaseUrl: ctx.mailApiBaseUrl,
      existingAccountId: ctx.selectedAccountId,
      existingSenderEmail: ctx.selectedSenderEmail,
    });

    const senderCount = discovery.accounts.reduce(
      (sum, a) => sum + (Array.isArray(a.sendMailDetails) ? a.sendMailDetails.length : 1),
      0
    );
    return NextResponse.json({
      success: true,
      status: 'CONNECTED',
      dataCenter: ctx.dataCenter,
      accountCount: discovery.accounts.length,
      accountsCount: discovery.accounts.length,
      senderCount,
      selectedAccountId: discovery.selectedAccountId,
      selectedSenderEmail: discovery.selectedSenderEmail,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        authExpired: Boolean(err?.authExpired),
        error: err instanceof Error ? err.message : 'Zoho Mail connection test failed.',
      },
      { status: err?.status || 502 }
    );
  }
}

