import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAuditEvent } from '@/lib/audit';
import {
  buildZohoAuthUrl,
  exchangeZohoAuthCode,
  extractAuthorizedSenders,
  fetchZohoAccounts,
  findZohoInboxFolderId,
  getZohoEnvConfig,
  getZohoMessageContent,
  listZohoInboxMessages,
  refreshZohoAccessToken,
  sendZohoMailMessage,
  ZohoApiError,
  type ZohoDiscoveredAccount,
  type ZohoRawMessageSummary,
  type ZohoSenderDetail,
} from '@/lib/integrations/zoho-mail';
import {
  buildSafeAiEmailReplyDraft,
  classifyInboundEmailReply,
  computeZohoEmailApprovalHash,
  decryptZohoToken,
  detectInboundPromptInjection,
  encryptZohoToken,
  resolveZohoRegionalEndpoints,
  sanitizeEmailHtml,
  stripHtmlToText,
  verifyZohoEmailApprovalHash,
  type EmailApprovalCanonicalPayload,
  type ReplyClassification,
  type ZohoConnectionStatus,
} from '@/lib/integrations/zoho-security';
import { notifyFounder } from '@/lib/integrations/web-push';

function normalizeEmail(raw?: string | null): string {
  const s = String(raw || '').trim();
  const angleMatch = s.match(/<([^>]+)>/);
  return (angleMatch ? angleMatch[1] : s).trim().toLowerCase();
}

function normalizeSubject(subject?: string | null): string {
  return String(subject || '')
    .replace(/^(re|fwd|fw)\s*:\s*/gi, '')
    .trim()
    .toLowerCase();
}

export function isEmailSendEnabled(): boolean {
  return String(process.env.EMAIL_SEND_ENABLED || 'false').trim().toLowerCase() === 'true';
}

export function isEmailSyncEnabled(): boolean {
  return String(process.env.EMAIL_SYNC_ENABLED || 'false').trim().toLowerCase() === 'true';
}

export function isEmailApprovalRequired(): boolean {
  return String(process.env.EMAIL_REQUIRE_APPROVAL || 'true').trim().toLowerCase() !== 'false';
}

export async function createZohoOAuthState(
  admin: SupabaseClient,
  params: { userId?: string | null; returnTo?: string | null }
): Promise<{ stateToken: string; authUrl: string }> {
  const cfg = getZohoEnvConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Zoho OAuth credentials (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET) are not configured on server.');
  }

  const stateToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const safeReturnTo =
    params.returnTo && params.returnTo.startsWith('/') ? params.returnTo : '/dashboard/settings';

  await admin.from('zoho_oauth_states').insert({
    state_token: stateToken,
    user_id: params.userId || null,
    return_to: safeReturnTo,
    expected_dc: cfg.dataCenter,
    expires_at: expiresAt,
  });

  await admin
    .from('zoho_connections')
    .upsert(
      {
        connection_key: 'primary',
        status: 'CONNECTING',
        accounts_base_url: cfg.accountsBaseUrl,
        mail_api_base_url: cfg.mailApiBaseUrl,
        data_center: cfg.dataCenter,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'connection_key' }
    );

  const authUrl = buildZohoAuthUrl({
    state: stateToken,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    accountsBaseUrl: cfg.accountsBaseUrl,
  });

  return { stateToken, authUrl };
}

export async function consumeZohoOAuthState(
  admin: SupabaseClient,
  stateToken: string
): Promise<{ valid: boolean; userId?: string | null; returnTo: string; error?: string }> {
  const clean = String(stateToken || '').trim();
  if (!clean || clean.length < 16) {
    return { valid: false, returnTo: '/dashboard/settings', error: 'Missing or malformed OAuth state token.' };
  }

  const { data: row } = await admin
    .from('zoho_oauth_states')
    .select('*')
    .eq('state_token', clean)
    .maybeSingle();

  if (!row) {
    return { valid: false, returnTo: '/dashboard/settings', error: 'Invalid or unknown OAuth state token.' };
  }
  if (row.used_at) {
    return { valid: false, returnTo: '/dashboard/settings', error: 'OAuth state token has already been used (replay blocked).' };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { valid: false, returnTo: '/dashboard/settings', error: 'OAuth state expired. Please click Connect Zoho Mail again.' };
  }

  await admin
    .from('zoho_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('state_token', clean);

  return {
    valid: true,
    userId: row.user_id || null,
    returnTo: String(row.return_to || '/dashboard/settings'),
  };
}

export async function completeZohoOAuthCallback(
  admin: SupabaseClient,
  params: {
    code: string;
    state: string;
    accountsServer?: string | null;
    location?: string | null;
    actorUserId?: string | null;
  }
): Promise<{
  success: boolean;
  returnTo: string;
  accountsCount: number;
  selectedSenderEmail?: string | null;
  error?: string;
}> {
  const stateCheck = await consumeZohoOAuthState(admin, params.state);
  if (!stateCheck.valid) {
    return {
      success: false,
      returnTo: stateCheck.returnTo,
      accountsCount: 0,
      error: stateCheck.error,
    };
  }

  try {
    const { tokens, endpoints } = await exchangeZohoAuthCode({
      code: params.code,
      accountsServer: params.accountsServer,
      location: params.location,
    });

    const { data: existingConn } = await admin
      .from('zoho_connections')
      .select('id, encrypted_refresh_token, selected_account_id, selected_sender_email')
      .eq('connection_key', 'primary')
      .maybeSingle();

    const encryptedRefresh = tokens.refresh_token
      ? encryptZohoToken(tokens.refresh_token)
      : existingConn?.encrypted_refresh_token || null;

    if (!encryptedRefresh) {
      return {
        success: false,
        returnTo: stateCheck.returnTo,
        accountsCount: 0,
        error:
          'Zoho did not return a refresh_token and none is stored. Revoke app access in Zoho Accounts or ensure access_type=offline & prompt=consent, then reconnect.',
      };
    }

    const encryptedAccess = encryptZohoToken(tokens.access_token);
    const expiresAt = new Date(
      Date.now() + Math.max(60, Number(tokens.expires_in || 3600)) * 1000
    ).toISOString();
    const now = new Date().toISOString();

    const { data: connRow, error: connErr } = await admin
      .from('zoho_connections')
      .upsert(
        {
          connection_key: 'primary',
          status: 'CONNECTED',
          accounts_base_url: endpoints.accountsBaseUrl,
          mail_api_base_url: endpoints.mailApiBaseUrl,
          data_center: endpoints.dataCenter,
          encrypted_refresh_token: encryptedRefresh,
          encrypted_access_token: encryptedAccess,
          access_token_expires_at: expiresAt,
          connected_by: params.actorUserId || stateCheck.userId || null,
          last_error: null,
          connected_at: now,
          updated_at: now,
        },
        { onConflict: 'connection_key' }
      )
      .select('id, selected_account_id, selected_sender_email')
      .single();

    if (connErr || !connRow) {
      throw new Error(connErr?.message || 'Failed to persist Zoho OAuth connection.');
    }

    const accounts = await syncDiscoveredZohoAccounts(admin, {
      connectionId: connRow.id,
      accessToken: tokens.access_token,
      mailApiBaseUrl: endpoints.mailApiBaseUrl,
      existingAccountId: connRow.selected_account_id,
      existingSenderEmail: connRow.selected_sender_email,
    });

    await logAuditEvent({
      actorType: 'user',
      actorId: params.actorUserId || stateCheck.userId || 'founder',
      action: 'zoho.oauth_connected',
      objectType: 'zoho_connections',
      objectId: connRow.id,
      result: 'success',
      metadata: {
        data_center: endpoints.dataCenter,
        accounts_count: accounts.accounts.length,
        selected_sender: accounts.selectedSenderEmail || null,
      },
    });

    return {
      success: true,
      returnTo: stateCheck.returnTo,
      accountsCount: accounts.accounts.length,
      selectedSenderEmail: accounts.selectedSenderEmail,
    };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : 'Zoho OAuth connection failed.';
    await admin
      .from('zoho_connections')
      .upsert(
        {
          connection_key: 'primary',
          status: err?.authExpired ? 'AUTH_EXPIRED' : 'SYNC_ERROR',
          last_error: msg,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'connection_key' }
      );
    return {
      success: false,
      returnTo: stateCheck.returnTo,
      accountsCount: 0,
      error: msg,
    };
  }
}

export async function syncDiscoveredZohoAccounts(
  admin: SupabaseClient,
  params: {
    connectionId: string;
    accessToken: string;
    mailApiBaseUrl: string;
    existingAccountId?: string | null;
    existingSenderEmail?: string | null;
  }
): Promise<{
  accounts: ZohoDiscoveredAccount[];
  senders: ZohoSenderDetail[];
  selectedAccountId: string | null;
  selectedSenderEmail: string | null;
}> {
  const accounts = await fetchZohoAccounts({
    accessToken: params.accessToken,
    mailApiBaseUrl: params.mailApiBaseUrl,
  });
  const senders = extractAuthorizedSenders(accounts);

  // Preserve valid previously chosen sender only if still confirmed by Zoho
  const stillValidSender = params.existingSenderEmail
    ? senders.find((s) => s.email.toLowerCase() === params.existingSenderEmail!.toLowerCase())
    : undefined;

  const chosenSender = stillValidSender || senders.find((s) => s.isDefault) || senders[0] || null;
  const chosenAccount =
    accounts.find((a) => a.accountId === (chosenSender?.accountId || params.existingAccountId)) ||
    accounts[0] ||
    null;

  for (const acct of accounts) {
    await admin.from('zoho_accounts').upsert(
      {
        connection_id: params.connectionId,
        account_id: acct.accountId,
        primary_email: acct.primaryEmail,
        display_name: acct.displayName,
        account_name: acct.accountName,
        send_mail_details: acct.sendMailDetails,
        incoming_blocked: acct.incomingBlocked,
        outgoing_blocked: acct.outgoingBlocked,
        is_selected: chosenAccount ? acct.accountId === chosenAccount.accountId : false,
        raw_meta: acct.rawMeta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );
  }

  await admin
    .from('zoho_connections')
    .update({
      selected_account_id: chosenAccount?.accountId || null,
      selected_account_email: chosenAccount?.primaryEmail || null,
      selected_sender_email: chosenSender?.email || null,
      selected_sender_name: chosenSender?.displayName || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.connectionId);

  return {
    accounts,
    senders,
    selectedAccountId: chosenAccount?.accountId || null,
    selectedSenderEmail: chosenSender?.email || null,
  };
}

/**
 * Ensures a live Zoho access token, refreshing transparently with encrypted refresh token
 * when expired or within 120 seconds of expiry. Never logs secrets.
 */
export async function getValidZohoAccessContext(admin: SupabaseClient): Promise<{
  connectionId: string;
  accessToken: string;
  accountsBaseUrl: string;
  mailApiBaseUrl: string;
  dataCenter: string;
  selectedAccountId: string | null;
  selectedSenderEmail: string | null;
  selectedSenderName: string | null;
}> {
  const { data: conn } = await admin
    .from('zoho_connections')
    .select('*')
    .eq('connection_key', 'primary')
    .maybeSingle();

  if (!conn || conn.status === 'DISCONNECTED' || !conn.encrypted_refresh_token) {
    throw new ZohoApiError('Zoho Mail is not connected. Click Connect Zoho Mail in Settings.', {
      status: 400,
      code: 'ZOHO_DISCONNECTED',
    });
  }

  const endpoints = resolveZohoRegionalEndpoints({
    accountsServer: conn.accounts_base_url,
    location: conn.data_center,
  });

  const expiresMs = conn.access_token_expires_at
    ? new Date(conn.access_token_expires_at).getTime()
    : 0;
  const needsRefresh =
    !conn.encrypted_access_token || !expiresMs || expiresMs - Date.now() < 120 * 1000;

  if (!needsRefresh) {
    return {
      connectionId: conn.id,
      accessToken: decryptZohoToken(conn.encrypted_access_token),
      accountsBaseUrl: endpoints.accountsBaseUrl,
      mailApiBaseUrl: endpoints.mailApiBaseUrl,
      dataCenter: endpoints.dataCenter,
      selectedAccountId: conn.selected_account_id || null,
      selectedSenderEmail: conn.selected_sender_email || null,
      selectedSenderName: conn.selected_sender_name || null,
    };
  }

  try {
    const refreshToken = decryptZohoToken(conn.encrypted_refresh_token);
    const refreshed = await refreshZohoAccessToken({
      refreshToken,
      accountsBaseUrl: endpoints.accountsBaseUrl,
    });

    const newExpiresAt = new Date(
      Date.now() + Math.max(60, Number(refreshed.expires_in || 3600)) * 1000
    ).toISOString();

    await admin
      .from('zoho_connections')
      .update({
        encrypted_access_token: encryptZohoToken(refreshed.access_token),
        access_token_expires_at: newExpiresAt,
        status: conn.status === 'AUTH_EXPIRED' ? 'CONNECTED' : conn.status,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id);

    return {
      connectionId: conn.id,
      accessToken: refreshed.access_token,
      accountsBaseUrl: endpoints.accountsBaseUrl,
      mailApiBaseUrl: endpoints.mailApiBaseUrl,
      dataCenter: endpoints.dataCenter,
      selectedAccountId: conn.selected_account_id || null,
      selectedSenderEmail: conn.selected_sender_email || null,
      selectedSenderName: conn.selected_sender_name || null,
    };
  } catch (err: any) {
    if (err?.authExpired) {
      await admin
        .from('zoho_connections')
        .update({
          status: 'AUTH_EXPIRED',
          encrypted_access_token: null,
          last_error: err.message || 'Zoho authorization expired or revoked. Please reconnect.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id);
    }
    throw err;
  }
}

export async function getZohoPublicStatus(admin: SupabaseClient) {
  const cfg = getZohoEnvConfig();
  const [{ data: conn }, { data: accounts }, { data: syncRow }] = await Promise.all([
    admin
      .from('zoho_connections')
      .select(
        'id, status, accounts_base_url, mail_api_base_url, data_center, selected_account_id, selected_account_email, selected_sender_email, selected_sender_name, scopes, last_error, connected_at, updated_at'
      )
      .eq('connection_key', 'primary')
      .maybeSingle(),
    admin
      .from('zoho_accounts')
      .select('account_id, primary_email, display_name, account_name, send_mail_details, is_selected, incoming_blocked, outgoing_blocked'),
    admin
      .from('email_sync_state')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const status: ZohoConnectionStatus = (conn?.status as ZohoConnectionStatus) || 'DISCONNECTED';
  const mappedAccounts = (accounts || []).map((a: any) => ({
    accountId: a.account_id,
    primaryEmail: a.primary_email,
    displayName: a.display_name,
    accountName: a.account_name,
    isSelected: Boolean(a.is_selected),
    incomingBlocked: Boolean(a.incoming_blocked),
    outgoingBlocked: Boolean(a.outgoing_blocked),
    senders: Array.isArray(a.send_mail_details) ? a.send_mail_details : [],
  }));
  const flattenedSenders = extractAuthorizedSenders(
    (accounts || []).map((a: any) => ({
      accountId: a.account_id,
      primaryEmail: a.primary_email,
      displayName: a.display_name || '',
      accountName: a.account_name || '',
      incomingBlocked: Boolean(a.incoming_blocked),
      outgoingBlocked: Boolean(a.outgoing_blocked),
      sendMailDetails: Array.isArray(a.send_mail_details) ? a.send_mail_details : [],
      rawMeta: {},
    }))
  ).map((s) => ({
    accountId: s.accountId,
    email: s.email,
    displayName: s.displayName || null,
    isPrimary: s.isDefault,
    isAlias: !s.isDefault,
    validated: true,
  }));

  return {
    configured: Boolean(cfg.clientId && cfg.clientSecret) || status === 'CONNECTED',
    status,
    dataCenter: conn?.data_center || cfg.dataCenter,
    accountsBaseUrl: conn?.accounts_base_url || cfg.accountsBaseUrl,
    mailApiBaseUrl: conn?.mail_api_base_url || cfg.mailApiBaseUrl,
    redirectUri: cfg.redirectUri,
    selectedAccountId: conn?.selected_account_id || null,
    selectedAccountEmail: conn?.selected_account_email || null,
    selectedSenderEmail: conn?.selected_sender_email || null,
    selectedSenderName: conn?.selected_sender_name || null,
    connectedAt: conn?.connected_at || null,
    lastError: conn?.last_error || null,
    lastSuccessfulSyncAt: syncRow?.last_successful_sync_at || null,
    lastSyncError: syncRow?.last_error || null,
    syncStatus: syncRow?.status || status,
    emailSyncEnabled: isEmailSyncEnabled(),
    emailSendEnabled: isEmailSendEnabled(),
    emailRequireApproval: isEmailApprovalRequired(),
    accounts: mappedAccounts,
    senders: flattenedSenders,
    sync: {
      enabled: isEmailSyncEnabled(),
      intervalSeconds: Math.max(15, Number(process.env.EMAIL_SYNC_INTERVAL_SECONDS || 60)),
      sendEnabled: isEmailSendEnabled(),
      requireApproval: isEmailApprovalRequired(),
      lastSuccessfulSyncAt: syncRow?.last_successful_sync_at || null,
      lastError: syncRow?.last_error || null,
      totalSyncedCount: Number(syncRow?.total_synced_count || 0),
    },
  };
}

export async function selectAuthorizedZohoSender(
  admin: SupabaseClient,
  params: { accountId: string; senderEmail: string; userId: string }
) {
  const { data: acct } = await admin
    .from('zoho_accounts')
    .select('*')
    .eq('account_id', params.accountId)
    .maybeSingle();

  if (!acct) {
    throw new Error('Zoho account not found. Refresh authorized accounts first.');
  }

  const target = params.senderEmail.trim().toLowerCase();
  const details: Array<{ fromAddress?: string; displayName?: string }> = Array.isArray(acct.send_mail_details)
    ? acct.send_mail_details
    : [];

  const matched =
    details.find((d) => String(d.fromAddress || '').trim().toLowerCase() === target) ||
    (String(acct.primary_email || '').trim().toLowerCase() === target
      ? { fromAddress: acct.primary_email, displayName: acct.display_name || acct.account_name }
      : null);

  if (!matched) {
    throw new Error(
      `Address "${params.senderEmail}" is not in Zoho's verified sendMailDetails for account ${params.accountId}.`
    );
  }

  await admin.from('zoho_accounts').update({ is_selected: false }).neq('account_id', params.accountId);
  await admin.from('zoho_accounts').update({ is_selected: true }).eq('account_id', params.accountId);
  await admin
    .from('zoho_connections')
    .update({
      selected_account_id: acct.account_id,
      selected_account_email: acct.primary_email,
      selected_sender_email: matched.fromAddress,
      selected_sender_name: matched.displayName || acct.display_name || null,
      updated_at: new Date().toISOString(),
    })
    .eq('connection_key', 'primary');

  await logAuditEvent({
    actorType: 'user',
    actorId: params.userId,
    action: 'zoho.sender_selected',
    objectType: 'zoho_connections',
    objectId: acct.account_id,
    result: 'success',
    metadata: { sender_email: matched.fromAddress },
  });

  return {
    selectedAccountId: acct.account_id,
    selectedSenderEmail: matched.fromAddress,
    selectedSenderName: matched.displayName || acct.display_name || null,
  };
}

export async function createOrUpdateEmailApprovalDraft(
  admin: SupabaseClient,
  input: {
    id?: string;
    leadId: string;
    recipientEmail: string;
    senderAddress?: string | null;
    ccAddresses?: string[];
    bccAddresses?: string[];
    replyTo?: string | null;
    subject: string;
    textBody: string;
    htmlBody?: string | null;
    rationale?: string | null;
    selectedService?: string | null;
    verifiedResearch?: Record<string, unknown>;
    campaignId?: string;
    campaignName?: string;
    templateVersion?: string;
    conversationId?: string | null;
  }
) {
  const { data: conn } = await admin
    .from('zoho_connections')
    .select('selected_sender_email')
    .eq('connection_key', 'primary')
    .maybeSingle();

  const senderAddress = String(
    input.senderAddress || conn?.selected_sender_email || 'UNSELECTED_ZOHO_SENDER'
  ).trim();
  const recipientEmail = String(input.recipientEmail || '').trim().toLowerCase();
  const cc = (input.ccAddresses || []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const bcc = (input.bccAddresses || []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const campaignId = String(input.campaignId || 'default').trim();
  const templateVersion = String(input.templateVersion || 'research-v2').trim();
  const approvalTimestamp = new Date().toISOString();

  const canonicalPayload: EmailApprovalCanonicalPayload = {
    lead_id: input.leadId,
    sender: senderAddress,
    recipient: recipientEmail,
    cc,
    bcc,
    subject: input.subject.trim(),
    body: input.textBody,
    campaign_id: campaignId,
    template_version: templateVersion,
    approval_timestamp: approvalTimestamp,
    channel: 'email',
  };

  const canonicalHash = computeZohoEmailApprovalHash(canonicalPayload);
  const sanitizedHtml = input.htmlBody ? sanitizeEmailHtml(input.htmlBody) : null;

  if (input.id) {
    const { data: existing } = await admin
      .from('email_approvals')
      .select('approval_status')
      .eq('id', input.id)
      .maybeSingle();

    if (existing && (existing.approval_status === 'SENT' || existing.approval_status === 'SENDING')) {
      throw new Error('Cannot modify an email draft that is already sending or sent.');
    }

    // Any edit strictly resets status to DRAFT_PENDING and clears prior approval metadata
    const { data: updated, error } = await admin
      .from('email_approvals')
      .update({
        sender_address: senderAddress,
        recipient_email: recipientEmail,
        cc_addresses: cc,
        bcc_addresses: bcc,
        reply_to: input.replyTo || null,
        subject: input.subject.trim(),
        html_body: sanitizedHtml,
        text_body: input.textBody,
        rationale: input.rationale || null,
        selected_service: input.selectedService || null,
        campaign_id: campaignId,
        campaign_name: input.campaignName || 'ZenLyft Direct Outreach',
        template_version: templateVersion,
        canonical_hash: canonicalHash,
        approval_status: 'DRAFT_PENDING',
        approved_at: null,
        approved_by: null,
        verified_research: {
          ...(input.verifiedResearch || {}),
          canonical_payload: canonicalPayload,
        },
        updated_at: approvalTimestamp,
      })
      .eq('id', input.id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return updated;
  }

  const { data: created, error } = await admin
    .from('email_approvals')
    .insert({
      lead_id: input.leadId,
      conversation_id: input.conversationId || null,
      sender_address: senderAddress,
      recipient_email: recipientEmail,
      cc_addresses: cc,
      bcc_addresses: bcc,
      reply_to: input.replyTo || null,
      subject: input.subject.trim(),
      html_body: sanitizedHtml,
      text_body: input.textBody,
      rationale: input.rationale || null,
      selected_service: input.selectedService || null,
      verified_research: {
        ...(input.verifiedResearch || {}),
        canonical_payload: canonicalPayload,
      },
      campaign_id: campaignId,
      campaign_name: input.campaignName || 'ZenLyft Direct Outreach',
      template_version: templateVersion,
      channel: 'email',
      canonical_hash: canonicalHash,
      approval_status: 'DRAFT_PENDING',
      created_at: approvalTimestamp,
      updated_at: approvalTimestamp,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return created;
}

function buildCanonicalFromRow(row: any): EmailApprovalCanonicalPayload {
  const stored = row?.verified_research?.canonical_payload;
  return {
    lead_id: String(row.lead_id || ''),
    sender: String(row.sender_address || ''),
    recipient: String(row.recipient_email || ''),
    cc: Array.isArray(row.cc_addresses) ? row.cc_addresses : [],
    bcc: Array.isArray(row.bcc_addresses) ? row.bcc_addresses : [],
    subject: String(row.subject || ''),
    body: String(row.text_body || ''),
    campaign_id: String(row.campaign_id || 'default'),
    template_version: String(row.template_version || 'research-v2'),
    approval_timestamp: String(stored?.approval_timestamp || row.updated_at || row.created_at || ''),
    channel: 'email',
  };
}

export async function approveEmailApprovalDraft(
  admin: SupabaseClient,
  params: { draftId: string; userId: string }
) {
  const { data: row } = await admin
    .from('email_approvals')
    .select('*')
    .eq('id', params.draftId)
    .maybeSingle();

  if (!row) throw new Error('Email approval draft not found.');
  if (row.approval_status !== 'DRAFT_PENDING') {
    throw new Error(`Cannot approve draft in status ${row.approval_status}.`);
  }

  // Check suppression & lead opt-out
  const [{ data: suppressed }, { data: lead }] = await Promise.all([
    admin
      .from('email_suppressions')
      .select('id, reason')
      .eq('email', normalizeEmail(row.recipient_email))
      .maybeSingle(),
    row.lead_id
      ? admin.from('leads').select('contact_restriction, pipeline_stage').eq('id', row.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (
    suppressed ||
    lead?.contact_restriction === 'opt_out' ||
    lead?.contact_restriction === 'do_not_contact' ||
    lead?.pipeline_stage === 'do_not_contact'
  ) {
    throw new Error('PROSPECT_SUPPRESSED: Email recipient is on unsubscribe/opt-out suppression list.');
  }

  const canonical = buildCanonicalFromRow(row);
  if (!verifyZohoEmailApprovalHash(canonical, row.canonical_hash)) {
    throw new Error('INTEGRITY_ERROR: Canonical SHA-256 hash mismatch. Regenerate or re-save draft before approving.');
  }

  const now = new Date().toISOString();
  const approvedPayload: EmailApprovalCanonicalPayload = {
    ...canonical,
    approval_timestamp: now,
  };
  const approvedHash = computeZohoEmailApprovalHash(approvedPayload);
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${row.id}::${approvedHash}`)
    .digest('hex');

  const { data: updated, error } = await admin
    .from('email_approvals')
    .update({
      approval_status: 'APPROVED',
      approved_by: params.userId,
      approved_at: now,
      canonical_hash: approvedHash,
      idempotency_key: idempotencyKey,
      verified_research: {
        ...(row.verified_research || {}),
        canonical_payload: approvedPayload,
      },
      updated_at: now,
    })
    .eq('id', params.draftId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    actorType: 'user',
    actorId: params.userId,
    action: 'email_approval.approved',
    objectType: 'email_approvals',
    objectId: params.draftId,
    result: 'success',
    metadata: { recipient: row.recipient_email, sender: row.sender_address, hash: approvedHash },
  });

  return updated;
}

export async function rejectEmailApprovalDraft(
  admin: SupabaseClient,
  params: { draftId: string; userId: string; reason: string }
) {
  const { data: updated, error } = await admin
    .from('email_approvals')
    .update({
      approval_status: 'REJECTED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.draftId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    actorType: 'user',
    actorId: params.userId,
    action: 'email_approval.rejected',
    objectType: 'email_approvals',
    objectId: params.draftId,
    result: 'success',
    metadata: { reason: params.reason },
  });

  return updated;
}

/**
 * Transactional, cryptographically locked Zoho Email dispatch.
 * Enforces: Emergency Stop, EMAIL_SEND_ENABLED, Approval gate, Canonical SHA-256 verification,
 * Suppression list, atomic dispatch locking, idempotency, and honest UNKNOWN handling on timeout.
 */
export async function dispatchApprovedEmailDraft(
  admin: SupabaseClient,
  params: { draftId: string; userId: string }
) {
  // 1. Master kill switch check
  const { data: settings } = await admin
    .from('system_settings')
    .select('emergency_stop_active')
    .eq('id', 'zenlyft-global-settings')
    .maybeSingle();

  if (settings?.emergency_stop_active) {
    throw new ZohoApiError('EMERGENCY_STOP_ACTIVE: Master Emergency Stop blocks all email sending.', {
      status: 403,
      code: 'EMERGENCY_STOP_ACTIVE',
    });
  }

  // 2. Global send enable flag check
  if (!isEmailSendEnabled()) {
    throw new ZohoApiError(
      'EMAIL_SEND_DISABLED: Set EMAIL_SEND_ENABLED=true in server environment after verifying OAuth & sender selection.',
      { status: 403, code: 'EMAIL_SEND_DISABLED' }
    );
  }

  // 3. Read draft and verify approval + cryptographic hash + suppression
  const { data: draft } = await admin
    .from('email_approvals')
    .select('*')
    .eq('id', params.draftId)
    .maybeSingle();

  if (!draft) {
    throw new ZohoApiError('Email draft not found.', { status: 404, code: 'NOT_FOUND' });
  }

  if (draft.approval_status === 'DELIVERY_STATUS_UNKNOWN') {
    throw new ZohoApiError(
      'DELIVERY_STATUS_UNKNOWN: A previous dispatch timed out. Run inbox/sent reconciliation before resending.',
      { status: 409, code: 'RECONCILIATION_REQUIRED' }
    );
  }

  if (draft.approval_status === 'SENT' || draft.approval_status === 'ACCEPTED') {
    throw new ZohoApiError('DUPLICATE_SEND_BLOCKED: This email draft was already dispatched.', {
      status: 409,
      code: 'DUPLICATE_SEND_BLOCKED',
    });
  }

  if (isEmailApprovalRequired() && draft.approval_status !== 'APPROVED') {
    throw new ZohoApiError(
      `APPROVAL_REQUIRED: Email draft status is ${draft.approval_status}. Explicit Founder approval is mandatory.`,
      { status: 403, code: 'APPROVAL_REQUIRED' }
    );
  }

  const canonical = buildCanonicalFromRow(draft);
  if (!verifyZohoEmailApprovalHash(canonical, draft.canonical_hash)) {
    throw new ZohoApiError(
      'TAMPER_DETECTED: Email sender, recipient, subject, or body no longer matches approved SHA-256 hash.',
      { status: 400, code: 'HASH_MISMATCH' }
    );
  }

  const [{ data: suppressed }, { data: lead }] = await Promise.all([
    admin
      .from('email_suppressions')
      .select('id')
      .eq('email', normalizeEmail(draft.recipient_email))
      .maybeSingle(),
    draft.lead_id
      ? admin.from('leads').select('contact_restriction, pipeline_stage').eq('id', draft.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (
    suppressed ||
    lead?.contact_restriction === 'opt_out' ||
    lead?.contact_restriction === 'do_not_contact' ||
    lead?.pipeline_stage === 'do_not_contact'
  ) {
    throw new ZohoApiError('PROSPECT_SUPPRESSED: Recipient has unsubscribed or is marked Do-Not-Contact.', {
      status: 403,
      code: 'PROSPECT_SUPPRESSED',
    });
  }

  // 4. Verify live Zoho OAuth context & authorized sender
  const zohoCtx = await getValidZohoAccessContext(admin);
  if (!zohoCtx.selectedAccountId || !zohoCtx.selectedSenderEmail) {
    throw new ZohoApiError(
      'ZOHO_SENDER_NOT_SELECTED: Select an authorized Zoho sender address in Settings > Integrations first.',
      { status: 400, code: 'SENDER_NOT_SELECTED' }
    );
  }

  const fromAddress =
    draft.sender_address && draft.sender_address !== 'UNSELECTED_ZOHO_SENDER'
      ? draft.sender_address
      : zohoCtx.selectedSenderEmail;

  // 5. Acquire transactional dispatch lock (atomic compare-and-set)
  const lockToken = crypto.randomUUID();
  const lockTime = new Date().toISOString();
  const { data: lockedRows, error: lockErr } = await admin
    .from('email_approvals')
    .update({
      approval_status: 'SENDING',
      dispatch_lock_token: lockToken,
      dispatch_locked_at: lockTime,
      updated_at: lockTime,
    })
    .eq('id', params.draftId)
    .eq('approval_status', 'APPROVED')
    .is('dispatch_lock_token', null)
    .select('id');

  if (lockErr || !lockedRows || lockedRows.length === 0) {
    throw new ZohoApiError('CONCURRENT_SEND_LOCKED: Another dispatch is already in progress or completed.', {
      status: 409,
      code: 'DISPATCH_LOCKED',
    });
  }

  // 6. Send via official Zoho Mail REST API
  let result;
  try {
    result = await sendZohoMailMessage({
      accessToken: zohoCtx.accessToken,
      mailApiBaseUrl: zohoCtx.mailApiBaseUrl,
      email: {
        accountId: zohoCtx.selectedAccountId,
        fromAddress,
        toAddress: draft.recipient_email,
        ccAddresses: Array.isArray(draft.cc_addresses) ? draft.cc_addresses : [],
        bccAddresses: Array.isArray(draft.bcc_addresses) ? draft.bcc_addresses : [],
        replyTo: draft.reply_to || fromAddress,
        subject: draft.subject,
        htmlBody: draft.html_body,
        textBody: draft.text_body,
      },
    });
  } catch (err) {
    await admin
      .from('email_approvals')
      .update({
        approval_status: 'FAILED',
        dispatch_lock_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.draftId);
    throw err;
  }

  const finishedAt = new Date().toISOString();
  const idempotencyKey = draft.idempotency_key || `${draft.id}::${draft.canonical_hash}`;

  // Release lock only on clear non-timeout outcome; retain lock guard on DELIVERY_STATUS_UNKNOWN
  await admin
    .from('email_approvals')
    .update({
      approval_status: result.deliveryStatus,
      zoho_message_id: result.zohoMessageId || null,
      dispatch_lock_token: result.deliveryStatus === 'DELIVERY_STATUS_UNKNOWN' ? lockToken : null,
      updated_at: finishedAt,
    })
    .eq('id', params.draftId);

  let conversationId = draft.conversation_id;
  if (!conversationId && draft.lead_id) {
    const { data: conv } = await admin
      .from('email_conversations')
      .insert({
        lead_id: draft.lead_id,
        subject: draft.subject,
        prospect_email: normalizeEmail(draft.recipient_email),
        sender_address: fromAddress,
        message_count: 1,
        last_message_at: finishedAt,
      })
      .select('id')
      .single();
    conversationId = conv?.id || null;
  }

  const { data: recordedMsg } = await admin
    .from('email_messages')
    .insert({
      conversation_id: conversationId,
      lead_id: draft.lead_id,
      zoho_account_id: zohoCtx.selectedAccountId,
      zoho_message_id: result.zohoMessageId || null,
      direction: 'outbound',
      from_address: fromAddress,
      to_addresses: [draft.recipient_email],
      cc_addresses: Array.isArray(draft.cc_addresses) ? draft.cc_addresses : [],
      bcc_addresses: Array.isArray(draft.bcc_addresses) ? draft.bcc_addresses : [],
      reply_to: draft.reply_to || fromAddress,
      subject: draft.subject,
      html_body: draft.html_body || null,
      text_body: draft.text_body,
      clean_snippet: draft.text_body.slice(0, 180),
      delivery_status: result.deliveryStatus,
      idempotency_key: idempotencyKey,
      received_or_sent_at: finishedAt,
    })
    .select('id')
    .single();

  await admin.from('email_delivery_logs').insert({
    email_approval_id: draft.id,
    email_message_id: recordedMsg?.id || null,
    lead_id: draft.lead_id,
    idempotency_key: idempotencyKey,
    sender_address: fromAddress,
    recipient_email: draft.recipient_email,
    status: result.deliveryStatus,
    zoho_message_id: result.zohoMessageId || null,
    http_status: result.httpStatus || null,
    error_message: result.error || null,
    response_payload: result.rawResponse || {},
  });

  if ((result.deliveryStatus === 'SENT' || result.deliveryStatus === 'ACCEPTED') && draft.lead_id) {
    await admin.from('conversations').insert({
      lead_id: draft.lead_id,
      channel: 'email',
      direction: 'outbound',
      sender: fromAddress,
      recipient: draft.recipient_email,
      message_content: `Subject: ${draft.subject}\n\n${draft.text_body}`,
      external_message_id: result.zohoMessageId || null,
    });

    await admin
      .from('leads')
      .update({
        pipeline_stage: 'contacted',
        next_action: `Email ${result.deliveryStatus.toLowerCase()} via Zoho Mail. Monitoring inbox for reply.`,
        updated_at: finishedAt,
      })
      .eq('id', draft.lead_id);
  }

  await logAuditEvent({
    actorType: 'user',
    actorId: params.userId,
    action: `email.dispatch_${result.deliveryStatus.toLowerCase()}`,
    objectType: 'email_approvals',
    objectId: draft.id,
    result: result.deliveryStatus === 'FAILED' ? 'failure' : 'success',
    metadata: {
      recipient: draft.recipient_email,
      zoho_message_id: result.zohoMessageId || null,
      delivery_status: result.deliveryStatus,
    },
  });

  return {
    deliveryStatus: result.deliveryStatus,
    zohoMessageId: result.zohoMessageId,
    emailMessageId: recordedMsg?.id || null,
    error: result.error,
  };
}

/**
 * Matches an inbound Zoho message against existing CRM records via:
 * In-Reply-To / References / Thread ID -> Prospect Email -> Normalized Subject.
 */
export async function matchInboundEmailToLead(
  admin: SupabaseClient,
  msg: ZohoRawMessageSummary
): Promise<{
  leadId: string | null;
  conversationId: string | null;
  isUnmatched: boolean;
  matchReason: string;
}> {
  const fromEmail = normalizeEmail(msg.fromAddress);

  // 1. Thread ID / In-Reply-To / References match against prior email_messages
  const candidateIds = [
    msg.inReplyTo,
    ...(msg.references || []),
  ].filter((v): v is string => Boolean(v && v.trim()));

  if (candidateIds.length > 0) {
    const { data: refMsg } = await admin
      .from('email_messages')
      .select('lead_id, conversation_id')
      .in('internet_message_id', candidateIds)
      .limit(1)
      .maybeSingle();

    if (refMsg?.lead_id) {
      return {
        leadId: refMsg.lead_id,
        conversationId: refMsg.conversation_id || null,
        isUnmatched: false,
        matchReason: 'in_reply_to_or_references',
      };
    }
  }

  if (msg.threadId) {
    const { data: conv } = await admin
      .from('email_conversations')
      .select('id, lead_id')
      .eq('thread_id', msg.threadId)
      .limit(1)
      .maybeSingle();

    if (conv?.lead_id) {
      return {
        leadId: conv.lead_id,
        conversationId: conv.id,
        isUnmatched: false,
        matchReason: 'zoho_thread_id',
      };
    }
  }

  // 2. Match exact prospect email in contact_channels or prior email_conversations
  if (fromEmail) {
    const { data: channelRow } = await admin
      .from('contact_channels')
      .select('lead_id')
      .eq('channel_type', 'email')
      .ilike('public_value', fromEmail)
      .limit(1)
      .maybeSingle();

    if (channelRow?.lead_id) {
      return {
        leadId: channelRow.lead_id,
        conversationId: null,
        isUnmatched: false,
        matchReason: 'contact_channel_email',
      };
    }

    const { data: prevConv } = await admin
      .from('email_conversations')
      .select('id, lead_id')
      .ilike('prospect_email', fromEmail)
      .limit(1)
      .maybeSingle();

    if (prevConv?.lead_id) {
      return {
        leadId: prevConv.lead_id,
        conversationId: prevConv.id,
        isUnmatched: false,
        matchReason: 'previous_email_conversation',
      };
    }
  }

  // 3. Normalized Subject match against outbound emails
  const normSubj = normalizeSubject(msg.subject);
  if (normSubj.length >= 8) {
    const { data: sentRows } = await admin
      .from('email_messages')
      .select('lead_id, conversation_id, subject')
      .eq('direction', 'outbound')
      .order('received_or_sent_at', { ascending: false })
      .limit(40);

    const subjHit = (sentRows || []).find(
      (r: any) => normalizeSubject(r.subject) === normSubj && r.lead_id
    );
    if (subjHit) {
      return {
        leadId: subjHit.lead_id,
        conversationId: subjHit.conversation_id || null,
        isUnmatched: false,
        matchReason: 'subject_match',
      };
    }
  }

  return {
    leadId: null,
    conversationId: null,
    isUnmatched: true,
    matchReason: 'unmatched_inbound_queue',
  };
}

/**
 * Incremental background/on-demand Zoho Mail Inbox synchronization with pagination,
 * duplicate prevention, backoff/rate-limit handling, reply intelligence, and safe AI drafts.
 */
export async function syncZohoInboxNow(
  admin: SupabaseClient,
  params: { maxPages?: number; pageSize?: number; force?: boolean } = {}
): Promise<{
  syncedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  unsubscribedCount: number;
  status: string;
  error?: string;
}> {
  const zohoCtx = await getValidZohoAccessContext(admin);
  if (!zohoCtx.selectedAccountId) {
    throw new Error('No Zoho Mail account selected.');
  }
  const accountId = zohoCtx.selectedAccountId;

  const { data: syncState } = await admin
    .from('email_sync_state')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (
    !params.force &&
    syncState?.backoff_until &&
    new Date(syncState.backoff_until).getTime() > Date.now()
  ) {
    return {
      syncedCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      unsubscribedCount: 0,
      status: 'BACKOFF_ACTIVE',
      error: `Sync paused until ${syncState.backoff_until} due to previous errors or rate limit.`,
    };
  }

  const nowIso = new Date().toISOString();
  await admin.from('email_sync_state').upsert(
    {
      account_id: accountId,
      last_sync_started_at: nowIso,
      status: 'SYNCING',
      updated_at: nowIso,
    },
    { onConflict: 'account_id' }
  );

  try {
    const folderId =
      syncState?.folder_id && syncState.folder_id !== 'inbox'
        ? syncState.folder_id
        : await findZohoInboxFolderId({
            accessToken: zohoCtx.accessToken,
            mailApiBaseUrl: zohoCtx.mailApiBaseUrl,
            accountId,
          });

    const lastWaterMarkMs = Math.max(0, Number(syncState?.last_synced_message_time_ms || 0) - 60000);
    const maxPages = Math.max(1, Math.min(5, params.maxPages ?? 3));
    const pageSize = Math.max(5, Math.min(50, params.pageSize ?? 25));

    let highestSeenMs = Number(syncState?.last_synced_message_time_ms || 0);
    let syncedCount = 0;
    let matchedCount = 0;
    let unmatchedCount = 0;
    let unsubscribedCount = 0;

    for (let page = 0; page < maxPages; page++) {
      const start = page * pageSize + 1;
      const messages = await listZohoInboxMessages({
        accessToken: zohoCtx.accessToken,
        mailApiBaseUrl: zohoCtx.mailApiBaseUrl,
        accountId,
        folderId,
        start,
        limit: pageSize,
      });

      if (messages.length === 0) break;

      let reachedWatermark = false;
      for (const rawMsg of messages) {
        if (!rawMsg.messageId) continue;
        if (rawMsg.receivedTimeMs > highestSeenMs) {
          highestSeenMs = rawMsg.receivedTimeMs;
        }
        if (lastWaterMarkMs > 0 && rawMsg.receivedTimeMs < lastWaterMarkMs) {
          reachedWatermark = true;
          continue;
        }

        // Prevent duplicate ingestion by zoho_message_id
        const { data: existing } = await admin
          .from('email_messages')
          .select('id')
          .eq('zoho_message_id', rawMsg.messageId)
          .maybeSingle();

        if (existing) continue;

        let htmlBody = '';
        if (rawMsg.folderId || folderId) {
          try {
            const full = await getZohoMessageContent({
              accessToken: zohoCtx.accessToken,
              mailApiBaseUrl: zohoCtx.mailApiBaseUrl,
              accountId,
              folderId: rawMsg.folderId || folderId!,
              messageId: rawMsg.messageId,
            });
            htmlBody = sanitizeEmailHtml(full.htmlContent || '');
          } catch {
            htmlBody = '';
          }
        }

        const textBody = stripHtmlToText(htmlBody || rawMsg.summary || '');
        const injection = detectInboundPromptInjection(`${rawMsg.subject}\n${textBody}`);
        const match = await matchInboundEmailToLead(admin, rawMsg);
        const replyAnalysis = classifyInboundEmailReply(rawMsg.subject, textBody);
        const fromEmail = normalizeEmail(rawMsg.fromAddress);

        let conversationId = match.conversationId;
        if (!conversationId) {
          const { data: createdConv } = await admin
            .from('email_conversations')
            .insert({
              lead_id: match.leadId,
              thread_id: rawMsg.threadId || null,
              subject: rawMsg.subject,
              prospect_email: fromEmail || rawMsg.fromAddress,
              sender_address: zohoCtx.selectedSenderEmail || null,
              reply_classification: replyAnalysis.classification,
              message_count: 1,
              last_message_at: new Date(rawMsg.receivedTimeMs).toISOString(),
            })
            .select('id')
            .single();
          conversationId = createdConv?.id || null;
        }

        const receivedIso = new Date(rawMsg.receivedTimeMs).toISOString();
        const { data: savedInbound } = await admin
          .from('email_messages')
          .insert({
            conversation_id: conversationId,
            lead_id: match.leadId,
            zoho_account_id: accountId,
            zoho_message_id: rawMsg.messageId,
            internet_message_id: rawMsg.internetMessageId || null,
            thread_id: rawMsg.threadId || null,
            in_reply_to: rawMsg.inReplyTo || null,
            references_header: rawMsg.references || [],
            direction: 'inbound',
            from_address: fromEmail || rawMsg.fromAddress,
            to_addresses: rawMsg.toAddress ? [normalizeEmail(rawMsg.toAddress)] : [],
            subject: rawMsg.subject,
            html_body: htmlBody || null,
            text_body: textBody,
            clean_snippet: textBody.slice(0, 200),
            delivery_status: 'RECEIVED',
            reply_classification: replyAnalysis.classification,
            is_unmatched: match.isUnmatched,
            has_prompt_injection: injection.hasInjection,
            security_flags: injection.flags,
            raw_headers: rawMsg.rawHeaders || {},
            received_or_sent_at: receivedIso,
          })
          .select('id')
          .single();

        syncedCount++;
        if (match.isUnmatched) {
          unmatchedCount++;
        } else {
          matchedCount++;
        }

        // Unsubscribe handling across email & lead CRM
        if (replyAnalysis.isUnsubscribe && fromEmail) {
          unsubscribedCount++;
          await admin.from('email_suppressions').upsert(
            {
              email: fromEmail,
              lead_id: match.leadId,
              reason: replyAnalysis.classification,
              source_message_id: rawMsg.messageId,
            },
            { onConflict: 'email' }
          );

          if (match.leadId) {
            await admin
              .from('leads')
              .update({
                contact_restriction: 'opt_out',
                pipeline_stage: 'do_not_contact',
                next_action: 'Unsubscribed via Email — suppressed from all campaigns.',
              })
              .eq('id', match.leadId);

            await admin
              .from('email_approvals')
              .update({ approval_status: 'CANCELLED' })
              .eq('lead_id', match.leadId)
              .in('approval_status', ['DRAFT_PENDING', 'APPROVED']);
          }
        }

        // Generate safe AI reply suggestion (never auto-sent)
        if (match.leadId && conversationId) {
          const { data: leadRow } = await admin
            .from('leads')
            .select('organisation_name, service_interest')
            .eq('id', match.leadId)
            .maybeSingle();

          const suggested = buildSafeAiEmailReplyDraft({
            companyName: leadRow?.organisation_name || 'Partner Team',
            classification: replyAnalysis.classification,
            originalSubject: rawMsg.subject,
            selectedService: leadRow?.service_interest || undefined,
            hasInjection: injection.hasInjection,
          });

          await admin
            .from('email_conversations')
            .update({
              reply_classification: replyAnalysis.classification,
              ai_suggested_reply: suggested.body,
              ai_reply_rationale: suggested.rationale,
              last_message_at: receivedIso,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conversationId);

          await admin.from('conversations').insert({
            lead_id: match.leadId,
            channel: 'email',
            direction: 'inbound',
            sender: fromEmail || rawMsg.fromAddress,
            recipient: zohoCtx.selectedSenderEmail || 'zoho-inbox',
            message_content: `[${replyAnalysis.classification}] Subject: ${rawMsg.subject}\n\n${textBody}`,
            external_message_id: rawMsg.messageId,
          });

          if (!replyAnalysis.isUnsubscribe) {
            await notifyFounder({
              category: 'reply_received',
              title: `Email Reply (${replyAnalysis.classification}): ${leadRow?.organisation_name || fromEmail}`,
              body: `Matched via ${match.matchReason}. AI suggested reply ready for review.`,
              url: `/dashboard/leads/${match.leadId}`,
              leadId: match.leadId,
            });
          }
        }

        void savedInbound;
      }

      if (reachedWatermark || messages.length < pageSize) break;
    }

    const doneIso = new Date().toISOString();
    await admin.from('email_sync_state').upsert(
      {
        account_id: accountId,
        folder_id: folderId || 'inbox',
        last_synced_message_time_ms: highestSeenMs,
        last_sync_completed_at: doneIso,
        last_successful_sync_at: doneIso,
        last_error: null,
        consecutive_failures: 0,
        backoff_until: null,
        total_synced_count: Number(syncState?.total_synced_count || 0) + syncedCount,
        status: 'CONNECTED',
        updated_at: doneIso,
      },
      { onConflict: 'account_id' }
    );

    return {
      syncedCount,
      matchedCount,
      unmatchedCount,
      unsubscribedCount,
      status: 'CONNECTED',
    };
  } catch (err: any) {
    const failures = Number(syncState?.consecutive_failures || 0) + 1;
    const retryDelaySec =
      err instanceof ZohoApiError && err.rateLimited
        ? Math.max(60, err.retryAfterSeconds || 60)
        : Math.min(900, 30 * Math.pow(2, Math.min(5, failures)));

    const backoffUntil = new Date(Date.now() + retryDelaySec * 1000).toISOString();
    const errMsg = err instanceof Error ? err.message : 'Zoho Mail sync error';

    await admin.from('email_sync_state').upsert(
      {
        account_id: accountId,
        last_sync_completed_at: new Date().toISOString(),
        last_error: errMsg,
        consecutive_failures: failures,
        backoff_until: backoffUntil,
        status: err?.authExpired ? 'AUTH_EXPIRED' : 'SYNC_ERROR',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );

    return {
      syncedCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      unsubscribedCount: 0,
      status: err?.authExpired ? 'AUTH_EXPIRED' : 'SYNC_ERROR',
      error: errMsg,
    };
  }
}

export type { ReplyClassification };
