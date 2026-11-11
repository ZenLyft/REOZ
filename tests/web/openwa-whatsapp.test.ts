import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  verifyOpenWASignature,
  formatWhatsAppChatId,
  classifyIncomingMessage,
} from '@/lib/integrations/openwa-client';
import { computeDraftHash, verifyDraftHash } from '@/lib/crm/pricing-and-hash';

describe('OpenWA Webhook HMAC Signature Verification', () => {
  const secret = 'zenlyft-test-secret-2026';
  const rawBody = JSON.stringify({
    event: 'message.received',
    sessionId: 'zenlyft-wa-01',
    data: { body: 'Hello ZenLyft' },
  });

  it('accepts valid HMAC-SHA256 signature', () => {
    const signature =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    expect(verifyOpenWASignature(rawBody, signature, secret)).toBe(true);
  });

  it('rejects tampered signature', () => {
    const tampered = 'sha256=abcdef1234567890abcdef1234567890';
    expect(verifyOpenWASignature(rawBody, tampered, secret)).toBe(false);
  });

  it('rejects tampered body with original signature', () => {
    const signature =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const tamperedBody = rawBody + ' ';
    expect(verifyOpenWASignature(tamperedBody, signature, secret)).toBe(false);
  });

  it('rejects empty or null signature header', () => {
    expect(verifyOpenWASignature(rawBody, null, secret)).toBe(false);
    expect(verifyOpenWASignature(rawBody, '', secret)).toBe(false);
  });
});

describe('WhatsApp Chat ID Formatter', () => {
  it('formats clean digits into @c.us chat ID', () => {
    expect(formatWhatsAppChatId('919876543210')).toBe('919876543210@c.us');
  });

  it('strips leading + and formatting characters', () => {
    expect(formatWhatsAppChatId('+91-98765 43210')).toBe('919876543210@c.us');
  });

  it('preserves existing @c.us and @g.us JIDs', () => {
    expect(formatWhatsAppChatId('919876543210@c.us')).toBe('919876543210@c.us');
    expect(formatWhatsAppChatId('12036302@g.us')).toBe('12036302@g.us');
  });
});

describe('AI Incoming Message Classification', () => {
  it('identifies explicit opt-out keywords immediately', () => {
    const res1 = classifyIncomingMessage('STOP');
    expect(res1.is_opt_out).toBe(true);
    expect(res1.classification).toBe('opt_out');

    const res2 = classifyIncomingMessage('Please unsubscribe me from this list');
    expect(res2.is_opt_out).toBe(true);
    expect(res2.classification).toBe('opt_out');

    const res3 = classifyIncomingMessage('dont message me again');
    expect(res3.is_opt_out).toBe(true);
  });

  it('classifies demo requests accurately', () => {
    const res = classifyIncomingMessage('Can you show us a demo of the hostel outpass system?');
    expect(res.classification).toBe('requesting_demo');
    expect(res.is_opt_out).toBe(false);
    expect(res.suggested_reply).toContain('walkthrough');
  });

  it('classifies pricing requests accurately', () => {
    const res = classifyIncomingMessage('What are your charges and quotation for a website redesign?');
    expect(res.classification).toBe('asking_pricing');
    expect(res.suggested_reply).toContain('₹9,999');
  });

  it('classifies meeting requests accurately', () => {
    const res = classifyIncomingMessage('Can we schedule a call tomorrow to discuss our college portal?');
    expect(res.classification).toBe('wants_meeting');
    expect(res.suggested_reply).toContain('Niresh');
  });

  it('classifies polite declinations without spamming', () => {
    const res = classifyIncomingMessage('We already have an ERP vendor, not interested');
    expect(res.classification).toBe('not_interested');
    expect(res.recommended_action).toContain('pause outbound');
  });

  it('classifies wrong contact replies', () => {
    const res = classifyIncomingMessage('Wrong person, I am not the owner of this clinic');
    expect(res.classification).toBe('not_right_contact');
  });
});

describe('Founder 1-Tap Cryptographic Approval Gate', () => {
  const draft = 'Namaste Dr. Mohan, would you like a live preview of the patient booking portal?';
  const recipient = '919842211000';

  it('validates authentic approved draft and recipient', () => {
    const hash = computeDraftHash(draft, recipient);
    expect(verifyDraftHash(draft, recipient, hash)).toBe(true);
  });

  it('strictly blocks dispatch if single character was modified', () => {
    const hash = computeDraftHash(draft, recipient);
    const tampered = draft + '!';
    expect(verifyDraftHash(tampered, recipient, hash)).toBe(false);
  });

  it('strictly blocks dispatch if recipient number was changed', () => {
    const hash = computeDraftHash(draft, recipient);
    const wrongRecipient = '919999999999';
    expect(verifyDraftHash(draft, wrongRecipient, hash)).toBe(false);
  });

  it('defaults ZenLyft official WhatsApp business line to 918015929139', async () => {
    const { getOpenWAConfig } = await import('@/lib/integrations/openwa-client');
    const prev = process.env.OPENWA_BUSINESS_PHONE;
    delete process.env.OPENWA_BUSINESS_PHONE;
    try {
      expect(getOpenWAConfig().businessPhone).toBe('918015929139');
    } finally {
      if (prev !== undefined) process.env.OPENWA_BUSINESS_PHONE = prev;
    }
  });
});
