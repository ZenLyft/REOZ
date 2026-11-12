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

export interface PushSubscriptionRecord {
  id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const TE = new TextEncoder();

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

export function getVapidConfig() {
  return {
    publicKey: (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim(),
    privateKey: (process.env.VAPID_PRIVATE_KEY || '').trim(),
    subject: (process.env.VAPID_SUBJECT || 'mailto:niresh@zenlyft.in').trim(),
  };
}

export async function dispatchPushToSubscription(
  sub: PushSubscriptionRecord,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; expired?: boolean }> {
  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!publicKey || !privateKey) {
    return { ok: false, status: 0 };
  }

  const audience = new URL(sub.endpoint).origin;
  const authorization = await createVapidAuthorizationHeader({
    audience,
    subject,
    vapidPublicKey: publicKey,
    vapidPrivateKey: privateKey,
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

  return {
    ok: res.ok || res.status === 201,
    status: res.status,
    expired: res.status === 404 || res.status === 410,
  };
}

/**
 * Persists every founder event to `founder_notifications` and immediately pushes
 * a lock-screen Web Push alert to all registered iPhone/PWA devices.
 */
export async function notifyFounder(input: FounderNotificationInput): Promise<{
  stored: boolean;
  pushedCount: number;
}> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { stored: false, pushedCount: 0 };
  }

  try {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from('system_settings')
      .select('notify_every_event')
      .eq('id', 'zenlyft-global-settings')
      .maybeSingle();

    const shouldNotify =
      (settings as { notify_every_event?: boolean } | null)?.notify_every_event ?? true;

    const targetUrl = input.url || '/dashboard/approvals';
    const { error: insertErr } = await admin.from('founder_notifications').insert({
      category: input.category,
      title: input.title,
      body: input.body,
      url: targetUrl,
      lead_id: input.leadId || null,
      approval_id: input.approvalId || null,
      metadata: input.metadata || {},
    });

    if (!shouldNotify) {
      return { stored: !insertErr, pushedCount: 0 };
    }

    const { publicKey, privateKey } = getVapidConfig();
    if (!publicKey || !privateKey) {
      return { stored: !insertErr, pushedCount: 0 };
    }

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('is_active', true);

    if (!subs || subs.length === 0) {
      return { stored: !insertErr, pushedCount: 0 };
    }

    let pushedCount = 0;
    const now = new Date().toISOString();

    for (const sub of subs as PushSubscriptionRecord[]) {
      try {
        const result = await dispatchPushToSubscription(sub, {
          title: input.title,
          body: input.body,
          url: targetUrl,
          tag: `reoz-${input.category}`,
          category: input.category,
        });

        if (result.ok) {
          pushedCount++;
          if (sub.id) {
            await admin
              .from('push_subscriptions')
              .update({ last_notified_at: now, updated_at: now })
              .eq('id', sub.id);
          }
        } else if (result.expired && sub.id) {
          await admin
            .from('push_subscriptions')
            .update({ is_active: false, updated_at: now })
            .eq('id', sub.id);
        }
      } catch {
        // Continue delivering to remaining devices
      }
    }

    return { stored: !insertErr, pushedCount };
  } catch {
    return { stored: false, pushedCount: 0 };
  }
}

