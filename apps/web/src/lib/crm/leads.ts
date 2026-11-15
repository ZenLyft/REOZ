import { z } from 'zod';
import { OrgType, PipelineStage, RevenueDivision, WebsiteStatus, ConfidenceLevel } from '@/lib/types/database';

export const VALID_PIPELINE_STAGES: readonly PipelineStage[] = [
  'discovered',
  'qualified',
  'contacted',
  'responded',
  'meeting',
  'requirements_confirmed',
  'proposal',
  'negotiation',
  'agreement',
  'payment_pending',
  'paid',
  'onboarding',
  'active_project',
  'completed',
  'lost',
  'disqualified',
  'not_a_fit',
  'do_not_contact',
  'on_hold',
] as const;

export const VALID_TRANSITIONS: Record<PipelineStage, readonly PipelineStage[]> = {
  discovered: ['qualified', 'not_a_fit', 'lost', 'disqualified', 'do_not_contact', 'on_hold'],
  qualified: ['contacted', 'not_a_fit', 'lost', 'disqualified', 'do_not_contact', 'on_hold'],
  contacted: ['responded', 'replied', 'meeting', 'not_a_fit', 'lost', 'disqualified', 'do_not_contact', 'on_hold'],
  responded: ['meeting', 'requirements_confirmed', 'proposal', 'not_a_fit', 'lost', 'disqualified', 'do_not_contact', 'on_hold'],
  replied: ['meeting', 'requirements_confirmed', 'proposal', 'not_a_fit', 'lost', 'disqualified', 'do_not_contact', 'on_hold'],
  meeting: ['requirements_confirmed', 'proposal', 'not_a_fit', 'lost', 'disqualified', 'on_hold'],
  requirements_confirmed: ['proposal', 'not_a_fit', 'lost', 'disqualified', 'on_hold'],
  proposal: ['negotiation', 'agreement', 'won', 'lost', 'disqualified', 'not_a_fit', 'do_not_contact', 'on_hold'],
  negotiation: ['agreement', 'proposal', 'lost', 'disqualified', 'on_hold'],
  agreement: ['payment_pending', 'paid', 'won', 'lost', 'on_hold'],
  payment_pending: ['paid', 'won', 'lost', 'on_hold'],
  paid: ['onboarding', 'active_project'],
  won: ['onboarding', 'active_project', 'on_hold'],
  onboarding: ['active_project', 'on_hold'],
  active_project: ['completed', 'on_hold'],
  completed: ['on_hold'],
  lost: ['discovered', 'qualified', 'on_hold'],
  disqualified: ['discovered'],
  not_a_fit: ['discovered'],
  do_not_contact: [], // Terminal restriction
  on_hold: ['discovered', 'qualified', 'contacted', 'responded', 'meeting', 'requirements_confirmed', 'proposal', 'negotiation', 'agreement', 'payment_pending', 'paid', 'onboarding', 'active_project'],
};

export function canTransitionStage(from: PipelineStage, to: PipelineStage): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Classifies lead into Division A (Business Digital Solutions) or Division B (Institutional Technology)
 */
export function classifyRevenueDivision(category: string, orgName: string): RevenueDivision {
  const text = `${category} ${orgName}`.toLowerCase();
  const institutionalKeywords = [
    'college',
    'university',
    'institute',
    'hostel',
    'campus',
    'school',
    'academy of higher education',
    'polytechnic',
    'educational group',
    'panchayat',
  ];

  for (const kw of institutionalKeywords) {
    if (text.includes(kw)) {
      return 'division_b_institutional';
    }
  }

  return 'division_a_digital';
}

/**
 * Calculates delivery cost, gross margin percentage, and discount checks
 */
export function calculateGrossMargin(
  quoteInr: number,
  estimatedHours: number,
  hourlyCostInr = 500,
  infraCostInr = 1000
): {
  deliveryCostInr: number;
  grossMarginInr: number;
  grossMarginPercent: number;
  meetsMinimumMargin: boolean;
} {
  const deliveryCostInr = Math.round(estimatedHours * hourlyCostInr + infraCostInr);
  const grossMarginInr = quoteInr - deliveryCostInr;
  const grossMarginPercent = quoteInr > 0 ? Number(((grossMarginInr / quoteInr) * 100).toFixed(2)) : 0;
  const meetsMinimumMargin = grossMarginPercent >= 65;

  return {
    deliveryCostInr,
    grossMarginInr,
    grossMarginPercent,
    meetsMinimumMargin,
  };
}

/**
 * Returns current ISO year and week string format (e.g. '2026-W46')
 */
export function getISOWeekString(date = new Date()): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${target.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

export function normalizeOrgName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\b(pvt|ltd|limited|private|inc|corp|co|llp|group|services|solutions|firm)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractDomain(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const formatted = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    const parsed = new URL(formatted);
    return parsed.hostname.replace(/^www\./, '').toLowerCase().trim();
  } catch {
    return null;
  }
}

export function normalizePhone(phone?: string | null): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.length >= 7 ? digits : null;
}

export interface ExistingLeadRef {
  id: string;
  organisation_name: string;
  normalised_name: string;
  website_domain?: string | null;
  phone?: string | null;
}

export type DuplicateMatchResult =
  | { type: 'exact_domain'; matchedLead: ExistingLeadRef }
  | { type: 'exact_phone'; matchedLead: ExistingLeadRef }
  | { type: 'near_name'; matchedLead: ExistingLeadRef }
  | { type: 'none' };

export function checkDuplicateLead(
  candidate: { name: string; website_url?: string | null; phone?: string | null },
  existingLeads: ExistingLeadRef[]
): DuplicateMatchResult {
  const normName = normalizeOrgName(candidate.name);
  const domain = extractDomain(candidate.website_url);
  const phone = normalizePhone(candidate.phone);

  for (const existing of existingLeads) {
    // 1. Exact domain match
    if (domain && existing.website_domain && domain === existing.website_domain) {
      return { type: 'exact_domain', matchedLead: existing };
    }
    // 2. Exact public phone match
    if (phone && existing.phone && phone === existing.phone) {
      return { type: 'exact_phone', matchedLead: existing };
    }
    // 3. Normalized name match
    if (normName && existing.normalised_name && normName === existing.normalised_name) {
      return { type: 'near_name', matchedLead: existing };
    }
  }

  return { type: 'none' };
}

export const LeadCreateSchema = z.object({
  organisation_name: z.string().min(2, 'Name must be at least 2 characters'),
  organisation_type: z.enum(['local_business', 'institution']).default('local_business'),
  category: z.string().min(2, 'Category is required'),
  location: z.string().min(2, 'Location is required'),
  website_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  website_status: z
    .enum([
      'not_found_in_checked_sources',
      'verified',
      'unavailable_at_check',
      'appears_outdated',
      'needs_review',
      'not_enough_evidence',
    ])
    .default('not_enough_evidence'),
  status_evidence_note: z.string().min(3, 'Evidence note is required explaining the status'),
  service_interest: z.string().default('Web Development & Automation'),
  public_phone: z.string().optional().or(z.literal('')),
  public_email: z.string().email('Invalid email').optional().or(z.literal('')),
  source_url: z.string().url('Source URL must be valid').optional().or(z.literal('')),
  next_action: z.string().optional(),
  next_follow_up: z.string().optional(),
  contact_restriction: z.enum(['none', 'do_not_contact', 'opt_out']).default('none'),
});

export type LeadCreateInput = z.infer<typeof LeadCreateSchema>;

