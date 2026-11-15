import { describe, it, expect } from 'vitest';
import { classifyIncomingMessage } from '../../apps/web/src/lib/integrations/conversation-intelligence';
import { generateMeetingBrief } from '../../apps/web/src/lib/crm/meetings';
import { buildProposalForProduct } from '../../apps/web/src/lib/crm/proposals';
import { getOnboardingChecklistForService } from '../../apps/web/src/lib/crm/onboarding';

describe('REOZ 3.0 Conversation Intelligence & Reply Classification', () => {
  it('detects explicit opt-outs and enforces suppression', () => {
    const res1 = classifyIncomingMessage('STOP');
    expect(res1.category).toBe('unsubscribe');
    expect(res1.isOptOut).toBe(true);
    expect(res1.recommendedStage).toBe('do_not_contact');

    const res2 = classifyIncomingMessage('Please unsubscribe us from this list');
    expect(res2.category).toBe('unsubscribe');
    expect(res2.isOptOut).toBe(true);
  });

  it('detects meeting and call requests', () => {
    const res = classifyIncomingMessage('Can we connect over a google meet call tomorrow afternoon?');
    expect(res.category).toBe('meeting');
    expect(res.recommendedStage).toBe('meeting');
  });

  it('detects demo requests', () => {
    const res = classifyIncomingMessage('Could you show us a quick demo of how the system works?');
    expect(res.category).toBe('demo');
    expect(res.recommendedStage).toBe('meeting');
  });

  it('detects pricing inquiries', () => {
    const res = classifyIncomingMessage('What is the price and cost for the appointment booking website?');
    expect(res.category).toBe('pricing');
    expect(res.recommendedStage).toBe('requirements_confirmed');
  });

  it('detects negotiation and discount requests', () => {
    const res = classifyIncomingMessage('Is there any discount available on this package?');
    expect(res.category).toBe('negotiation');
    expect(res.recommendedStage).toBe('negotiation');
  });

  it('detects requests to contact later', () => {
    const res = classifyIncomingMessage('We are currently busy with annual exams. Please contact later next week.');
    expect(res.category).toBe('contact_later');
    expect(res.recommendedStage).toBe('on_hold');
  });

  it('detects wrong contact notifications', () => {
    const res = classifyIncomingMessage('Wrong person, I am not the owner and no longer work here.');
    expect(res.category).toBe('wrong_contact');
    expect(res.recommendedStage).toBe('disqualified');
  });

  it('detects positive interest signals', () => {
    const res = classifyIncomingMessage('Yes, we are interested. Please share more details.');
    expect(res.category).toBe('interested');
    expect(res.recommendedStage).toBe('responded');
  });
});

describe('REOZ 3.0 Meeting Discovery & Briefs', () => {
  it('generates institutional HOMS discovery questions for Division B prospects', () => {
    const brief = generateMeetingBrief({
      organisation_name: 'Sri Krishna Arts & Science College Hostels',
      category: 'Education / College Hostels',
      location: 'Coimbatore, Tamil Nadu',
      revenue_division: 'division_b_institutional',
    });

    expect(brief.division).toBe('division_b_institutional');
    expect(brief.discoveryQuestions.some((q) => q.includes('outpass'))).toBe(true);
    expect(brief.demoFocus).toContain('HOMS');
  });

  it('generates clinic appointment questions for Division A prospects', () => {
    const brief = generateMeetingBrief({
      organisation_name: 'Aravind Eye Hospital - City Center',
      category: 'Healthcare / Eye Clinic',
      location: 'Coimbatore, Tamil Nadu',
      revenue_division: 'division_a_digital',
    });

    expect(brief.division).toBe('division_a_digital');
    expect(brief.discoveryQuestions.some((q) => q.includes('appointments') || q.includes('booking'))).toBe(true);
    expect(brief.demoFocus).toContain('booking');
  });
});

describe('REOZ 3.0 Proposals & Margin Guardrails', () => {
  it('builds standard website proposal (₹9,999) with compliant gross margin', () => {
    const prop = buildProposalForProduct({
      leadId: 'lead-1',
      division: 'division_a_digital',
      serviceLine: 'website_starter',
      clientName: 'Aravind Clinic',
    });

    expect(prop.quoteInr).toBe(9999);
    expect(prop.grossMarginPercent).toBeGreaterThanOrEqual(65);
    expect(prop.meetsMinimumMargin).toBe(true);
    expect(prop.paymentMilestones.length).toBe(2);
  });

  it('builds website with booking proposal (₹17,999) with compliant gross margin', () => {
    const prop = buildProposalForProduct({
      leadId: 'lead-2',
      division: 'division_a_digital',
      serviceLine: 'website_booking',
      clientName: 'Annapoorna Hotel',
    });

    expect(prop.quoteInr).toBe(17999);
    expect(prop.grossMarginPercent).toBe(72.22);
    expect(prop.meetsMinimumMargin).toBe(true);
  });

  it('builds institutional HOMS license proposal with milestones and margin', () => {
    const prop = buildProposalForProduct({
      leadId: 'lead-3',
      division: 'division_b_institutional',
      serviceLine: 'homs_pilot',
      clientName: 'Karpagam Academy of Higher Education',
    });

    expect(prop.quoteInr).toBe(85000);
    expect(prop.grossMarginPercent).toBeGreaterThanOrEqual(75);
    expect(prop.meetsMinimumMargin).toBe(true);
    expect(prop.paymentMilestones.length).toBe(3);
  });
});

describe('REOZ 3.0 Delivery Checklists', () => {
  it('provides comprehensive onboarding checklists for all service lines', () => {
    const webChecklist = getOnboardingChecklistForService('website_project');
    expect(webChecklist.length).toBeGreaterThanOrEqual(5);
    expect(webChecklist.some((item) => item.category === 'engineering')).toBe(true);

    const homsChecklist = getOnboardingChecklistForService('homs_pilot');
    expect(homsChecklist.some((item) => item.title.includes('QR Scanner'))).toBe(true);
    expect(homsChecklist.some((item) => item.title.includes('Parent WhatsApp'))).toBe(true);
  });
});

