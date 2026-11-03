import { describe, it, expect } from 'vitest';
import {
  computeDraftHash,
  verifyDraftHash,
  getApprovedPackage,
  APPROVED_PRICING_CATALOGUE,
} from '@/lib/crm/pricing-and-hash';

describe('Commercial Safety: Pricing Catalogue Integrity', () => {
  it('contains approved packages with locked pricing', () => {
    expect(APPROVED_PRICING_CATALOGUE.length).toBeGreaterThanOrEqual(3);
    const starter = getApprovedPackage('pkg-web-starter');
    expect(starter?.approved_price_inr).toBe(9999);
    expect(starter?.deliverables.length).toBeGreaterThan(0);
  });

  it('returns null for unapproved / invented packages', () => {
    expect(getApprovedPackage('pkg-invented-free-offer')).toBeNull();
  });
});

describe('Human-in-the-Loop: Cryptographic Payload Hash', () => {
  const originalDraft = 'Hello! Would you like a demo of our modern Next.js website?';
  const recipient = '9876543210';

  it('computes consistent hash for identical content', () => {
    const hash1 = computeDraftHash(originalDraft, recipient);
    const hash2 = computeDraftHash(originalDraft, recipient);
    expect(hash1).toBe(hash2);
    expect(verifyDraftHash(originalDraft, recipient, hash1)).toBe(true);
  });

  it('strictly invalidates approval if even one character changes', () => {
    const originalHash = computeDraftHash(originalDraft, recipient);
    const tamperedDraft = 'Hello! Would you like a demo of our modern Next.js website? '; // added trailing whitespace or char
    const totallyChanged = 'Hello! We offer a 50% discount right now.';

    expect(verifyDraftHash(tamperedDraft, recipient, originalHash)).toBe(false);
    expect(verifyDraftHash(totallyChanged, recipient, originalHash)).toBe(false);
  });

  it('strictly invalidates approval if recipient changes', () => {
    const originalHash = computeDraftHash(originalDraft, recipient);
    const wrongRecipient = '9999999999';

    expect(verifyDraftHash(originalDraft, wrongRecipient, originalHash)).toBe(false);
  });
});

