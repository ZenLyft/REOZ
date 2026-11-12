import { describe, expect, it } from 'vitest';
import {
  ZENLYFT_TEMPLATES,
  ZENLYFT_SALES_DATASET,
  routeZenLyftService,
  scoreProspect100Point,
  generateFirstContactOutreach,
  computeSalesKpis,
} from '@/lib/ai/zenlyft-client-engine';
import { classifyIncomingMessage } from '@/lib/integrations/openwa-client';

describe('ZenLyft Client Engine — Master System Prompt v1.0', () => {
  it('routes industry requirements accurately across AI, SaaS, Software, and Discovery', () => {
    expect(routeZenLyftService({ requirementText: 'automate document processing with AI agent' }).route).toBe(
      'AI_AND_AUTOMATION'
    );
    expect(routeZenLyftService({ category: 'College / Hostel Management' }).route).toBe(
      'SAAS_AND_DIGITAL_PRODUCTS'
    );
    expect(routeZenLyftService({ requirementText: 'custom backend API integration for manufacturing' }).route).toBe(
      'SOFTWARE_DEVELOPMENT'
    );
    expect(routeZenLyftService({ industry: 'General Consulting', hasWebsite: true }).route).toBe(
      'DISCOVERY_CONVERSATION'
    );
  });

  it('scores prospects on strict 100-point rubric without inflating missing data', () => {
    const strong = scoreProspect100Point({
      industry: 'Education',
      hasDecisionMaker: true,
      decisionMakerVerified: true,
      identifiedChallenge: true,
      serviceRoute: 'SAAS_AND_DIGITAL_PRODUCTS',
      hasPhoneOrEmail: true,
      hasWebsite: true,
    });
    expect(strong.score).toBe(94);
    expect(strong.priority).toBe('HIGH_PRIORITY');

    const weak = scoreProspect100Point({
      serviceRoute: 'DISCOVERY_CONVERSATION',
      hasDecisionMaker: false,
      identifiedChallenge: false,
      hasPhoneOrEmail: false,
    });
    expect(weak.score).toBeLessThan(40);
    expect(weak.priority).toBe('UNQUALIFIED');
  });

  it('maintains 15+ structured WhatsApp & Email templates and generates tailored first-contact drafts', () => {
    expect(ZENLYFT_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    expect(ZENLYFT_SALES_DATASET.company.website).toBe('https://zenlyft.in');

    const mfg = generateFirstContactOutreach({
      companyName: 'PSG Industrial Gears',
      industry: 'Manufacturing',
      location: 'Coimbatore',
      channel: 'WHATSAPP',
    });
    expect(mfg.template_id).toBe('WA_MFG_007');
    expect(mfg.message).toContain('PSG Industrial Gears');
    expect(mfg.message).toContain('Niresh Senthoor');
  });

  it('classifies Master 13 response types accurately including Out-of-Office and Deferrals', () => {
    expect(classifyIncomingMessage('Auto reply: I am out of office until Monday').master_class).toBe(
      'OUT_OF_OFFICE'
    );
    expect(classifyIncomingMessage('Please call back next month').master_class).toBe('NOT_NOW');
    expect(classifyIncomingMessage('Send proposal & scope of work').master_class).toBe(
      'REQUEST_FOR_PROPOSAL'
    );
    expect(classifyIncomingMessage('STOP contacting us').master_class).toBe('OPT_OUT');
  });

  it('computes honest KPI percentages or null when denominators are zero', () => {
    expect(
      computeSalesKpis({
        researchedLeads: 0,
        qualifiedLeads: 0,
        deliveredMessages: 0,
        repliesReceived: 0,
        positiveReplies: 0,
        meetingsBooked: 0,
      })
    ).toEqual({
      response_rate_pct: null,
      positive_response_rate_pct: null,
      meeting_conversion_rate_pct: null,
      lead_qualification_rate_pct: null,
    });

    expect(
      computeSalesKpis({
        researchedLeads: 20,
        qualifiedLeads: 10,
        deliveredMessages: 50,
        repliesReceived: 10,
        positiveReplies: 5,
        meetingsBooked: 2,
      })
    ).toEqual({
      response_rate_pct: 20,
      positive_response_rate_pct: 10,
      meeting_conversion_rate_pct: 4,
      lead_qualification_rate_pct: 50,
    });
  });
});

