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

export async function GET(req: NextRequest) {
  const gate = await requireFounderSession(req);
  if (!gate.ok) return gate.response;

  const proxied = await proxyAscensionZohoIfLocalUnconfigured({
    path: '/api/integrations/zoho/accounts',
    method: 'GET',
  });
  if (proxied.proxied) {
    return NextResponse.json(proxied.json, { status: proxied.status || 200 });
  }

  try {
    const ctx = await getValidZohoAccessContext(gate.admin);
    const result = await syncDiscoveredZohoAccounts(gate.admin, {
      connectionId: ctx.connectionId,
      accessToken: ctx.accessToken,
      mailApiBaseUrl: ctx.mailApiBaseUrl,
      existingAccountId: ctx.selectedAccountId,
      existingSenderEmail: ctx.selectedSenderEmail,
    });
    return NextResponse.json({
      success: true,
      accounts: result.accounts,
      senders: result.senders,
      selectedAccountId: result.selectedAccountId,
      selectedSenderEmail: result.selectedSenderEmail,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        authExpired: Boolean(err?.authExpired),
        error: err instanceof Error ? err.message : 'Failed to discover Zoho accounts.',
      },
      { status: err?.status || 500 }
    );
  }
}

