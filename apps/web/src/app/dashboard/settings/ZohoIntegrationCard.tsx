'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface ZohoAccountSummary {
  accountId: string;
  primaryEmail: string;
  displayName?: string | null;
  accountName?: string | null;
  incomingBlocked?: boolean;
  outgoingBlocked?: boolean;
  isSelected?: boolean;
}

interface ZohoAuthorizedSender {
  accountId: string;
  email: string;
  displayName?: string | null;
  isPrimary?: boolean;
  isAlias?: boolean;
  validated?: boolean;
}

interface ZohoPublicStatus {
  configured: boolean;
  redirectUri?: string;
  accountsBaseUrl?: string;
  mailApiBaseUrl?: string;
  dataCenter?: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'SYNCING' | 'SYNC_ERROR' | 'AUTH_EXPIRED';
  selectedAccountId?: string | null;
  selectedAccountEmail?: string | null;
  selectedSenderEmail?: string | null;
  selectedSenderName?: string | null;
  scopes?: string[];
  connectedAt?: string | null;
  lastError?: string | null;
  accounts: ZohoAccountSummary[];
  senders: ZohoAuthorizedSender[];
  sync?: {
    enabled?: boolean;
    intervalSeconds?: number;
    sendEnabled?: boolean;
    requireApproval?: boolean;
    lastSuccessfulSyncAt?: string | null;
    lastError?: string | null;
    totalSyncedCount?: number;
  };
}

const STATUS_BADGE_STYLES: Record<ZohoPublicStatus['status'], string> = {
  DISCONNECTED: 'bg-slate-100 text-slate-700 border-slate-200',
  CONNECTING: 'bg-amber-50 text-amber-800 border-amber-200',
  CONNECTED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  SYNCING: 'bg-sky-50 text-sky-800 border-sky-200',
  SYNC_ERROR: 'bg-orange-50 text-orange-800 border-orange-200',
  AUTH_EXPIRED: 'bg-red-50 text-red-800 border-red-200',
};

export function ZohoIntegrationCard({ initialStatus }: { initialStatus?: ZohoPublicStatus | null }) {
  const searchParams = useSearchParams();
  const [statusData, setStatusData] = useState<ZohoPublicStatus | null>(initialStatus || null);
  const [selectedSender, setSelectedSender] = useState<string>(initialStatus?.selectedSenderEmail || '');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/zoho/status', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data) {
        setStatusData(data);
        if (data.selectedSenderEmail) {
          setSelectedSender(data.selectedSenderEmail);
        } else if (Array.isArray(data.senders) && data.senders.length > 0) {
          setSelectedSender(data.senders[0].email);
        }
      }
    } catch {
      // keep existing state
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const zohoResult = searchParams.get('zoho');
    const zohoError = searchParams.get('zoho_error');
    if (zohoResult === 'connected') {
      setBanner({
        type: 'success',
        text: 'Zoho Mail OAuth connected cleanly. Review your authorized sender address below.',
      });
      void refreshStatus();
    } else if (zohoError) {
      setBanner({
        type: 'error',
        text: `Zoho OAuth notice: ${zohoError}`,
      });
    }
  }, [searchParams, refreshStatus]);

  async function handleConnect() {
    setBusyAction('connect');
    setBanner(null);
    try {
      const res = await fetch('/api/integrations/zoho/connect?returnTo=/dashboard/settings', {
        method: 'GET',
      });
      const data = await res.json();
      const targetUrl = data?.authUrl || data?.authorizationUrl;
      if (!res.ok || !targetUrl) {
        throw new Error(data?.error || data?.detail || 'Could not generate Zoho OAuth URL.');
      }
      window.location.href = targetUrl;
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Zoho connect failed.',
      });
      setBusyAction(null);
    }
  }

  async function handleTest() {
    setBusyAction('test');
    setBanner(null);
    try {
      const res = await fetch('/api/integrations/zoho/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.detail || 'Zoho connection test failed.');
      }
      await refreshStatus();
      setBanner({
        type: 'success',
        text: `Zoho connection verified (${data.accountCount ?? data.accountsCount ?? 0} account(s), ${data.senderCount ?? 0} authorized sender(s)).`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Test connection failed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSelectSender() {
    if (!selectedSender) return;
    setBusyAction('sender');
    setBanner(null);
    try {
      const matched = statusData?.senders?.find((s) => s.email === selectedSender);
      const res = await fetch('/api/integrations/zoho/select-sender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail: selectedSender,
          accountId: matched?.accountId || statusData?.selectedAccountId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.detail || 'Could not select authorized sender.');
      }
      await refreshStatus();
      setBanner({
        type: 'success',
        text: `Selected verified sender address: ${selectedSender}`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Sender selection failed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSyncNow() {
    setBusyAction('sync');
    setBanner(null);
    try {
      const res = await fetch('/api/email/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.detail || 'Inbox sync failed.');
      }
      await refreshStatus();
      setBanner({
        type: 'success',
        text: `Synced ${data.syncedCount ?? 0} new email(s) (${data.matchedCount ?? 0} matched to leads, ${data.unmatchedCount ?? 0} unmatched).`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Sync failed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    setBusyAction('disconnect');
    setBanner(null);
    try {
      const res = await fetch('/api/integrations/zoho/disconnect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.detail || 'Disconnect failed.');
      }
      await refreshStatus();
      setBanner({
        type: 'success',
        text: 'Zoho Mail disconnected and encrypted tokens cleared.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Disconnect failed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  const stateBadge = statusData?.status || 'DISCONNECTED';
  const sendEnabled = Boolean(statusData?.sync?.sendEnabled);
  const syncEnabled = Boolean(statusData?.sync?.enabled);

  return (
    <div id="integrations" className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base font-black text-[#151B2B]">Integrations — Zoho Mail (OAuth 2.0)</h2>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_BADGE_STYLES[stateBadge]}`}
            >
              {stateBadge}
            </span>
            {statusData?.dataCenter && (
              <span className="rounded-full border border-[#E4E7EC] bg-[#F5F6F8] px-2 py-0.5 text-[10px] font-mono text-[#525A6B]">
                DC: {statusData.dataCenter.toUpperCase()}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#525A6B]">
            Server-based OAuth 2.0 connection for sending Founder-approved outreach emails and syncing inbound replies into Lead conversations.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleConnect}
            className="rounded-xl bg-[#FF6B35] hover:bg-[#e85d2a] disabled:opacity-50 px-4 py-2 text-xs font-bold text-[#F5F6F8] transition"
          >
            {busyAction === 'connect'
              ? 'Redirecting...'
              : stateBadge === 'CONNECTED' || stateBadge === 'AUTH_EXPIRED'
                ? 'Reconnect Zoho Mail'
                : 'Connect Zoho Mail'}
          </button>

          {stateBadge !== 'DISCONNECTED' && (
            <>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleTest}
                className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] hover:border-[#151B2B] disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-[#151B2B]"
              >
                {busyAction === 'test' ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleSyncNow}
                className="rounded-xl border border-[#E4E7EC] bg-[#151B2B] hover:bg-[#2B313C] disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-[#F5F6F8]"
              >
                {busyAction === 'sync' ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleDisconnect}
                className="rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-red-700"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} className="ml-4 font-bold">
            ✕
          </button>
        </div>
      )}

      {!statusData?.configured && statusData?.status !== 'CONNECTED' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <strong>Backend Zoho OAuth variables not yet populated:</strong> Set{' '}
          <code>ZOHO_CLIENT_ID</code>, <code>ZOHO_CLIENT_SECRET</code>, <code>ZOHO_REDIRECT_URI</code>, and{' '}
          <code>ZOHO_REFRESH_TOKEN_ENCRYPTION_KEY</code> in Render & Next.js environment before clicking Connect Zoho Mail.
        </div>
      )}

      {statusData?.lastError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
          <strong>Latest Zoho Error:</strong> {statusData.lastError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        <div className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3">
          <div className="text-[10px] font-bold uppercase text-[#525A6B]">Connected Account</div>
          <div className="mt-1 font-bold text-[#151B2B] truncate">
            {statusData?.selectedAccountEmail || 'Not linked'}
          </div>
          <div className="mt-0.5 text-[10px] text-[#525A6B] font-mono truncate">
            {statusData?.selectedAccountId || 'No accountId discovered'}
          </div>
        </div>

        <div className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3">
          <div className="text-[10px] font-bold uppercase text-[#525A6B]">Selected Sender</div>
          <div className="mt-1 font-bold text-[#151B2B] truncate">
            {statusData?.selectedSenderEmail || 'None selected'}
          </div>
          <div className="mt-0.5 text-[10px] text-[#525A6B]">
            {statusData?.senders?.length || 0} authorized profile(s)
          </div>
        </div>

        <div className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3">
          <div className="text-[10px] font-bold uppercase text-[#525A6B]">Email Send Gate</div>
          <div className={`mt-1 font-bold ${sendEnabled ? 'text-emerald-700' : 'text-amber-700'}`}>
            {sendEnabled ? 'LIVE SEND ARMED' : 'SAFE TEST MODE (DISABLED)'}
          </div>
          <div className="mt-0.5 text-[10px] text-[#525A6B]">
            Founder approval required: {statusData?.sync?.requireApproval === false ? 'OFF' : 'ON'}
          </div>
        </div>

        <div className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3">
          <div className="text-[10px] font-bold uppercase text-[#525A6B]">60s Background Sync</div>
          <div className={`mt-1 font-bold ${syncEnabled ? 'text-emerald-700' : 'text-[#525A6B]'}`}>
            {syncEnabled ? `Every ${statusData?.sync?.intervalSeconds || 60}s` : 'Disabled (Manual Sync Ready)'}
          </div>
          <div className="mt-0.5 text-[10px] text-[#525A6B] truncate">
            {statusData?.sync?.lastSuccessfulSyncAt
              ? `Last sync: ${new Date(statusData.sync.lastSuccessfulSyncAt).toLocaleString()}`
              : `${statusData?.sync?.totalSyncedCount || 0} synced total`}
          </div>
        </div>
      </div>

      {/* Authorized Sender Dropdown */}
      {Array.isArray(statusData?.senders) && statusData.senders.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-4">
          <div className="flex-1">
            <label className="block text-[11px] font-bold uppercase text-[#525A6B] mb-1">
              Authorized Zoho Sender Address
            </label>
            <select
              value={selectedSender}
              onChange={(e) => setSelectedSender(e.target.value)}
              className="w-full rounded-lg border border-[#E4E7EC] bg-[#FFFFFF] px-3 py-2 text-xs font-semibold text-[#151B2B]"
            >
              {statusData.senders.map((sender) => (
                <option key={`${sender.accountId}-${sender.email}`} value={sender.email}>
                  {sender.displayName ? `${sender.displayName} <${sender.email}>` : sender.email}
                  {sender.isPrimary ? ' (Primary)' : ' (Alias)'}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={busyAction !== null || !selectedSender}
            onClick={handleSelectSender}
            className="rounded-xl bg-[#151B2B] hover:bg-[#2B313C] disabled:opacity-50 px-4 py-2 text-xs font-bold text-[#F5F6F8]"
          >
            {busyAction === 'sender' ? 'Saving...' : 'Use Selected Sender'}
          </button>
        </div>
      )}

      {statusData?.sync?.lastError && (
        <div className="text-[11px] text-orange-700 font-medium">
          Last sync warning: {statusData.sync.lastError}
        </div>
      )}
    </div>
  );
}

