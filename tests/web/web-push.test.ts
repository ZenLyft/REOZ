import { describe, expect, it } from 'vitest';
import {
  createVapidAuthorizationHeader,
  encryptWebPushPayload,
  uint8ArrayToBase64Url,
} from '@/lib/integrations/web-push';
import { pickAutomatedRegion } from '@/lib/integrations/autonomous-engine';

describe('REOZ iPhone PWA Web Push & Autonomous Engine', () => {
  it('encrypts push payload cleanly in RFC 8291 aes128gcm format', async () => {
    const clientKeys = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const clientPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', clientKeys.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));

    const encrypted = await encryptWebPushPayload(
      JSON.stringify({ title: 'Test REOZ', body: 'Hello Founder' }),
      uint8ArrayToBase64Url(clientPubRaw),
      uint8ArrayToBase64Url(authSecret)
    );

    // RFC 8291 header: 16B salt + 4B record size + 1B keylen (65) + 65B ephemeral pubkey = 86 bytes
    expect(encrypted.length).toBeGreaterThan(86);
    expect(encrypted[20]).toBe(65);
    expect(encrypted[21]).toBe(4); // uncompressed P-256 point
  });

  it('signs ES256 VAPID authorization header using P-256 keys', async () => {
    const ecKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const jwk = await crypto.subtle.exportKey('jwk', ecKeyPair.privateKey);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', ecKeyPair.publicKey));
    const vapidPub = uint8ArrayToBase64Url(rawPub);

    const header = await createVapidAuthorizationHeader({
      audience: 'https://web.push.apple.com',
      subject: 'mailto:niresh@zenlyft.in',
      vapidPublicKey: vapidPub,
      vapidPrivateKey: String(jwk.d),
    });

    expect(header.startsWith('vapid t=')).toBe(true);
    expect(header).toContain(`, k=${vapidPub}`);
    const jwtPart = header.split('t=')[1].split(',')[0];
    expect(jwtPart.split('.')).toHaveLength(3);
  });

  it('rotates continents cleanly and respects explicit region override', () => {
    const picked = pickAutomatedRegion();
    expect(['global', 'north_america', 'europe', 'middle_east', 'apac', 'latam']).toContain(picked);
    expect(pickAutomatedRegion('Bengaluru')).toBe('Bengaluru');
  });
});

