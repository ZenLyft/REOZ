import crypto from 'crypto';

export interface PricingCataloguePackage {
  id: string;
  service_name: string;
  package_name: string;
  deliverables: string[];
  exclusions: string[];
  estimated_timeline_days: number;
  approved_price_inr: number;
}

export interface CanonicalApprovalPayload {
  lead_id: string;
  recipient: string;
  channel: 'whatsapp' | 'email';
  message_content: string;
  subject?: string | null;
  template_version: string;
  approval_scope: string;
}

export const APPROVED_PRICING_CATALOGUE: readonly PricingCataloguePackage[] = [
  {
    id: 'pkg-web-starter',
    service_name: 'Local Business Website Redesign',
    package_name: 'Starter Business Showcase (3-Page)',
    deliverables: [
      'High-performance Next.js responsive website (Mobile-first)',
      'Direct WhatsApp inquiry integration and Click-to-Call',
      'Google Maps & Google Business Profile location integration',
      'Basic SEO (Title tags, meta descriptions, OpenGraph)',
      'Free Cloudflare Pages SSL & hosting setup',
    ],
    exclusions: ['Payment gateway', 'Custom backend database', 'Content writing from scratch'],
    estimated_timeline_days: 5,
    approved_price_inr: 9999,
  },
  {
    id: 'pkg-web-growth',
    service_name: 'Local Business Website & Booking System',
    package_name: 'Growth Booking & Catalog Suite (5-Page)',
    deliverables: [
      'Everything in Starter',
      'Product / Service showcase catalog',
      'Online appointment / booking request form with instant alerts',
      'Multi-language support option (English + Tamil)',
      'Interactive customer review widget',
    ],
    exclusions: ['Multi-vendor marketplace', 'Native mobile iOS/Android app'],
    estimated_timeline_days: 10,
    approved_price_inr: 17999,
  },
  {
    id: 'pkg-erp-homs',
    service_name: 'Hostel Outpass & Education ERP',
    package_name: 'HOMS Institutional Pilot',
    deliverables: [
      'Student outpass request & parent approval workflow',
      'Warden & Security guard digital scan verification portal',
      'Attendance and leave record tracking',
      'Onboarding workshop & staff training',
    ],
    exclusions: ['Custom hardware turnstiles', 'Campus-wide biometric readers'],
    estimated_timeline_days: 14,
    approved_price_inr: 35000,
  },
] as const;

export function getApprovedPackage(packageId: string): PricingCataloguePackage | null {
  return APPROVED_PRICING_CATALOGUE.find((p) => p.id === packageId) || null;
}

export function isFullSha256Hash(hash?: string | null): boolean {
  return Boolean(hash && /^[0-9a-f]{64}$/i.test(hash.trim()));
}

/**
 * Normalizes a recipient address/number for consistent cryptographic binding.
 */
export function normalizeRecipientForHash(recipient: string, channel?: 'whatsapp' | 'email'): string {
  const trimmed = String(recipient || '').trim();
  if (channel === 'whatsapp' || (!trimmed.includes('@') && /\d{7,}/.test(trimmed))) {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length > 0) return digits;
  }
  return trimmed.toLowerCase();
}

/**
 * Legacy helper preserved for backward compatibility: SHA-256 of recipient + draft text.
 */
export function computeDraftHash(draftContent: string, recipient: string): string {
  const normalized = `${recipient.trim().toLowerCase()}::${draftContent}`;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function verifyDraftHash(draftContent: string, recipient: string, expectedHash: string): boolean {
  if (!isFullSha256Hash(expectedHash)) {
    return false;
  }
  const actualHash = computeDraftHash(draftContent, recipient);
  return actualHash === expectedHash.trim().toLowerCase();
}

/**
 * Canonical SHA-256 payload digest bound to exact Lead ID, Recipient, Channel,
 * Message Content, Subject, Template Version, and Approval Scope.
 */
export function computeCanonicalApprovalHash(payload: CanonicalApprovalPayload): string {
  const canonical = JSON.stringify({
    approval_scope: String(payload.approval_scope || 'first_contact').trim(),
    channel: payload.channel,
    lead_id: String(payload.lead_id || '').trim(),
    message_content: String(payload.message_content || ''),
    recipient: normalizeRecipientForHash(payload.recipient, payload.channel),
    subject: payload.subject ? String(payload.subject).trim() : '',
    template_version: String(payload.template_version || 'research-v2').trim(),
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function verifyCanonicalApprovalHash(
  payload: CanonicalApprovalPayload,
  expectedHash: string
): boolean {
  if (!isFullSha256Hash(expectedHash)) {
    return false;
  }
  const actual = computeCanonicalApprovalHash(payload);
  return actual === expectedHash.trim().toLowerCase();
}
