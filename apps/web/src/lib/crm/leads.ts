import { z } from 'zod';
import { OrgType, PipelineStage, WebsiteStatus, ConfidenceLevel } from '@/lib/types/database';

export const VALID_PIPELINE_STAGES: readonly PipelineStage[] = [
  'discovered',
  'qualified',
  'contacted',
  'replied',
  'proposal',
  'won',
  'lost',
  'not_a_fit',
  'do_not_contact',
  'on_hold',
] as const;

export const VALID_TRANSITIONS: Record<PipelineStage, readonly PipelineStage[]> = {
  discovered: ['qualified', 'not_a_fit', 'lost', 'do_not_contact', 'on_hold'],
  qualified: ['contacted', 'not_a_fit', 'lost', 'do_not_contact', 'on_hold'],
  contacted: ['replied', 'not_a_fit', 'lost', 'do_not_contact', 'on_hold'],
  replied: ['proposal', 'not_a_fit', 'lost', 'do_not_contact', 'on_hold'],
  proposal: ['won', 'lost', 'not_a_fit', 'do_not_contact', 'on_hold'],
  won: ['on_hold'],
  lost: ['discovered', 'on_hold'],
  not_a_fit: ['discovered'],
  do_not_contact: [], // Terminal restriction
  on_hold: ['discovered', 'qualified', 'contacted', 'replied', 'proposal', 'lost'],
};

export function canTransitionStage(from: PipelineStage, to: PipelineStage): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
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

