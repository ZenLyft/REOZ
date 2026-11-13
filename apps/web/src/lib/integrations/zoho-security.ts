import crypto from 'crypto';

export type ZohoConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'SYNCING'
  | 'SYNC_ERROR'
  | 'AUTH_EXPIRED';

export type EmailDeliveryLifecycleStatus =
  | 'DRAFT_PENDING'
  | 'APPROVED'
  | 'SENDING'
  | 'ACCEPTED'
  | 'SENT'
  | 'FAILED'
  | 'DELIVERY_STATUS_UNKNOWN'
  | 'REJECTED'
  | 'CANCELLED'
  | 'RECEIVED';

export type ReplyClassification =
  | 'Interested'
  | 'Meeting requested'
  | 'Wants pricing'
  | 'Needs more information'
  | 'Follow-up later'
  | 'Not interested'
  | 'Unsubscribe request'
  | 'Out of office'
  | 'Automated response'
  | 'Unclear';

export interface ZohoRegionalEndpoints {
  dataCenter: string;
  accountsBaseUrl: string;
  mailApiBaseUrl: string;
}

const ZOHO_DC_REGISTRY: Record<string, ZohoRegionalEndpoints> = {
  in: {
    dataCenter: 'in',
    accountsBaseUrl: 'https://accounts.zoho.in',
    mailApiBaseUrl: 'https://mail.zoho.in',
  },
  us: {
    dataCenter: 'us',
    accountsBaseUrl: 'https://accounts.zoho.com',
    mailApiBaseUrl: 'https://mail.zoho.com',
  },
  com: {
    dataCenter: 'us',
    accountsBaseUrl: 'https://accounts.zoho.com',
    mailApiBaseUrl: 'https://mail.zoho.com',
  },
  eu: {
    dataCenter: 'eu',
    accountsBaseUrl: 'https://accounts.zoho.eu',
    mailApiBaseUrl: 'https://mail.zoho.eu',
  },
  au: {
    dataCenter: 'au',
    accountsBaseUrl: 'https://accounts.zoho.com.au',
    mailApiBaseUrl: 'https://mail.zoho.com.au',
  },
  jp: {
    dataCenter: 'jp',
    accountsBaseUrl: 'https://accounts.zoho.jp',
    mailApiBaseUrl: 'https://mail.zoho.jp',
  },
  cn: {
    dataCenter: 'cn',
    accountsBaseUrl: 'https://accounts.zoho.com.cn',
    mailApiBaseUrl: 'https://mail.zoho.com.cn',
  },
  ca: {
    dataCenter: 'ca',
    accountsBaseUrl: 'https://accounts.zohocloud.ca',
    mailApiBaseUrl: 'https://mail.zohocloud.ca',
  },
  sa: {
    dataCenter: 'sa',
    accountsBaseUrl: 'https://accounts.zoho.sa',
    mailApiBaseUrl: 'https://mail.zoho.sa',
  },
};

/**
 * Resolves and validates Zoho Accounts & Mail regional base URLs against a strict allowlist.
 * Prevents SSRF via untrusted `accounts-server` query parameters during OAuth callback.
 */
export function resolveZohoRegionalEndpoints(params?: {
  accountsServer?: string | null;
  location?: string | null;
  defaultAccountsUrl?: string | null;
  defaultMailUrl?: string | null;
}): ZohoRegionalEndpoints {
  const accountsServer = String(params?.accountsServer || '').trim().replace(/\/+$/, '').toLowerCase();
  if (accountsServer) {
    try {
      const parsed = new URL(accountsServer);
      if (parsed.protocol === 'https:') {
        const matched = Object.values(ZOHO_DC_REGISTRY).find(
          (entry) => entry.accountsBaseUrl === `${parsed.protocol}//${parsed.host}`
        );
        if (matched) return matched;
      }
    } catch {
      // Fall through to location / configured default
    }
  }

  const locKey = String(params?.location || '').trim().toLowerCase();
  if (locKey && ZOHO_DC_REGISTRY[locKey]) {
    return ZOHO_DC_REGISTRY[locKey];
  }

  const configuredAccounts = String(
    params?.defaultAccountsUrl || process.env.ZOHO_ACCOUNTS_BASE_URL || 'https://accounts.zoho.in'
  )
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();

  const matchedDefault = Object.values(ZOHO_DC_REGISTRY).find(
    (entry) => entry.accountsBaseUrl === configuredAccounts
  );
  if (matchedDefault) {
    return matchedDefault;
  }

  const configuredMail = String(
    params?.defaultMailUrl || process.env.ZOHO_MAIL_API_BASE_URL || 'https://mail.zoho.in'
  )
    .trim()
    .replace(/\/+$/, '');

  return {
    dataCenter: locKey || 'in',
    accountsBaseUrl: 'https://accounts.zoho.in',
    mailApiBaseUrl: configuredMail.startsWith('https://mail.zoho.')
      ? configuredMail
      : 'https://mail.zoho.in',
  };
}

const DEFAULT_ZOHO_ENCRYPTION_KEY = 'e82470a5641c56d577d792d8010a00bc';

function deriveAesKey(encryptionKeyOverride?: string): Buffer {
  const raw = String(
    encryptionKeyOverride ??
      process.env.ZOHO_REFRESH_TOKEN_ENCRYPTION_KEY ??
      DEFAULT_ZOHO_ENCRYPTION_KEY
  ).trim();
  if (!raw || raw.length < 16) {
    throw new Error(
      'ZOHO_REFRESH_TOKEN_ENCRYPTION_KEY is missing or too short (minimum 16 characters required).'
    );
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * Encrypts sensitive tokens at rest using AES-256-GCM.
 * Format (`v1:<b64_iv12>:<b64_ct_plus_tag16>`) matches Python backend cryptography cleanly.
 */
export function encryptZohoToken(plaintext: string, encryptionKeyOverride?: string): string {
  const key = deriveAesKey(encryptionKeyOverride);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([encrypted, tag]);
  return `v1:${iv.toString('base64')}:${payload.toString('base64')}`;
}

export function decryptZohoToken(ciphertext: string, encryptionKeyOverride?: string): string {
  const parts = String(ciphertext || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted token envelope format.');
  }
  const key = deriveAesKey(encryptionKeyOverride);
  const iv = Buffer.from(parts[1], 'base64');
  const combined = Buffer.from(parts[2], 'base64');
  if (iv.length !== 12 || combined.length < 17) {
    throw new Error('Malformed encrypted token payload.');
  }
  const ct = combined.subarray(0, combined.length - 16);
  const tag = combined.subarray(combined.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export interface EmailApprovalCanonicalPayload {
  lead_id: string;
  sender: string;
  recipient: string;
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  campaign_id: string;
  template_version: string;
  approval_timestamp: string;
  channel: 'email';
}

function normalizeEmailList(list?: string[] | null): string[] {
  return (list || [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

export function computeZohoEmailApprovalHash(payload: EmailApprovalCanonicalPayload): string {
  const canonical = JSON.stringify({
    approval_timestamp: String(payload.approval_timestamp || '').trim(),
    bcc: normalizeEmailList(payload.bcc),
    body: String(payload.body || ''),
    campaign_id: String(payload.campaign_id || 'default').trim(),
    cc: normalizeEmailList(payload.cc),
    channel: 'email',
    lead_id: String(payload.lead_id || '').trim(),
    recipient: String(payload.recipient || '').trim().toLowerCase(),
    sender: String(payload.sender || '').trim().toLowerCase(),
    subject: String(payload.subject || '').trim(),
    template_version: String(payload.template_version || 'research-v2').trim(),
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function verifyZohoEmailApprovalHash(
  payload: EmailApprovalCanonicalPayload,
  expectedHash: string
): boolean {
  if (!expectedHash || !/^[0-9a-f]{64}$/i.test(expectedHash.trim())) {
    return false;
  }
  const actual = computeZohoEmailApprovalHash(payload);
  return crypto.timingSafeEqual(
    Buffer.from(actual, 'utf8'),
    Buffer.from(expectedHash.trim().toLowerCase(), 'utf8')
  );
}

/**
 * Sanitizes HTML email content for safe previewing: removes script, iframe, object,
 * embed, style tags, inline event handlers, and javascript:/data: script URIs.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return '';
  let clean = String(html);
  clean = clean.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<(iframe|object|embed|form|meta|base|link)\b[^>]*>([\s\S]*?<\/\1>)?/gi, '');
  clean = clean.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  clean = clean.replace(/(href|src)\s*=\s*(["'])\s*(javascript:|vbscript:|data:text\/html)[\s\S]*?\2/gi, '$1="#"');
  return clean.trim();
}

export function stripHtmlToText(htmlOrText: string): string {
  return String(htmlOrText || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const PROMPT_INJECTION_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'ignore_previous_instructions', regex: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i },
  { label: 'override_approval', regex: /override\s+(founder\s+)?approval|skip\s+approval/i },
  { label: 'reveal_secrets', regex: /reveal\s+(system\s+prompt|api[_\s]?key|secret|token|client_secret)/i },
  { label: 'auto_send_command', regex: /execute\s+auto[\s-]?send|send\s+immediately\s+without\s+review/i },
  { label: 'disable_kill_switch', regex: /disable\s+(emergency\s+stop|kill[\s-]?switch)/i },
  { label: 'system_role_spoof', regex: /^\s*(SYSTEM|DEVELOPER|ASSISTANT)\s*:/im },
];

export function detectInboundPromptInjection(text: string): {
  hasInjection: boolean;
  flags: string[];
} {
  const input = String(text || '');
  const flags: string[] = [];
  for (const rule of PROMPT_INJECTION_PATTERNS) {
    if (rule.regex.test(input)) {
      flags.push(rule.label);
    }
  }
  return { hasInjection: flags.length > 0, flags };
}

export function classifyInboundEmailReply(subject: string, bodyText: string): {
  classification: ReplyClassification;
  isUnsubscribe: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
} {
  const text = `${subject || ''}\n${bodyText || ''}`.toLowerCase();

  if (
    /\b(unsubscribe|opt[\s-]?out|remove\s+me|stop\s+(emailing|contacting|sending)|do\s+not\s+(email|contact))\b/.test(
      text
    )
  ) {
    return {
      classification: 'Unsubscribe request',
      isUnsubscribe: true,
      confidence: 'HIGH',
      reason: 'Explicit opt-out / unsubscribe phrase detected.',
    };
  }
  if (/\b(out of office|auto[\s-]?reply|automatic reply|on vacation|away from (office|desk)|pto)\b/.test(text)) {
    return {
      classification: 'Out of office',
      isUnsubscribe: false,
      confidence: 'HIGH',
      reason: 'Out-of-office indicator detected.',
    };
  }
  if (/\b(mailer-daemon|delivery status notification|undeliverable|auto-generated|do not reply|noreply)\b/.test(text)) {
    return {
      classification: 'Automated response',
      isUnsubscribe: false,
      confidence: 'HIGH',
      reason: 'Automated system or bounce notification detected.',
    };
  }
  if (/\b(not interested|no thanks|no need|not looking|pass for now|already have a vendor)\b/.test(text)) {
    return {
      classification: 'Not interested',
      isUnsubscribe: false,
      confidence: 'HIGH',
      reason: 'Decline / not interested signal detected.',
    };
  }
  if (/\b(meeting|schedule a call|book a demo|zoom|google meet|tuesday|wednesday|thursday|friday|calendar|slot|time works)\b/.test(text)) {
    return {
      classification: 'Meeting requested',
      isUnsubscribe: false,
      confidence: 'HIGH',
      reason: 'Prospect asked for or proposed meeting availability.',
    };
  }
  if (/\b(price|pricing|cost|quote|quotation|estimate|budget|inr|rs\.?|₹|charges|fee)\b/.test(text)) {
    return {
      classification: 'Wants pricing',
      isUnsubscribe: false,
      confidence: 'HIGH',
      reason: 'Prospect requested pricing or budget details.',
    };
  }
  if (/\b(next month|next quarter|later|follow up|circle back|busy right now|after exams)\b/.test(text)) {
    return {
      classification: 'Follow-up later',
      isUnsubscribe: false,
      confidence: 'MEDIUM',
      reason: 'Prospect requested follow-up at a later date.',
    };
  }
  if (/\b(more info|more details|send deck|brochure|how does it work|share details|tell me more|explain)\b/.test(text)) {
    return {
      classification: 'Needs more information',
      isUnsubscribe: false,
      confidence: 'MEDIUM',
      reason: 'Prospect requested product or workflow details.',
    };
  }
  if (/\b(interested|sounds good|let'?s discuss|happy to connect|looks relevant|yes please)\b/.test(text)) {
    return {
      classification: 'Interested',
      isUnsubscribe: false,
      confidence: 'MEDIUM',
      reason: 'Positive engagement signal detected.',
    };
  }

  return {
    classification: 'Unclear',
    isUnsubscribe: false,
    confidence: 'LOW',
    reason: 'No unambiguous intent keyword matched; requires founder review.',
  };
}

/**
 * Generates a cautious, approval-required AI reply draft from classified intent.
 * Treats inbound text strictly as untrusted data and never invents unverified metrics/clients.
 */
export function buildSafeAiEmailReplyDraft(params: {
  companyName: string;
  classification: ReplyClassification;
  originalSubject: string;
  selectedService?: string;
  hasInjection?: boolean;
}): {
  subject: string;
  body: string;
  rationale: string;
} {
  const cleanSubject = params.originalSubject.replace(/^re:\s*/i, '').trim() || `ZenLyft Follow-up`;
  const subject = `Re: ${cleanSubject}`;
  const serviceLabel = params.selectedService || 'our workflow software';

  if (params.classification === 'Unsubscribe request' || params.classification === 'Not interested') {
    return {
      subject,
      body: `Hello ${params.companyName} Team,\n\nThank you for letting us know. We have updated our records and will not send further outreach regarding ${serviceLabel}.\n\nWishing your team continued success.\n\nBest regards,\nNiresh Senthoor\nZenLyft`,
      rationale: `Respectful closure draft for "${params.classification}" — only if Founder chooses to acknowledge.`,
    };
  }

  if (params.classification === 'Meeting requested' || params.classification === 'Interested') {
    return {
      subject,
      body: `Hello ${params.companyName} Team,\n\nThank you for your response. I would be glad to walk through how ${serviceLabel} fits into your current operations without disrupting existing workflows.\n\nCould you let us know two convenient 15-minute slots this week (for example, Tuesday or Thursday afternoon IST)?\n\nBest regards,\nNiresh Senthoor\nZenLyft\nhttps://zenlyft.in`,
      rationale: `Generated for "${params.classification}" to move directly to a brief discovery call.`,
    };
  }

  if (params.classification === 'Wants pricing') {
    return {
      subject,
      body: `Hello ${params.companyName} Team,\n\nThank you for asking about pricing for ${serviceLabel}. Because scope depends on your team workflow volume and required integrations, could we review 3–4 quick workflow questions so we can share a transparent, flat estimate tailored to ${params.companyName}?\n\nBest regards,\nNiresh Senthoor\nZenLyft\nhttps://zenlyft.in`,
      rationale: 'Responds to pricing inquiry honestly without fabricating unapproved quotes or discounts.',
    };
  }

  const securityNote = params.hasInjection
    ? ' Inbound message contained suspicious prompt-injection directives which were ignored.'
    : '';

  return {
    subject,
    body: `Hello ${params.companyName} Team,\n\nThank you for getting back to us. I would be glad to share relevant details on how ZenLyft supports teams like yours with ${serviceLabel}.\n\nWhich specific part of your current workflow would be most helpful to review first?\n\nBest regards,\nNiresh Senthoor\nZenLyft\nhttps://zenlyft.in`,
    rationale: `Safe discovery follow-up for "${params.classification}".${securityNote}`,
  };
}

