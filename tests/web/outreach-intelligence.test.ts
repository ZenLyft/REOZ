import { describe, expect, it } from 'vitest';
import {
  researchAndPrepareOutreach,
  hasDisallowedClaimsOrGenericPitch,
  evaluateMessageQuality,
} from '@/lib/ai/outreach-intelligence';
import {
  computeCanonicalApprovalHash,
  verifyCanonicalApprovalHash,
  verifyDraftHash,
  isFullSha256Hash,
} from '@/lib/crm/pricing-and-hash';
import { verifyApprovalRecordIntegrity } from '@/lib/crm/outreach-dossier-store';

describe('ZenLyft Dynamic Personalized Outreach Engine (Section 15)', () => {
  it('generates distinct research-driven outreach for Hospital, Gym, Coaching, and College Hostel', async () => {
    const hospital = await researchAndPrepareOutreach(
      {
        lead_id: 'lead-hosp-001',
        company_name: 'Aravind Eye Hospital - City Center',
        industry: 'Hospital & Ophthalmology Healthcare',
        category: 'Hospital / Healthcare',
        location: 'Madurai, Tamil Nadu',
        website_url: 'https://aravind.org',
        public_phone: '+91 98421 00001',
        public_email: 'admin@aravind.example.in',
        research_sources: ['https://aravind.org', 'https://www.openstreetmap.org/node/101'],
        observed_facts: [
          'Multi-specialty eye hospital handling high daily OPD patient footfall and surgical referrals.',
          'Public listing shows telephone desk coordination for appointments.',
        ],
      },
      { inspectWebsite: false }
    );

    const gym = await researchAndPrepareOutreach(
      {
        lead_id: 'lead-gym-002',
        company_name: 'Apex Premier Fitness & Wellness',
        industry: 'Fitness Centre & Strength Gym',
        category: 'Fitness / Gym',
        location: 'Bengaluru, Karnataka',
        public_phone: '+91 98450 00002',
        public_email: 'frontdesk@apexfitness.example.in',
        research_sources: ['https://www.openstreetmap.org/node/102'],
        observed_facts: [
          'Urban strength & conditioning centre offering personal training and transformation programs.',
          'Walk-in and phone enquiry flow for membership renewals and trial sessions.',
        ],
      },
      { inspectWebsite: false }
    );

    const coaching = await researchAndPrepareOutreach(
      {
        lead_id: 'lead-coach-003',
        company_name: 'Senthoor Coaching Academy & IAS',
        industry: 'Competitive Exam & IAS Coaching',
        category: 'Coaching Institute',
        location: 'Chennai, Tamil Nadu',
        public_phone: '+91 98400 00003',
        public_email: 'admissions@senthoorias.example.in',
        research_sources: ['https://www.openstreetmap.org/node/103'],
        observed_facts: [
          'UPSC & TNPSC coaching institute running multiple classroom and test-series batches.',
          'High admission counselling volume across peak exam cycles.',
        ],
      },
      { inspectWebsite: false }
    );

    const hostel = await researchAndPrepareOutreach(
      {
        lead_id: 'lead-hostel-004',
        company_name: 'Sri Krishna Arts & Science College Hostels',
        industry: 'Higher Education & Student Hostels',
        category: 'College / Hostel',
        location: 'Coimbatore, Tamil Nadu',
        website_url: 'https://skasc.ac.in',
        public_phone: '+91 98422 00004',
        public_email: 'warden@skasc.example.in',
        research_sources: ['https://skasc.ac.in', 'https://www.openstreetmap.org/way/104'],
        observed_facts: [
          'Residential college campus managing student hostel blocks, wardens, and campus security gates.',
        ],
      },
      { inspectWebsite: false }
    );

    const all = [hospital, gym, coaching, hostel];

    // 1. Distinct industries and solutions
    expect(hospital.industry_class).toBe('HEALTHCARE');
    expect(gym.industry_class).toBe('FITNESS');
    expect(coaching.industry_class).toBe('COACHING_ACADEMY');
    expect(hostel.industry_class).toBe('EDUCATION_HOSTEL');

    const solutions = new Set(all.map((d) => d.service_match.recommended_solution));
    expect(solutions.size).toBe(4);

    // 2. Domain relevance assertions
    expect(hospital.whatsapp_draft.toLowerCase()).toMatch(/patient|appointment|enquiry/);
    expect(gym.whatsapp_draft.toLowerCase()).toMatch(/member|trial|renewal|trainer/);
    expect(coaching.whatsapp_draft.toLowerCase()).toMatch(/student|batch|admission|counselling/);
    expect(hostel.whatsapp_draft.toLowerCase()).toMatch(/outpass|warden|hostel|parent/);

    // 3. Zero generic legacy templates
    for (const d of all) {
      expect(d.business_needs.length).toBeGreaterThanOrEqual(3);
      expect(d.quality_evaluation.score).toBeGreaterThanOrEqual(75);
      expect(d.status).toBe('READY');
      expect(d.email_subject.length).toBeGreaterThan(10);
      expect(d.email_draft).not.toBe(d.whatsapp_draft);

      expect(hasDisallowedClaimsOrGenericPitch(d.whatsapp_draft)).toEqual([]);
      expect(hasDisallowedClaimsOrGenericPitch(d.email_draft)).toEqual([]);
      expect(d.whatsapp_draft.toLowerCase()).not.toContain('modern mobile booking showcase');
      expect(d.whatsapp_draft.toLowerCase()).not.toContain('2-minute digital preview');

      // Full 64-char SHA-256 hashes bound for both channels
      expect(isFullSha256Hash(d.whatsapp_hash)).toBe(true);
      expect(isFullSha256Hash(d.email_hash)).toBe(true);
    }
  });

  it('defaults unverified digital presence fields to UNKNOWN instead of assuming gaps', async () => {
    const profile = await researchAndPrepareOutreach(
      {
        lead_id: 'lead-unknown-check',
        company_name: 'Kovai Precision Engineering Works',
        industry: 'Manufacturing',
        location: 'Coimbatore',
        research_sources: ['https://www.openstreetmap.org/node/200'],
      },
      { inspectWebsite: false }
    );

    expect(profile.research_profile.digital_presence.booking_system).toBe('UNKNOWN');
    expect(profile.research_profile.digital_presence.customer_portal).toBe('UNKNOWN');
    expect(profile.research_profile.digital_presence.mobile_app).toBe('UNKNOWN');
    expect(profile.research_profile.digital_presence.online_payments).toBe('UNKNOWN');
  });

  it('rejects unsupported claims & generic buzzwords in quality evaluator', () => {
    const hits = hasDisallowedClaimsOrGenericPitch(
      'We reviewed your entire digital presence and we noticed you do not have an application, so let us transform your business.'
    );
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it('invalidates canonical SHA-256 hash immediately on edit, subject tweak, or recipient change', () => {
    const payload = {
      lead_id: 'lead-abc',
      recipient: '+91 98765 43210',
      channel: 'whatsapp' as const,
      message_content: 'Hello team at Apex Gym — approved personalized draft.',
      subject: '',
      template_version: 'research-v2',
      approval_scope: 'first_contact',
    };

    const validHash = computeCanonicalApprovalHash(payload);
    expect(isFullSha256Hash(validHash)).toBe(true);
    expect(verifyCanonicalApprovalHash(payload, validHash)).toBe(true);

    // 1. Modify message text -> invalidates hash
    expect(
      verifyCanonicalApprovalHash(
        { ...payload, message_content: 'Hello team at Apex Gym — tampered text.' },
        validHash
      )
    ).toBe(false);

    // 2. Modify recipient -> invalidates hash
    expect(
      verifyCanonicalApprovalHash({ ...payload, recipient: '+91 99999 00000' }, validHash)
    ).toBe(false);

    // 3. Reject weak / truncated hashes (like old 16-char hash bug)
    expect(verifyCanonicalApprovalHash(payload, validHash.slice(0, 16))).toBe(false);
    expect(verifyDraftHash(payload.message_content, payload.recipient, validHash.slice(0, 16))).toBe(
      false
    );

    // 4. Approval record integrity enforces recipient binding cleanly
    const check = verifyApprovalRecordIntegrity({
      approval: {
        payload_hash: validHash,
        recipient: '+91 98765 43210',
        evidence: [{ canonical_payload: payload }],
      },
      draft: {
        lead_id: 'lead-abc',
        channel: 'whatsapp',
        draft: payload.message_content,
      },
      targetRecipient: '+91 99999 88888',
    });
    expect(check.valid).toBe(false);
  });

  it('blocks outreach generation for opt-out suppressed prospects and non-fit organizations', async () => {
    const optedOut = await researchAndPrepareOutreach(
      {
        lead_id: 'lead-optout',
        company_name: 'Senthoor Coaching Academy',
        industry: 'Coaching',
        location: 'Chennai',
        contact_restriction: 'opt_out',
      },
      { inspectWebsite: false }
    );
    expect(optedOut.status).toBe('SUPPRESSED');

    const nonFit = await researchAndPrepareOutreach(
      {
        lead_id: 'lead-nonfit',
        company_name: 'Sri Murugan Roadside Tea Stall',
        industry: 'Roadside Tea Stall',
        location: 'Coimbatore',
      },
      { inspectWebsite: false }
    );
    expect(nonFit.industry_class).toBe('NOT_A_FIT');
    expect(nonFit.status).toBe('NOT_A_FIT');
  });

  it('flags low quality or insufficient research as NEEDS_MANUAL_RESEARCH instead of pushing weak drafts', async () => {
    const sparse = await researchAndPrepareOutreach(
      {
        lead_id: 'lead-sparse',
        company_name: 'Ambiguous Org',
        location: '',
      },
      { inspectWebsite: false }
    );

    const evalLow = evaluateMessageQuality({
      whatsapp: 'We offer cutting-edge technology for businesses.',
      emailSubject: 'Hi',
      emailBody: 'Let us transform your business.',
      profile: {
        ...sparse.research_profile,
        research_status: 'INCOMPLETE',
      },
      needs: [],
      serviceMatch: sparse.service_match,
      regenerationCount: 1,
    });
    expect(evalLow.score).toBeLessThan(75);
    expect(evalLow.eligible_for_approval_inbox).toBe(false);
    expect(evalLow.needs_manual_research).toBe(true);
    expect(sparse.quality_evaluation.needs_manual_research || sparse.status === 'NEEDS_MANUAL_RESEARCH').toBe(true);
  });
});
