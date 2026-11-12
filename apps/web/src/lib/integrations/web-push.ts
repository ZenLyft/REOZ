import { createAdminClient } from '@/lib/supabase/server';

export interface FounderNotificationInput {
  category:
    | 'discovery'
    | 'first_cold_sent'
    | 'reply_received'
    | 'permission_required'
    | 'openwa_alert'
    | 'system';
  title: string;
  body: string;
  url?: string;
  leadId?: string | null;
  approvalId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FounderNotificationItem {
  id: string;
  category: string;
  title: string;
  body: string;
  url: string;
  lead_id?: string | null;
  approval_id?: string | null;
  read_at: string | null;
  created_at: string;
}

export interface PushSubscriptionRecord {
  id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  device_label?: string;
  last_notified_at?: string | null;
  created_at?: string;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
  source: 'env' | 'supabase' | 'generated' | 'unconfigured';
}

const TE = new TextEncoder();
const VAPID_FACT_ID = 'reoz_vapid_keypair';
const VAPID_SCOPE = 'reoz_system_config';
const PUSH_SUB_SCOPE = 'reoz_push_subscription';
const READ_STATE_FACT_ID = 'reoz_notif_read_state';
const AUTOPILOT_FLAGS_FACT_ID = 'reoz_autopilot_flags';

let cachedVapid: VapidConfig | null = null;

function isMissingTableOrColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    code === '42P01' ||
    code === '42703' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(TE.encode(text)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, toArrayBuffer(data));
  return new Uint8Array(sig);
}

async function hkdfExtractAndExpand(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const t1 = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return t1.slice(0, length);
}

/**
 * Generates an uncompressed P-256 ECDSA VAPID keypair via Web Crypto API.
 */
export async function generateVapidKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  if (rawPub.length !== 65 || !jwk.d) {
    throw new Error('Failed to export P-256 VAPID keypair');
  }
  return {
    publicKey: uint8ArrayToBase64Url(rawPub),
    privateKey: String(jwk.d),
  };
}

/**
 * Encrypts a push payload using RFC 8291 (`aes128gcm`) with Web Crypto API
 * so it runs natively on Cloudflare Workers & iOS APNs Web Push endpoints.
 */
export async function encryptWebPushPayload(
  payloadText: string,
  clientPublicKeyB64: string,
  authSecretB64: string
): Promise<Uint8Array> {
  const clientPublicKeyBytes = base64UrlToUint8Array(clientPublicKeyB64);
  const authSecret = base64UrlToUint8Array(authSecretB64);

  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(clientPublicKeyBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );

  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeys.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedBits);
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey)
  );

  const keyInfo = concatBytes(
    TE.encode('WebPush: info\0'),
    clientPublicKeyBytes,
    serverPublicKeyRaw
  );
  const ikm = await hkdfExtractAndExpand(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdfExtractAndExpand(
    salt,
    ikm,
    TE.encode('Content-Encoding: aes128gcm\0'),
    16
  );
  const nonce = await hkdfExtractAndExpand(
    salt,
    ikm,
    TE.encode('Content-Encoding: nonce\0'),
    12
  );

  const contentKey = await crypto.subtle.importKey('raw', toArrayBuffer(cek), { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  const plaintext = concatBytes(TE.encode(payloadText), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
      contentKey,
      toArrayBuffer(plaintext)
    )
  );

  const recordSizeHeader = new Uint8Array(4);
  new DataView(recordSizeHeader.buffer).setUint32(0, 4096, false);

  return concatBytes(
    salt,
    recordSizeHeader,
    new Uint8Array([serverPublicKeyRaw.length]),
    serverPublicKeyRaw,
    ciphertext
  );
}

/**
 * Signs an ES256 VAPID JWT using raw 65-byte uncompressed public key + 32-byte scalar private key.
 */
export async function createVapidAuthorizationHeader(options: {
  audience: string;
  subject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  expirationSeconds?: number;
}): Promise<string> {
  const pubBytes = base64UrlToUint8Array(options.vapidPublicKey);
  if (pubBytes.length !== 65 || pubBytes[0] !== 4) {
    throw new Error('Invalid VAPID public key format (expected 65-byte uncompressed P-256 key)');
  }
  const x = uint8ArrayToBase64Url(pubBytes.slice(1, 33));
  const y = uint8ArrayToBase64Url(pubBytes.slice(33, 65));

  const headerB64 = uint8ArrayToBase64Url(TE.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const exp = Math.floor(Date.now() / 1000) + (options.expirationSeconds || 12 * 3600);
  const payloadB64 = uint8ArrayToBase64Url(
    TE.encode(
      JSON.stringify({
        aud: options.audience,
        exp,
        sub: options.subject,
      })
    )
  );

  const unsigned = `${headerB64}.${payloadB64}`;
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d: options.vapidPrivateKey,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      toArrayBuffer(TE.encode(unsigned))
    )
  );
  const jwt = `${unsigned}.${uint8ArrayToBase64Url(signature)}`;
  return `vapid t=${jwt}, k=${options.vapidPublicKey}`;
}

export function getVapidConfig(): VapidConfig {
  const envPub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
  const envPriv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || 'mailto:niresh@zenlyft.in').trim();

  if (envPub && envPriv) {
    return { publicKey: envPub, privateKey: envPriv, subject, source: 'env' };
  }
  if (cachedVapid?.publicKey && cachedVapid?.privateKey) {
    return cachedVapid;
  }
  return { publicKey: '', privateKey: '', subject, source: 'unconfigured' };
}

/**
 * Resolves VAPID keys with zero manual setup:
 * 1. Env vars (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)
 * 2. Persistent keypair in Supabase (`ascension_memory_facts`)
 * 3. Auto-generates & stores a valid P-256 ECDSA keypair on first run
 */
export async function resolveVapidConfig(): Promise<VapidConfig> {
  const sync = getVapidConfig();
  if (sync.publicKey && sync.privateKey) {
    return sync;
  }

  const subject = (process.env.VAPID_SUBJECT || 'mailto:niresh@zenlyft.in').trim();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return sync;
  }

  try {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('ascension_memory_facts')
      .select('metadata')
      .eq('fact_id', VAPID_FACT_ID)
      .maybeSingle();

    const stored = (existing?.metadata || {}) as { publicKey?: string; privateKey?: string };
    if (stored.publicKey && stored.privateKey) {
      cachedVapid = {
        publicKey: stored.publicKey,
        privateKey: stored.privateKey,
        subject,
        source: 'supabase',
      };
      return cachedVapid;
    }

    const generated = await generateVapidKeyPair();
    await admin.from('ascension_memory_facts').upsert(
      {
        fact_id: VAPID_FACT_ID,
        scope: VAPID_SCOPE,
        subject: 'REOZ Web Push VAPID Keypair',
        content: generated.publicKey,
        classification: 'internal',
        provenance_source: 'web_crypto',
        created_by_agent: 'reoz-pwa',
        metadata: {
          publicKey: generated.publicKey,
          privateKey: generated.privateKey,
          subject,
          created_at: new Date().toISOString(),
        },
      },
      { onConflict: 'fact_id' }
    );

    const { data: verify } = await admin
      .from('ascension_memory_facts')
      .select('metadata')
      .eq('fact_id', VAPID_FACT_ID)
      .maybeSingle();

    const finalKeys = (verify?.metadata || generated) as { publicKey?: string; privateKey?: string };
    cachedVapid = {
      publicKey: finalKeys.publicKey || generated.publicKey,
      privateKey: finalKeys.privateKey || generated.privateKey,
      subject,
      source: 'generated',
    };
    return cachedVapid;
  } catch {
    const generated = await generateVapidKeyPair();
    cachedVapid = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
      source: 'generated',
    };
    return cachedVapid;
  }
}

export async function dispatchPushToSubscription(
  sub: PushSubscriptionRecord,
  payload: Record<string, unknown>,
  vapid?: VapidConfig
): Promise<{ ok: boolean; status: number; expired?: boolean; error?: string }> {
  const cfg = vapid && vapid.publicKey && vapid.privateKey ? vapid : await resolveVapidConfig();
  if (!cfg.publicKey || !cfg.privateKey) {
    return { ok: false, status: 0, error: 'Missing VAPID keys' };
  }

  const audience = new URL(sub.endpoint).origin;
  const authorization = await createVapidAuthorizationHeader({
    audience,
    subject: cfg.subject,
    vapidPublicKey: cfg.publicKey,
    vapidPrivateKey: cfg.privateKey,
  });
  const encryptedBody = await encryptWebPushPayload(
    JSON.stringify(payload),
    sub.p256dh,
    sub.auth
  );

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Urgency: 'high',
    },
    body: toArrayBuffer(encryptedBody),
  });

  let errDetail: string | undefined;
  if (!res.ok && res.status !== 201) {
    errDetail = (await res.text().catch(() => '')).slice(0, 160) || `HTTP ${res.status}`;
  }

  return {
    ok: res.ok || res.status === 201,
    status: res.status,
    expired: res.status === 404 || res.status === 410,
    error: errDetail,
  };
}

export async function upsertPushSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel: string;
  userAgent: string;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: params.userId,
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      device_label: params.deviceLabel,
      user_agent: params.userAgent.slice(0, 300),
      is_active: true,
      updated_at: now,
    },
    { onConflict: 'endpoint' }
  );

  if (!error) {
    return { ok: true };
  }

  if (!isMissingTableOrColumnError(error)) {
    return { ok: false, error: error.message };
  }

  // Zero-migration fallback in ascension_memory_facts
  const factId = `pushsub_${(await sha256Hex(params.endpoint)).slice(0, 24)}`;
  const { error: fbErr } = await admin.from('ascension_memory_facts').upsert(
    {
      fact_id: factId,
      scope: PUSH_SUB_SCOPE,
      subject: params.deviceLabel,
      content: params.endpoint,
      classification: 'active',
      provenance_source: 'web_push',
      created_by_agent: 'reoz-pwa',
      metadata: {
        id: factId,
        user_id: params.userId,
        endpoint: params.endpoint,
        p256dh: params.p256dh,
        auth: params.auth,
        device_label: params.deviceLabel,
        user_agent: params.userAgent.slice(0, 300),
        is_active: true,
        last_notified_at: null,
        created_at: now,
        updated_at: now,
      },
    },
    { onConflict: 'fact_id' }
  );

  return fbErr ? { ok: false, error: fbErr.message } : { ok: true };
}

export async function deactivatePushSubscription(endpoint: string): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from('push_subscriptions')
    .update({ is_active: false, updated_at: now })
    .eq('endpoint', endpoint);

  if (!error || !isMissingTableOrColumnError(error)) {
    return;
  }

  const factId = `pushsub_${(await sha256Hex(endpoint)).slice(0, 24)}`;
  const { data: existing } = await admin
    .from('ascension_memory_facts')
    .select('metadata')
    .eq('fact_id', factId)
    .maybeSingle();

  if (existing) {
    const meta = (existing.metadata || {}) as Record<string, unknown>;
    await admin
      .from('ascension_memory_facts')
      .update({
        classification: 'inactive',
        metadata: { ...meta, is_active: false, updated_at: now },
      })
      .eq('fact_id', factId);
  }
}

export async function listActivePushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, device_label, last_notified_at, created_at')
    .eq('is_active', true);

  if (!error) {
    return (data || []) as PushSubscriptionRecord[];
  }

  if (!isMissingTableOrColumnError(error)) {
    return [];
  }

  const { data: facts } = await admin
    .from('ascension_memory_facts')
    .select('fact_id, metadata, created_at')
    .eq('scope', PUSH_SUB_SCOPE)
    .eq('classification', 'active');

  return (facts || [])
    .map((f) => {
      const m = (f.metadata || {}) as Partial<PushSubscriptionRecord> & { is_active?: boolean };
      if (m.is_active === false || !m.endpoint || !m.p256dh || !m.auth) return null;
      return {
        id: f.fact_id,
        endpoint: m.endpoint,
        p256dh: m.p256dh,
        auth: m.auth,
        device_label: m.device_label || 'Founder PWA Device',
        last_notified_at: m.last_notified_at || null,
        created_at: m.created_at || f.created_at,
      } as PushSubscriptionRecord;
    })
    .filter((x): x is PushSubscriptionRecord => x !== null);
}

async function getShouldNotifyFounder(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data: settings, error } = await admin
      .from('system_settings')
      .select('notify_every_event')
      .eq('id', 'zenlyft-global-settings')
      .maybeSingle();

    if (!error && typeof (settings as { notify_every_event?: boolean } | null)?.notify_every_event === 'boolean') {
      return Boolean((settings as { notify_every_event?: boolean }).notify_every_event);
    }

    const { data: fact } = await admin
      .from('ascension_memory_facts')
      .select('metadata')
      .eq('fact_id', AUTOPILOT_FLAGS_FACT_ID)
      .maybeSingle();

    const flag = (fact?.metadata as { notify_every_event?: boolean } | null)?.notify_every_event;
    return typeof flag === 'boolean' ? flag : true;
  } catch {
    return true;
  }
}

export async function listFounderNotifications(limit = 30): Promise<{
  notifications: FounderNotificationItem[];
  unreadCount: number;
}> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { notifications: [], unreadCount: 0 };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('founder_notifications')
    .select('id, category, title, body, url, lead_id, approval_id, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!error) {
    const list = (data || []) as FounderNotificationItem[];
    return {
      notifications: list,
      unreadCount: list.filter((n) => !n.read_at).length,
    };
  }

  if (!isMissingTableOrColumnError(error)) {
    return { notifications: [], unreadCount: 0 };
  }

  // Fallback: read from audit_log + read cursor in ascension_memory_facts
  const [{ data: logs }, { data: readFact }] = await Promise.all([
    admin
      .from('audit_log')
      .select('id, object_type, object_id, timestamp, metadata_without_secrets')
      .eq('action', 'founder_notification')
      .order('timestamp', { ascending: false })
      .limit(limit),
    admin
      .from('ascension_memory_facts')
      .select('metadata')
      .eq('fact_id', READ_STATE_FACT_ID)
      .maybeSingle(),
  ]);

  const readMeta = (readFact?.metadata || {}) as {
    readAllBefore?: string;
    readIds?: string[];
  };
  const readAllBeforeMs = readMeta.readAllBefore ? Date.parse(readMeta.readAllBefore) : 0;
  const readIdSet = new Set(Array.isArray(readMeta.readIds) ? readMeta.readIds : []);

  const list: FounderNotificationItem[] = (logs || []).map((row) => {
    const m = (row.metadata_without_secrets || {}) as Record<string, unknown>;
    const id = String(m.id || row.object_id || row.id);
    const createdAt = String(m.created_at || row.timestamp);
    const createdMs = Date.parse(createdAt) || 0;
    const isRead = readIdSet.has(id) || (readAllBeforeMs > 0 && createdMs <= readAllBeforeMs);
    return {
      id,
      category: String(m.category || row.object_type || 'system'),
      title: String(m.title || 'REOZ Alert'),
      body: String(m.body || ''),
      url: String(m.url || '/dashboard/approvals'),
      lead_id: (m.lead_id as string | null) || null,
      approval_id: (m.approval_id as string | null) || null,
      read_at: isRead ? readMeta.readAllBefore || createdAt : null,
      created_at: createdAt,
    };
  });

  return {
    notifications: list,
    unreadCount: list.filter((n) => !n.read_at).length,
  };
}

export async function markFounderNotificationsRead(options: {
  markAllRead?: boolean;
  ids?: string[];
}): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (options.markAllRead) {
    const { error } = await admin
      .from('founder_notifications')
      .update({ read_at: now })
      .is('read_at', null);
    if (!error || !isMissingTableOrColumnError(error)) return;
  } else if (Array.isArray(options.ids) && options.ids.length > 0) {
    const { error } = await admin
      .from('founder_notifications')
      .update({ read_at: now })
      .in('id', options.ids);
    if (!error || !isMissingTableOrColumnError(error)) return;
  }

  // Fallback read cursor in ascension_memory_facts
  const { data: existing } = await admin
    .from('ascension_memory_facts')
    .select('metadata')
    .eq('fact_id', READ_STATE_FACT_ID)
    .maybeSingle();

  const prev = (existing?.metadata || {}) as { readAllBefore?: string; readIds?: string[] };
  const nextMeta = options.markAllRead
    ? { readAllBefore: now, readIds: [] }
    : {
        readAllBefore: prev.readAllBefore,
        readIds: Array.from(new Set([...(prev.readIds || []), ...(options.ids || [])])).slice(-200),
      };

  await admin.from('ascension_memory_facts').upsert(
    {
      fact_id: READ_STATE_FACT_ID,
      scope: VAPID_SCOPE,
      subject: 'REOZ Notification Read State',
      content: now,
      classification: 'internal',
      provenance_source: 'reoz_ui',
      created_by_agent: 'reoz-pwa',
      metadata: nextMeta,
    },
    { onConflict: 'fact_id' }
  );
}

/**
 * Persists every founder event (primary `founder_notifications` or fallback `audit_log`)
 * and immediately pushes a lock-screen Web Push alert to all registered iPhone/PWA devices.
 */
export async function notifyFounder(input: FounderNotificationInput): Promise<{
  stored: boolean;
  pushedCount: number;
  totalDevices: number;
  errors?: string[];
}> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { stored: false, pushedCount: 0, totalDevices: 0 };
  }

  try {
    const admin = createAdminClient();
    const shouldNotify = await getShouldNotifyFounder();
    const targetUrl = input.url || '/dashboard/approvals';
    const now = new Date().toISOString();
    const notifId = crypto.randomUUID();

    let stored = false;
    const { error: insertErr } = await admin.from('founder_notifications').insert({
      id: notifId,
      category: input.category,
      title: input.title,
      body: input.body,
      url: targetUrl,
      lead_id: input.leadId || null,
      approval_id: input.approvalId || null,
      metadata: input.metadata || {},
      created_at: now,
    });

    if (!insertErr) {
      stored = true;
    } else if (isMissingTableOrColumnError(insertErr)) {
      const { error: auditErr } = await admin.from('audit_log').insert({
        actor_type: 'system',
        actor_id: 'reoz-notifier',
        action: 'founder_notification',
        object_type: input.category,
        object_id: notifId,
        timestamp: now,
        result: 'success',
        metadata_without_secrets: {
          id: notifId,
          category: input.category,
          title: input.title,
          body: input.body,
          url: targetUrl,
          lead_id: input.leadId || null,
          approval_id: input.approvalId || null,
          metadata: input.metadata || {},
          created_at: now,
        },
      });
      stored = !auditErr;
    }

    if (!shouldNotify) {
      return { stored, pushedCount: 0, totalDevices: 0 };
    }

    const vapid = await resolveVapidConfig();
    const subs = await listActivePushSubscriptions();
    if (!vapid.publicKey || !vapid.privateKey || subs.length === 0) {
      return { stored, pushedCount: 0, totalDevices: subs.length };
    }

    let pushedCount = 0;
    const errors: string[] = [];

    for (const sub of subs) {
      try {
        const result = await dispatchPushToSubscription(
          sub,
          {
            id: notifId,
            title: input.title,
            body: input.body,
            url: targetUrl,
            tag: `reoz-${input.category}-${Date.now()}`,
            category: input.category,
          },
          vapid
        );

        if (result.ok) {
          pushedCount++;
          if (sub.id && !sub.id.startsWith('pushsub_')) {
            await admin
              .from('push_subscriptions')
              .update({ last_notified_at: now, updated_at: now })
              .eq('id', sub.id);
          } else if (sub.id?.startsWith('pushsub_')) {
            const { data: existingFact } = await admin
              .from('ascension_memory_facts')
              .select('metadata')
              .eq('fact_id', sub.id)
              .maybeSingle();
            if (existingFact) {
              await admin
                .from('ascension_memory_facts')
                .update({
                  metadata: {
                    ...(existingFact.metadata as Record<string, unknown>),
                    last_notified_at: now,
                    updated_at: now,
                  },
                })
                .eq('fact_id', sub.id);
            }
          }
        } else {
          if (result.error) {
            errors.push(result.error);
          }
          if (result.expired) {
            await deactivatePushSubscription(sub.endpoint);
          }
        }
      } catch (err: unknown) {
        errors.push(err instanceof Error ? err.message : 'Push dispatch error');
      }
    }

    return {
      stored,
      pushedCount,
      totalDevices: subs.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch {
    return { stored: false, pushedCount: 0, totalDevices: 0 };
  }
}
