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
    path: '/api/integrations/zoho/senders',
    method: 'GET',
  });
  if (proxied.proxied) {
    return NextResponse.json(proxied.json, { status: proxied.status || 200 });
  }

  try {
    const refresh = req.nextUrl.searchParams.get('refresh') === 'true';
    if (refresh) {
      const ctx = await getValidZohoAccessContext(gate.admin);
      const synced = await syncDiscoveredZohoAccounts(gate.admin, {
        connectionId: ctx.connectionId,
        accessToken: ctx.accessToken,
        mailApiBaseUrl: ctx.mailApiBaseUrl,
        existingAccountId: ctx.selectedAccountId,
        existingSenderEmail: ctx.selectedSenderEmail,
      });
      return NextResponse.json({
        success: true,
        senders: synced.senders,
        selectedAccountId: synced.selectedAccountId,
        selectedSenderEmail: synced.selectedSenderEmail,
      });
    }

    const { data: accounts } = await gate.admin
      .from('zoho_accounts')
      .select('account_id, primary_email, display_name, account_name, send_mail_details, is_selected');

    const senders: Array<{
      email: string;
      displayName: string;
      accountId: string;
      isDefault: boolean;
    }> = [];
    const seen = new Set<string>();

    for (const acct of accounts || []) {
      const details = Array.isArray(acct.send_mail_details) ? acct.send_mail_details : [];
      for (const d of details) {
        const em = String(d.fromAddress || '').trim();
        if (!em || seen.has(`${acct.account_id}::${em.toLowerCase()}`)) continue;
        seen.add(`${acct.account_id}::${em.toLowerCase()}`);
        senders.push({
          email: em,
          displayName: String(d.displayName || acct.display_name || acct.account_name || ''),
          accountId: acct.account_id,
          isDefault: em.toLowerCase() === String(acct.primary_email || '').toLowerCase(),
        });
      }
      if (acct.primary_email && !seen.has(`${acct.account_id}::${acct.primary_email.toLowerCase()}`)) {
        senders.push({
          email: acct.primary_email,
          displayName: acct.display_name || acct.account_name || '',
          accountId: acct.account_id,
          isDefault: true,
        });
      }
    }

    return NextResponse.json({ success: true, senders });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to list Zoho senders.' },
      { status: err?.status || 500 }
    );
  }
}

