import { describe, it, expect } from 'vitest';
import {
  canTransitionStage,
  classifyRevenueDivision,
  calculateGrossMargin,
  getISOWeekString,
  normalizeOrgName,
  extractDomain,
  normalizePhone,
  checkDuplicateLead,
  ExistingLeadRef,
} from '@/lib/crm/leads';
import { parseCsvContent, validateAndProcessCsv } from '@/lib/crm/csv-importer';

describe('CRM Core: REOZ 3.0 Linear Deal Pipeline', () => {
  it('allows complete 14-stage progression from discovery to project completion', () => {
    expect(canTransitionStage('discovered', 'qualified')).toBe(true);
    expect(canTransitionStage('qualified', 'contacted')).toBe(true);
    expect(canTransitionStage('contacted', 'responded')).toBe(true);
    expect(canTransitionStage('responded', 'meeting')).toBe(true);
    expect(canTransitionStage('meeting', 'requirements_confirmed')).toBe(true);
    expect(canTransitionStage('requirements_confirmed', 'proposal')).toBe(true);
    expect(canTransitionStage('proposal', 'negotiation')).toBe(true);
    expect(canTransitionStage('negotiation', 'agreement')).toBe(true);
    expect(canTransitionStage('agreement', 'payment_pending')).toBe(true);
    expect(canTransitionStage('payment_pending', 'paid')).toBe(true);
    expect(canTransitionStage('paid', 'onboarding')).toBe(true);
    expect(canTransitionStage('onboarding', 'active_project')).toBe(true);
    expect(canTransitionStage('active_project', 'completed')).toBe(true);
  });

  it('allows marking opportunity as lost or disqualified from pre-paid stages', () => {
    expect(canTransitionStage('discovered', 'disqualified')).toBe(true);
    expect(canTransitionStage('contacted', 'lost')).toBe(true);
    expect(canTransitionStage('meeting', 'lost')).toBe(true);
    expect(canTransitionStage('proposal', 'lost')).toBe(true);
    expect(canTransitionStage('negotiation', 'lost')).toBe(true);
  });

  it('strictly forbids skipping straight to paid or agreement without required verification stages', () => {
    expect(canTransitionStage('discovered', 'paid')).toBe(false);
    expect(canTransitionStage('contacted', 'paid')).toBe(false);
    expect(canTransitionStage('proposal', 'paid')).toBe(false);
    expect(canTransitionStage('do_not_contact', 'contacted')).toBe(false);
  });
});

describe('CRM Core: Division A & Division B Segregation & Unit Economics', () => {
  it('correctly classifies Division A (SME Digital Solutions) vs Division B (Institutional)', () => {
    expect(classifyRevenueDivision('Clinic / Healthcare', 'Aravind Eye Hospital')).toBe('division_a_digital');
    expect(classifyRevenueDivision('Gym & Fitness', 'Cult Fitness Centre')).toBe('division_a_digital');
    expect(classifyRevenueDivision('Restaurant', 'Annapoorna Hotel')).toBe('division_a_digital');

    expect(classifyRevenueDivision('College Hostels', 'Sri Krishna Arts & Science College Hostels')).toBe('division_b_institutional');
    expect(classifyRevenueDivision('Higher Education', 'Karpagam Academy of Higher Education')).toBe('division_b_institutional');
    expect(classifyRevenueDivision('University', 'Anna University Regional Campus')).toBe('division_b_institutional');
  });

  it('calculates gross margin and enforces 65% minimum threshold', () => {
    // ₹17,999 website with booking package, 8 hours dev @ ₹500/hr + ₹1000 infra = ₹5,000 cost
    const margin1 = calculateGrossMargin(17999, 8, 500, 1000);
    expect(margin1.deliveryCostInr).toBe(5000);
    expect(margin1.grossMarginInr).toBe(12999);
    expect(margin1.grossMarginPercent).toBe(72.22);
    expect(margin1.meetsMinimumMargin).toBe(true);

    // Highly discounted or unprofitable project with low margin
    const marginLow = calculateGrossMargin(5000, 10, 500, 1000);
    expect(marginLow.deliveryCostInr).toBe(6000);
    expect(marginLow.grossMarginPercent).toBe(-20);
    expect(marginLow.meetsMinimumMargin).toBe(false);
  });

  it('generates consistent ISO week string format for weekly cohorts', () => {
    const week = getISOWeekString(new Date('2026-11-15'));
    expect(week).toMatch(/^2026-W\d{2}$/);
  });
});

describe('CRM Core: Deduplication & Normalization', () => {
  it('normalizes organization names by stripping punctuation and legal suffixes', () => {
    expect(normalizeOrgName('Apex Health Care Pvt Ltd.')).toBe('apex health care');
    expect(normalizeOrgName('Senthoor Technologies, Inc.')).toBe('senthoor technologies');
  });

  it('extracts clean root domain', () => {
    expect(extractDomain('https://www.zenlyft.in/about')).toBe('zenlyft.in');
    expect(extractDomain('http://clinic.coimbatore.com')).toBe('clinic.coimbatore.com');
    expect(extractDomain('')).toBeNull();
  });

  it('normalizes Indian phone numbers', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
    expect(normalizePhone('9876543210')).toBe('9876543210');
  });

  it('detects duplicate lead by exact domain match', () => {
    const existing: ExistingLeadRef[] = [
      {
        id: '1',
        organisation_name: 'Apex Care',
        normalised_name: 'apex care',
        website_domain: 'apexcare.in',
        phone: '9876543210',
      },
    ];

    const match = checkDuplicateLead(
      { name: 'Apex Medical', website_url: 'https://apexcare.in/contact', phone: '9999999999' },
      existing
    );

    expect(match.type).toBe('exact_domain');
  });

  it('detects duplicate lead by normalized name match', () => {
    const existing: ExistingLeadRef[] = [
      {
        id: '1',
        organisation_name: 'ZenLyft Automation Pvt. Ltd.',
        normalised_name: 'zenlyft automation',
        website_domain: 'zenlyft.in',
        phone: null,
      },
    ];

    const match = checkDuplicateLead(
      { name: 'ZenLyft Automation Inc', website_url: 'https://other.com' },
      existing
    );

    expect(match.type).toBe('near_name');
  });
});

describe('CRM Core: CSV Importer', () => {
  it('parses CSV and validates good rows while rejecting bad rows', () => {
    const csvData = `organisation_name,category,location,website_url,phone,notes
Apex Hospital,Healthcare,Coimbatore,https://apexhospital.in,9876543210,Verified
Bad Row No Location,Education,,https://bad.com,9876543210,Missing loc
Apex Hospital Dup,Healthcare,Coimbatore,https://apexhospital.in,9876543210,Same domain`;

    const parsed = parseCsvContent(csvData);
    expect(parsed.length).toBe(3);

    const report = validateAndProcessCsv(parsed, []);

    // 1st row should be valid
    expect(report.validRows.length).toBe(1);
    expect(report.validRows[0].organisation_name).toBe('Apex Hospital');

    // 2nd row has missing location (should be in errors)
    expect(report.errors.length).toBe(1);

    // 3rd row is duplicate of 1st row by domain (should be in duplicates)
    expect(report.duplicates.length).toBe(1);
  });
});

