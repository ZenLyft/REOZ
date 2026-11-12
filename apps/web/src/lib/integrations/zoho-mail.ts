import {
  resolveZohoRegionalEndpoints,
  type ZohoRegionalEndpoints,
} from '@/lib/integrations/zoho-security';

export const ZOHO_REQUIRED_SCOPES = [
  'ZohoMail.accounts.READ',
  'ZohoMail.messages.READ',
  'ZohoMail.messages.CREATE',
] as const;

export interface ZohoOAuthRuntimeConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accountsBaseUrl: string;
  mailApiBaseUrl: string;
  dataCenter: string;
}

export interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  api_domain?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface ZohoSenderDetail {
  email: string;
  displayName: string;
  accountId: string;
  isDefault: boolean;
}

export interface ZohoDiscoveredAccount {
  accountId: string;
  primaryEmail: string;
  displayName: string;
  accountName: string;
  incomingBlocked: boolean;
  outgoingBlocked: boolean;
  sendMailDetails: Array<{
    fromAddress: string;
    displayName: string;
    status?: string | boolean;
  }>;
  rawMeta: Record<string, unknown>;
}

export interface ZohoRawMessageSummary {
  messageId: string;
  threadId?: string;
  folderId?: string;
  fromAddress: string;
  toAddress?: string;
  ccAddress?: string;
  subject: string;
  summary?: string;
  receivedTimeMs: number;
  inReplyTo?: string;
  references?: string[];
  internetMessageId?: string;
  rawHeaders?: Record<string, unknown>;
}

export interface ZohoSendEmailInput {
  accountId: string;
  fromAddress: string;
  toAddress: string;
  ccAddresses?: string[];
  bccAddresses?: string[];
  replyTo?: string;
  subject: string;
  htmlBody?: string | null;
  textBody: string;
  inReplyTo?: string | null;
  threadId?: string | null;
}

export interface ZohoSendEmailResult {
  deliveryStatus: 'ACCEPTED' | 'SENT' | 'FAILED' | 'DELIVERY_STATUS_UNKNOWN';
  zohoMessageId?: string;
  httpStatus?: number;
  error?: string;
  timedOut?: boolean;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  rawResponse?: Record<string, unknown>;
}

export class ZohoApiError extends Error {
  status: number;
  code: string;
  authExpired: boolean;
  rateLimited: boolean;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      authExpired?: boolean;
      rateLimited?: boolean;
      retryAfterSeconds?: number;
    } = {}
  ) {
    super(message);
    this.name = 'ZohoApiError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'ZOHO_API_ERROR';
    this.authExpired = Boolean(options.authExpired);
    this.rateLimited = Boolean(options.rateLimited);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function getZohoEnvConfig(): ZohoOAuthRuntimeConfig {
  const endpoints = resolveZohoRegionalEndpoints({
    defaultAccountsUrl: process.env.ZOHO_ACCOUNTS_BASE_URL,
    defaultMailUrl: process.env.ZOHO_MAIL_API_BASE_URL,
  });

  return {
    clientId: String(process.env.ZOHO_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.ZOHO_CLIENT_SECRET || '').trim(),
    redirectUri: String(
      process.env.ZOHO_REDIRECT_URI ||
        'https://zenlyft-ascension.onrender.com/api/integrations/zoho/callback'
    ).trim(),
    accountsBaseUrl: endpoints.accountsBaseUrl,
    mailApiBaseUrl: endpoints.mailApiBaseUrl,
    dataCenter: endpoints.dataCenter,
  };
}

export function buildZohoAuthUrl(params: {
  state: string;
  clientId?: string;
  redirectUri?: string;
  accountsBaseUrl?: string;
  scopes?: readonly string[];
}): string {
  const cfg = getZohoEnvConfig();
  const clientId = params.clientId || cfg.clientId;
  if (!clientId) {
    throw new Error('ZOHO_CLIENT_ID is not configured.');
  }

  const accountsBaseUrl = (params.accountsBaseUrl || cfg.accountsBaseUrl).replace(/\/+$/, '');
  const redirectUri = params.redirectUri || cfg.redirectUri;
  const scopes = (params.scopes || ZOHO_REQUIRED_SCOPES).join(',');

  const qs = new URLSearchParams({
    scope: scopes,
    client_id: clientId,
    response_type: 'code',
    access_type: 'offline',
    redirect_uri: redirectUri,
    state: params.state,
    prompt: 'consent',
  });

  return `${accountsBaseUrl}/oauth/v2/auth?${qs.toString()}`;
}

export async function exchangeZohoAuthCode(params: {
  code: string;
  accountsServer?: string | null;
  location?: string | null;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}): Promise<{ tokens: ZohoTokenResponse; endpoints: ZohoRegionalEndpoints }> {
  const cfg = getZohoEnvConfig();
  const endpoints = resolveZohoRegionalEndpoints({
    accountsServer: params.accountsServer,
    location: params.location,
    defaultAccountsUrl: cfg.accountsBaseUrl,
    defaultMailUrl: cfg.mailApiBaseUrl,
  });

  const clientId = params.clientId || cfg.clientId;
  const clientSecret = params.clientSecret || cfg.clientSecret;
  const redirectUri = params.redirectUri || cfg.redirectUri;

  if (!clientId || !clientSecret) {
    throw new ZohoApiError('ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET is missing on server.', {
      status: 500,
      code: 'ZOHO_NOT_CONFIGURED',
    });
  }

  const form = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(`${endpoints.accountsBaseUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const payload = (await res.json()) as ZohoTokenResponse;
  if (!res.ok || payload.error || !payload.access_token) {
    throw new ZohoApiError(
      payload.error_description || payload.error || `OAuth code exchange failed (HTTP ${res.status}).`,
      {
        status: res.status,
        code: payload.error || 'OAUTH_EXCHANGE_FAILED',
        authExpired: payload.error === 'invalid_code' || payload.error === 'invalid_client',
      }
    );
  }

  return { tokens: payload, endpoints };
}

export async function refreshZohoAccessToken(params: {
  refreshToken: string;
  accountsBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
}): Promise<ZohoTokenResponse> {
  const cfg = getZohoEnvConfig();
  const endpoints = resolveZohoRegionalEndpoints({
    accountsServer: params.accountsBaseUrl,
    defaultAccountsUrl: cfg.accountsBaseUrl,
  });

  const clientId = params.clientId || cfg.clientId;
  const clientSecret = params.clientSecret || cfg.clientSecret;
  if (!clientId || !clientSecret) {
    throw new ZohoApiError('Zoho OAuth client credentials missing on backend.', {
      status: 500,
      code: 'ZOHO_NOT_CONFIGURED',
    });
  }

  const form = new URLSearchParams({
    refresh_token: params.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${endpoints.accountsBaseUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const payload = (await res.json()) as ZohoTokenResponse;
  const errCode = String(payload.error || '').toLowerCase();
  const isRevoked =
    errCode === 'invalid_grant' ||
    errCode === 'invalid_client' ||
    errCode === 'access_denied' ||
    res.status === 401;

  if (!res.ok || payload.error || !payload.access_token) {
    throw new ZohoApiError(
      payload.error_description || payload.error || `Access token refresh failed (HTTP ${res.status}).`,
      {
        status: res.status,
        code: payload.error || 'REFRESH_FAILED',
        authExpired: isRevoked,
      }
    );
  }

  return payload;
}

async function zohoMailRequest<T = any>(params: {
  url: string;
  accessToken: string;
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  timeoutMs?: number;
}): Promise<{ status: number; data: T }> {
  const res = await fetch(params.url, {
    method: params.method || 'GET',
    headers: {
      Authorization: `Zoho-oauthtoken ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
    signal: AbortSignal.timeout(params.timeoutMs ?? 15000),
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') || '60');
    throw new ZohoApiError('Zoho Mail API rate limit reached (HTTP 429).', {
      status: 429,
      code: 'RATE_LIMITED',
      rateLimited: true,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60,
    });
  }

  const rawText = await res.text();
  let parsed: any = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { rawText };
  }

  const zohoCode = String(parsed?.data?.errorCode || parsed?.status?.description || '').toLowerCase();
  if (
    res.status === 401 ||
    zohoCode.includes('invalid_oauth') ||
    zohoCode.includes('unauthenticated') ||
    zohoCode.includes('expired')
  ) {
    throw new ZohoApiError(
      parsed?.data?.moreInfo || parsed?.status?.description || 'Zoho OAuth access token expired or invalid.',
      {
        status: res.status || 401,
        code: 'TOKEN_EXPIRED',
        authExpired: true,
      }
    );
  }

  if (!res.ok) {
    throw new ZohoApiError(
      parsed?.data?.moreInfo ||
        parsed?.status?.description ||
        parsed?.error ||
        `Zoho Mail API failed with HTTP ${res.status}`,
      {
        status: res.status,
        code: String(parsed?.data?.errorCode || 'ZOHO_HTTP_ERROR'),
      }
    );
  }

  return { status: res.status, data: parsed as T };
}

export async function fetchZohoAccounts(params: {
  accessToken: string;
  mailApiBaseUrl: string;
}): Promise<ZohoDiscoveredAccount[]> {
  const baseUrl = params.mailApiBaseUrl.replace(/\/+$/, '');
  const { data } = await zohoMailRequest<{ data?: any[] }>({
    url: `${baseUrl}/api/accounts`,
    accessToken: params.accessToken,
  });

  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.map((acct: any) => {
    const rawSendMailDetails = Array.isArray(acct.sendMailDetails) ? acct.sendMailDetails : [];
    const sendMailDetails = rawSendMailDetails
      .map((item: any) => ({
        fromAddress: String(item.fromAddress || item.emailId || '').trim(),
        displayName: String(item.displayName || acct.displayName || acct.accountName || '').trim(),
        status: item.status ?? item.mode,
      }))
      .filter((s: { fromAddress: string }) => Boolean(s.fromAddress));

    const primaryEmail = String(
      acct.primaryEmailAddress ||
        acct.mailboxAddress ||
        (Array.isArray(acct.emailAddress) ? acct.emailAddress[0]?.mailId : '') ||
        sendMailDetails[0]?.fromAddress ||
        ''
    ).trim();

    return {
      accountId: String(acct.accountId || '').trim(),
      primaryEmail,
      displayName: String(acct.displayName || acct.accountDisplayName || '').trim(),
      accountName: String(acct.accountName || primaryEmail || '').trim(),
      incomingBlocked: Boolean(acct.incomingBlocked),
      outgoingBlocked: Boolean(acct.outgoingBlocked),
      sendMailDetails,
      rawMeta: acct as Record<string, unknown>,
    };
  });
}

export function extractAuthorizedSenders(accounts: ZohoDiscoveredAccount[]): ZohoSenderDetail[] {
  const seen = new Set<string>();
  const list: ZohoSenderDetail[] = [];

  for (const acct of accounts) {
    for (const detail of acct.sendMailDetails) {
      const email = detail.fromAddress.toLowerCase();
      if (!email || seen.has(`${acct.accountId}::${email}`)) continue;
      seen.add(`${acct.accountId}::${email}`);
      list.push({
        email: detail.fromAddress,
        displayName: detail.displayName || acct.displayName || acct.accountName,
        accountId: acct.accountId,
        isDefault: email === acct.primaryEmail.toLowerCase(),
      });
    }

    if (acct.primaryEmail && !seen.has(`${acct.accountId}::${acct.primaryEmail.toLowerCase()}`)) {
      seen.add(`${acct.accountId}::${acct.primaryEmail.toLowerCase()}`);
      list.push({
        email: acct.primaryEmail,
        displayName: acct.displayName || acct.accountName,
        accountId: acct.accountId,
        isDefault: true,
      });
    }
  }

  return list;
}

export async function sendZohoMailMessage(params: {
  accessToken: string;
  mailApiBaseUrl: string;
  email: ZohoSendEmailInput;
}): Promise<ZohoSendEmailResult> {
  const baseUrl = params.mailApiBaseUrl.replace(/\/+$/, '');
  const { email } = params;

  const hasHtml = Boolean(email.htmlBody && email.htmlBody.trim().length > 0);
  const bodyPayload: Record<string, unknown> = {
    fromAddress: email.fromAddress,
    toAddress: email.toAddress,
    subject: email.subject,
    content: hasHtml ? email.htmlBody : email.textBody,
    mailFormat: hasHtml ? 'html' : 'plaintext',
  };

  if (email.ccAddresses && email.ccAddresses.length > 0) {
    bodyPayload.ccAddress = email.ccAddresses.join(',');
  }
  if (email.bccAddresses && email.bccAddresses.length > 0) {
    bodyPayload.bccAddress = email.bccAddresses.join(',');
  }
  if (email.replyTo) {
    bodyPayload.replyTo = email.replyTo;
  }
  if (email.inReplyTo) {
    bodyPayload.inReplyTo = email.inReplyTo;
  }

  try {
    const { status, data } = await zohoMailRequest<Record<string, any>>({
      url: `${baseUrl}/api/accounts/${encodeURIComponent(email.accountId)}/messages`,
      accessToken: params.accessToken,
      method: 'POST',
      body: bodyPayload,
      timeoutMs: 20000,
    });

    const msgId = String(data?.data?.messageId || data?.messageId || '').trim();
    const zohoStatusCode = Number(data?.status?.code || status);

    if (zohoStatusCode >= 200 && zohoStatusCode < 300) {
      return {
        deliveryStatus: msgId ? 'SENT' : 'ACCEPTED',
        zohoMessageId: msgId || undefined,
        httpStatus: status,
        rawResponse: data,
      };
    }

    return {
      deliveryStatus: 'FAILED',
      httpStatus: status,
      error: String(data?.status?.description || 'Zoho rejected message dispatch.'),
      rawResponse: data,
    };
  } catch (err: any) {
    if (
      err?.name === 'AbortError' ||
      err?.name === 'TimeoutError' ||
      /timeout|timed out|aborted/i.test(String(err?.message || ''))
    ) {
      return {
        deliveryStatus: 'DELIVERY_STATUS_UNKNOWN',
        timedOut: true,
        error:
          'Request to Zoho Mail timed out after submission attempt. Do not blindly resend — reconcile inbox/sent folder first.',
      };
    }

    if (err instanceof ZohoApiError) {
      if (err.authExpired) throw err;
      return {
        deliveryStatus: 'FAILED',
        httpStatus: err.status,
        error: err.message,
        rateLimited: err.rateLimited,
        retryAfterSeconds: err.retryAfterSeconds,
      };
    }

    return {
      deliveryStatus: 'FAILED',
      error: err instanceof Error ? err.message : 'Unknown email dispatch error.',
    };
  }
}

export async function findZohoInboxFolderId(params: {
  accessToken: string;
  mailApiBaseUrl: string;
  accountId: string;
}): Promise<string | null> {
  const baseUrl = params.mailApiBaseUrl.replace(/\/+$/, '');
  const { data } = await zohoMailRequest<{ data?: any[] }>({
    url: `${baseUrl}/api/accounts/${encodeURIComponent(params.accountId)}/folders`,
    accessToken: params.accessToken,
  });

  const folders = Array.isArray(data?.data) ? data.data : [];
  const inbox = folders.find(
    (f: any) =>
      String(f.folderName || f.path || '').toLowerCase() === 'inbox' ||
      String(f.folderType || '').toLowerCase() === 'inbox'
  );
  return inbox?.folderId ? String(inbox.folderId) : folders[0]?.folderId ? String(folders[0].folderId) : null;
}

export async function listZohoInboxMessages(params: {
  accessToken: string;
  mailApiBaseUrl: string;
  accountId: string;
  folderId?: string | null;
  start?: number;
  limit?: number;
}): Promise<ZohoRawMessageSummary[]> {
  const baseUrl = params.mailApiBaseUrl.replace(/\/+$/, '');
  const start = Math.max(1, params.start ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 25));

  const qs = new URLSearchParams({
    start: String(start),
    limit: String(limit),
    sortBy: 'date',
    sortorder: 'false',
  });
  if (params.folderId) {
    qs.set('folderId', params.folderId);
  }

  const { data } = await zohoMailRequest<{ data?: any[] }>({
    url: `${baseUrl}/api/accounts/${encodeURIComponent(params.accountId)}/messages/view?${qs.toString()}`,
    accessToken: params.accessToken,
  });

  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.map((m: any) => ({
    messageId: String(m.messageId || '').trim(),
    threadId: m.threadId ? String(m.threadId) : undefined,
    folderId: m.folderId ? String(m.folderId) : params.folderId || undefined,
    fromAddress: String(m.fromAddress || m.sender || '').trim(),
    toAddress: m.toAddress ? String(m.toAddress) : undefined,
    ccAddress: m.ccAddress ? String(m.ccAddress) : undefined,
    subject: String(m.subject || '(No Subject)'),
    summary: m.summary ? String(m.summary) : undefined,
    receivedTimeMs: Number(m.receivedTime || m.sentDateInGMT || Date.now()),
    inReplyTo: m.inReplyTo ? String(m.inReplyTo) : undefined,
    references: Array.isArray(m.references)
      ? m.references.map(String)
      : typeof m.references === 'string' && m.references
      ? m.references.split(/\s+/).filter(Boolean)
      : undefined,
    internetMessageId: m.internetMessageId ? String(m.internetMessageId) : undefined,
    rawHeaders: typeof m === 'object' && m ? (m as Record<string, unknown>) : undefined,
  }));
}

export async function getZohoMessageContent(params: {
  accessToken: string;
  mailApiBaseUrl: string;
  accountId: string;
  folderId: string;
  messageId: string;
}): Promise<{ content: string; htmlContent?: string }> {
  const baseUrl = params.mailApiBaseUrl.replace(/\/+$/, '');
  const { data } = await zohoMailRequest<{ data?: any }>({
    url: `${baseUrl}/api/accounts/${encodeURIComponent(params.accountId)}/folders/${encodeURIComponent(params.folderId)}/messages/${encodeURIComponent(params.messageId)}/content`,
    accessToken: params.accessToken,
  });
  const htmlContent = typeof data?.data?.content === 'string' ? data.data.content : '';
  return {
    content: htmlContent,
    htmlContent,
  };
}

