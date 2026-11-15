/**
 * REOZ 3.0 Meeting & Discovery Management Module
 * Suggests meeting slots, prepares product-specific discovery briefs & questions,
 * and records verified outcomes.
 */

import { RevenueDivision } from '@/lib/types/database';

export interface MeetingBrief {
  organisationName: string;
  division: RevenueDivision;
  category: string;
  location: string;
  verifiedGaps: string[];
  suggestedAgenda: string[];
  discoveryQuestions: string[];
  demoFocus: string;
}

export function generateMeetingBrief(lead: {
  organisation_name: string;
  category: string;
  location: string;
  revenue_division?: RevenueDivision;
  website_status?: string;
  notes?: string;
}): MeetingBrief {
  const division = lead.revenue_division || 'division_a_digital';
  const isInstitutional = division === 'division_b_institutional';

  const verifiedGaps = [];
  if (lead.website_status === 'not_found_in_checked_sources' || lead.website_status === 'appears_outdated') {
    verifiedGaps.push('Outdated or missing mobile-responsive digital touchpoint for clients/students.');
  }
  verifiedGaps.push('Manual enquiry coordination and uncentralized intake across front desk/wardens.');

  let suggestedAgenda: string[];
  let discoveryQuestions: string[];
  let demoFocus: string;

  if (isInstitutional) {
    suggestedAgenda = [
      '1. Review current student hostel outpass & campus gate verification flow (5 min)',
      '2. Demonstrate HOMS warden approvals, parent WhatsApp alerts, and biometric/QR gate scanner (15 min)',
      '3. Discuss technical integration with campus ERP & offline server requirements (10 min)',
      '4. Plan 14-day zero-risk campus pilot timeline & stakeholder signoff (10 min)',
    ];
    discoveryQuestions = [
      'How many residential students currently stay across campus hostels?',
      'What is your current procedure when a student requests an emergency or weekend outpass?',
      'Do wardens or security guards currently log departures manually on paper registers?',
      'Are parents currently notified via instant SMS or WhatsApp when a student leaves campus?',
      'Who are the key decision-makers required to review a 14-day zero-disruption pilot?',
    ];
    demoFocus = 'HOMS (Hostel Outpass Management System) warden portal, QR scanning, and parent notification sync.';
  } else {
    suggestedAgenda = [
      '1. Understand current patient/customer booking & reception workflow (5 min)',
      '2. Demonstrate ZenLyft 1-tap mobile booking and WhatsApp enquiry bot (15 min)',
      '3. Review design options, Google search visibility, and domain setup (5 min)',
      '4. Propose turnkey launch timeline (within 7 business days) and commercial scope (5 min)',
    ];
    discoveryQuestions = [
      'What percentage of appointments or client enquiries currently arrive via phone calls or WhatsApp?',
      'How does your front desk or reception team track follow-up appointments and reminders?',
      'Do you currently have an active website, or are customers relying primarily on Google Maps and word of mouth?',
      'What is your desired go-live timeline for an automated booking and enquiry system?',
    ];
    demoFocus = 'Turnkey high-converting mobile web app with appointment booking and instant WhatsApp enquiry integration.';
  }

  return {
    organisationName: lead.organisation_name,
    division,
    category: lead.category,
    location: lead.location,
    verifiedGaps,
    suggestedAgenda,
    discoveryQuestions,
    demoFocus,
  };
}
