import { describe, it, expect } from 'vitest';
import {
  canTransitionStage,
  normalizeOrgName,
  extractDomain,
  normalizePhone,
  checkDuplicateLead,
  ExistingLeadRef,
} from '@/lib/crm/leads';
import { parseCsvContent, validateAndProcessCsv } from '@/lib/crm/csv-importer';

describe('CRM Core: Pipeline Transitions', () => {
  it('allows valid forward transitions', () => {
    expect(canTransitionStage('discovered', 'qualified')).toBe(true);
    expect(canTransitionStage('qualified', 'contacted')).toBe(true);
    expect(canTransitionStage('contacted', 'replied')).toBe(true);
    expect(canTransitionStage('replied', 'proposal')).toBe(true);
    expect(canTransitionStage('proposal', 'won')).toBe(true);
  });

  it('allows jumping to terminal or hold states', () => {
    expect(canTransitionStage('discovered', 'not_a_fit')).toBe(true);
    expect(canTransitionStage('contacted', 'do_not_contact')).toBe(true);
    expect(canTransitionStage('proposal', 'lost')).toBe(true);
    expect(canTransitionStage('qualified', 'on_hold')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    // Cannot skip straight from discovered to won
    expect(canTransitionStage('discovered', 'won')).toBe(false);
    // Cannot jump from do_not_contact to contacted (strict terminal protection)
    expect(canTransitionStage('do_not_contact', 'contacted')).toBe(false);
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

