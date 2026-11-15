import { describe, it, expect } from 'vitest';
import { generateWeeklyReportFromData } from '../../apps/web/src/lib/crm/weekly-report';

describe('REOZ 3.0 Founder Weekly Performance Report & Cohort Analytics', () => {
  const mockLeads = [
    {
      id: 'lead-1',
      organisation_name: 'City Care Clinic',
      category: 'Healthcare / Clinic',
      revenue_division: 'division_a_digital',
      pipeline_stage: 'paid',
      score: 85,
    },
    {
      id: 'lead-2',
      organisation_name: 'Apex Engineering College',
      category: 'Education / College',
      revenue_division: 'division_b_institutional',
      pipeline_stage: 'active_project',
      score: 92,
      meeting_scheduled_at: '2026-11-10T10:00:00Z',
      contract_signed_at: '2026-11-12T10:00:00Z',
    },
    {
      id: 'lead-3',
      organisation_name: 'Grand Hotel',
      category: 'Hospitality / Hotel',
      revenue_division: 'division_a_digital',
      pipeline_stage: 'proposal',
      score: 75,
      proposal_id: 'prop-1',
    },
    {
      id: 'lead-4',
      organisation_name: 'Metro Gym',
      category: 'Fitness / Gym',
      revenue_division: 'division_a_digital',
      pipeline_stage: 'lost',
      lost_reason: 'Budget constraint',
      score: 65,
    },
    {
      id: 'lead-5',
      organisation_name: 'Modern Coaching Centre',
      category: 'Education / Coaching',
      revenue_division: 'division_a_digital',
      pipeline_stage: 'disqualified',
      disqualification_reason: 'Closed permanently',
      score: 40,
    },
    // Add 15 more discovered leads to simulate a cohort of 20
    ...Array.from({ length: 15 }, (_, i) => ({
      id: `lead-cohort-${i + 6}`,
      organisation_name: `Prospective SME ${i + 6}`,
      category: 'Retail / Business',
      revenue_division: 'division_a_digital',
      pipeline_stage: 'discovered',
      score: 60,
    })),
  ];

  const mockProjects = [
    { id: 'proj-1', contracted_value_inr: 17999, name: 'City Care Booking' },
    { id: 'proj-2', contracted_value_inr: 85000, name: 'Apex HOMS' },
  ];

  const mockInvoices = [
    { id: 'inv-1', amount_inr: 17999, status: 'paid' },
    { id: 'inv-2', amount_inr: 85000, status: 'issued' },
  ];

  const mockPayments = [{ id: 'pay-1', amount_received_inr: 17999 }];

  const mockOnboarding = [
    {
      id: 'onb-1',
      status: 'in_progress',
      pending_client_inputs: ['Domain DNS verification'],
    },
    {
      id: 'onb-2',
      status: 'completed',
      pending_client_inputs: [],
    },
  ];

  it('calculates cohort metrics, 10% performance target, and true conversion rate', () => {
    const report = generateWeeklyReportFromData({
      leads: mockLeads,
      projects: mockProjects,
      invoices: mockInvoices,
      payments: mockPayments,
      onboardingProjects: mockOnboarding,
    });

    // 20 eligible leads -> 10% target = 2 clients
    expect(report.cohort.eligibleUniqueLeads).toBe(20);
    expect(report.cohort.weeklyTargetPaidClients).toBe(2);
    // lead-1 (paid) + lead-2 (active_project) = 2 paying clients
    expect(report.cohort.actualPaidClients).toBe(2);
    expect(report.cohort.conversionGap).toBe(0);
    expect(report.cohort.cohortConversionRatePercent).toBe(10);
    expect(report.cohort.targetMet).toBe(true);
  });

  it('strictly segregates verified bank cash from pending forecasts (zero inflation)', () => {
    const report = generateWeeklyReportFromData({
      leads: mockLeads,
      projects: mockProjects,
      invoices: mockInvoices,
      payments: mockPayments,
      onboardingProjects: mockOnboarding,
    });

    // Only actual verified payment in ledger
    expect(report.financials.actualCashCollectedInr).toBe(17999);
    // Invoiced total: 17,999 + 85,000 = 102,999
    expect(report.financials.invoicedTotalInr).toBe(102999);
    // Outstanding unpaid: 85,000
    expect(report.financials.outstandingUnpaidInr).toBe(85000);
    // Contracted project value: 17,999 + 85,000 = 102,999
    expect(report.financials.totalContractedValueInr).toBe(102999);
  });

  it('segregates performance by Division A (Digital) vs Division B (Institutional)', () => {
    const report = generateWeeklyReportFromData({
      leads: mockLeads,
      projects: mockProjects,
      invoices: mockInvoices,
      payments: mockPayments,
      onboardingProjects: mockOnboarding,
    });

    expect(report.divisions.divisionADigital.wonCount).toBe(1);
    expect(report.divisions.divisionADigital.contractedValueInr).toBe(17999);

    expect(report.divisions.divisionBInstitutional.wonCount).toBe(1);
    expect(report.divisions.divisionBInstitutional.contractedValueInr).toBe(85000);
  });

  it('tracks lost deal root causes and provides diagnostic founder action plan', () => {
    const report = generateWeeklyReportFromData({
      leads: mockLeads,
      projects: mockProjects,
      invoices: mockInvoices,
      payments: mockPayments,
      onboardingProjects: mockOnboarding,
    });

    expect(report.integrityCheck.lostDealsCount).toBe(2);
    expect(report.integrityCheck.primaryLossReasons.some((r) => r.includes('Budget constraint'))).toBe(true);
    expect(report.founderActionPlan.length).toBeGreaterThan(0);
  });
});

