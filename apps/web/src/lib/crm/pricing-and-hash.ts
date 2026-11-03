import crypto from 'crypto';
import { z } from 'zod';

export interface PricingCataloguePackage {
  id: string;
  service_name: string;
  package_name: string;
  deliverables: string[];
  exclusions: string[];
  estimated_timeline_days: number;
  approved_price_inr: number;
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

/**
 * Computes a SHA-256 hash of the exact message draft and recipient.
 * If a single character changes in the draft, the hash invalidates automatically.
 */
export function computeDraftHash(draftContent: string, recipient: string): string {
  const normalized = `${recipient.trim().toLowerCase()}::${draftContent}`;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function verifyDraftHash(draftContent: string, recipient: string, expectedHash: string): boolean {
  const actualHash = computeDraftHash(draftContent, recipient);
  return actualHash === expectedHash;
}
