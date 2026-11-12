/**
 * ZENLYFT CLIENT ENGINE — MASTER SYSTEM PROMPT v1.0
 * Autonomous B2B Sales, Business Development & Client Acquisition Engine
 * Organization: ZenLyft (https://zenlyft.in)
 * Operating Market: All India (and Global Inbound/Outbound Hubs)
 */

export type ServiceRoute =
  | 'AI_AND_AUTOMATION'
  | 'SAAS_AND_DIGITAL_PRODUCTS'
  | 'SOFTWARE_DEVELOPMENT'
  | 'MULTI_SERVICE'
  | 'DISCOVERY_CONVERSATION';

export type MasterResponseClass =
  | 'POSITIVE_INTEREST'
  | 'REQUEST_FOR_DEMO'
  | 'REQUEST_FOR_PROPOSAL'
  | 'REQUEST_FOR_PRICING'
  | 'NEEDS_MORE_INFORMATION'
  | 'REFERRAL'
  | 'NOT_INTERESTED'
  | 'NOT_NOW'
  | 'FOLLOW_UP_REQUESTED'
  | 'WRONG_CONTACT'
  | 'OUT_OF_OFFICE'
  | 'OPT_OUT'
  | 'UNCLEAR';

export type LeadPriorityBand =
  | 'HIGH_PRIORITY'
  | 'MEDIUM_PRIORITY'
  | 'LOW_PRIORITY'
  | 'UNQUALIFIED';

export interface SalesTemplate {
  template_id: string;
  channel: 'WHATSAPP' | 'EMAIL';
  purpose: 'FIRST_CONTACT' | 'FOLLOW_UP' | 'REFERRAL';
  industry: string;
  prospect_role: string;
  service_category: ServiceRoute;
  language: 'EN' | 'TA' | 'HI';
  tone: 'PROFESSIONAL' | 'EXECUTIVE';
  priority: 'HIGH' | 'NORMAL';
  subject?: string;
  message: string;
  required_variables: string[];
  optional_variables: string[];
  approval_required: boolean;
}

export const ALL_INDIA_STATES_AND_HUBS: Record<string, string[]> = {
  india_all: ['Bengaluru', 'Chennai', 'Mumbai', 'Hyderabad', 'Delhi', 'Coimbatore', 'Pune', 'Ahmedabad'],
  south_india: ['Chennai', 'Coimbatore', 'Bengaluru', 'Hyderabad', 'Kochi', 'Madurai', 'Salem'],
  west_india: ['Mumbai', 'Pune', 'Ahmedabad', 'Surat', 'Vadodara', 'Nagpur'],
  north_india: ['Delhi', 'Gurugram', 'Noida', 'Jaipur', 'Lucknow', 'Chandigarh'],
  east_india: ['Kolkata', 'Bhubaneswar', 'Patna', 'Ranchi', 'Guwahati'],
};

export const ZENLYFT_MASTER_SYSTEM_PROMPT = `YOU ARE THE ZENLYFT CLIENT ENGINE (v1.0).
Company: ZenLyft (https://zenlyft.in) | Market: All India | Primary Channels: WhatsApp Business & Email.

IDENTITY & OPERATING ETHICS:
- Operate as Chief Sales Officer (CSO), Senior B2B Sales Executive, Market Research Analyst & SDR.
- Three ZenLyft Service Categories (select ONLY what fits verified need—never pitch all three unnecessarily):
  1. AI_AND_AUTOMATION: AI integration, intelligent workflows, agent systems, document processing, custom AI solutions.
  2. SAAS_AND_DIGITAL_PRODUCTS: SaaS applications, institutional management platforms (e.g. HOMS), portals, mobile apps.
  3. SOFTWARE_DEVELOPMENT: Custom software, web/backend applications, API integrations, database modernization.
- STRICT HONESTY RULE: Never invent client names, revenue figures, testimonials, certifications, awards, or unverified deployments. Only report verified facts from CRM/database records.
- HUMAN APPROVAL RULE: Never promise unapproved discounts, custom contract terms, or send follow-ups/custom replies without Founder authorization.

QUALIFICATION FRAMEWORK (100 POINTS):
- Business relevance: 25 | Decision-maker relevance: 20 | Identified requirement: 20 | Service compatibility: 20 | Contact & research confidence: 15.
- Prioritize accuracy over volume, quality conversations over spam, and verified facts over assumptions.`;

/** Section 7: Sales Service Matching Engine */
export function routeZenLyftService(input: {
  industry?: string;
  category?: string;
  requirementText?: string;
  hasWebsite?: boolean;
}): {
  route: ServiceRoute;
  businessFunction: string;
  reason: string;
} {
  const haystack = `${input.industry || ''} ${input.category || ''} ${input.requirementText || ''}`.toLowerCase();

  const wantsAi =
    /\b(ai|automation|automate|workflow|bot|assistant|agent|ocr|document|invoice processing|support triage)\b/.test(
      haystack
    );
  const wantsSaas =
    /\b(college|hostel|school|university|institution|institute|saas|portal|erp|outpass|attendance|lms|booking portal|clinic|hospital)\b/.test(
      haystack
    );
  const wantsCustom =
    /\b(custom software|api|integration|backend|legacy|modernization|web app|mobile app|erp customization|manufacturing|logistics|inventory)\b/.test(
      haystack
    );

  const matchCount = [wantsAi, wantsSaas, wantsCustom].filter(Boolean).length;

  let businessFunction = 'core digital workflows and client operations';
  if (/college|hostel|university|school|education|institute/.test(haystack)) {
    businessFunction = 'student administration, gatepass approvals, and campus workflows';
  } else if (/clinic|hospital|health/.test(haystack)) {
    businessFunction = 'patient appointment scheduling and digital follow-ups';
  } else if (/manufacturing|factory|logistics|warehouse|supply/.test(haystack)) {
    businessFunction = 'order tracking, inventory reporting, and internal approvals';
  } else if (/retail|ecommerce|store|hotel|hospitality/.test(haystack)) {
    businessFunction = 'customer ordering, booking workflows, and digital engagement';
  } else if (/startup|it|software|saas|fintech|financial/.test(haystack)) {
    businessFunction = 'product engineering velocity and workflow automation';
  }

  if (matchCount >= 2) {
    return {
      route: 'MULTI_SERVICE',
      businessFunction,
      reason: 'Multiple verified operational needs spanning platforms and automation.',
    };
  }
  if (wantsSaas) {
    return {
      route: 'SAAS_AND_DIGITAL_PRODUCTS',
      businessFunction,
      reason: 'Institutional/business platform or portal opportunity identified.',
    };
  }
  if (wantsAi) {
    return {
      route: 'AI_AND_AUTOMATION',
      businessFunction,
      reason: 'Intelligent workflow automation requirement identified.',
    };
  }
  if (wantsCustom) {
    return {
      route: 'SOFTWARE_DEVELOPMENT',
      businessFunction,
      reason: 'Custom software, API, or internal tool modernization need identified.',
    };
  }
  if (input.hasWebsite === false) {
    return {
      route: 'SOFTWARE_DEVELOPMENT',
      businessFunction,
      reason: 'No discoverable digital portal found in verified public sources.',
    };
  }
  return {
    route: 'DISCOVERY_CONVERSATION',
    businessFunction,
    reason: 'Requirements still unverified; open with consultative discovery conversation.',
  };
}

/** Section 12: 100-Point Lead Qualification Engine (no inflated missing points) */
export function scoreProspect100Point(input: {
  industry?: string;
  hasDecisionMaker?: boolean;
  decisionMakerVerified?: boolean;
  identifiedChallenge?: boolean;
  serviceRoute?: ServiceRoute;
  hasPhoneOrEmail?: boolean;
  hasWebsite?: boolean;
}): {
  score: number;
  priority: LeadPriorityBand;
  breakdown: {
    business_relevance: number;
    decision_maker_relevance: number;
    identified_requirement: number;
    service_compatibility: number;
    contact_confidence: number;
  };
} {
  const industryStr = (input.industry || '').toLowerCase();
  const strongSector =
    /(education|college|hostel|university|health|clinic|hospital|manufacturing|retail|ecommerce|logistics|saas|it|software|real estate|hospitality|financial)/.test(
      industryStr
    );

  const business_relevance = strongSector ? 23 : industryStr ? 16 : 8;
  const decision_maker_relevance = input.decisionMakerVerified
    ? 20
    : input.hasDecisionMaker
      ? 14
      : 6;
  const identified_requirement = input.identifiedChallenge ? 18 : input.hasWebsite === false ? 15 : 8;
  const service_compatibility =
    input.serviceRoute && input.serviceRoute !== 'DISCOVERY_CONVERSATION' ? 18 : 10;
  const contact_confidence = input.hasPhoneOrEmail
    ? input.hasWebsite
      ? 15
      : 12
    : input.hasWebsite
      ? 7
      : 4;

  const score = Math.min(
    100,
    Math.max(
      0,
      business_relevance +
        decision_maker_relevance +
        identified_requirement +
        service_compatibility +
        contact_confidence
    )
  );

  const priority: LeadPriorityBand =
    score >= 80
      ? 'HIGH_PRIORITY'
      : score >= 60
        ? 'MEDIUM_PRIORITY'
        : score >= 40
          ? 'LOW_PRIORITY'
          : 'UNQUALIFIED';

  return {
    score,
    priority,
    breakdown: {
      business_relevance,
      decision_maker_relevance,
      identified_requirement,
      service_compatibility,
      contact_confidence,
    },
  };
}

/** Section 18: 15-Category JSON Sales Training Dataset (WhatsApp & Email) */
export const ZENLYFT_TEMPLATES: SalesTemplate[] = [
  {
    template_id: 'WA_FIRST_001',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'GENERAL',
    prospect_role: 'BUSINESS_OWNER',
    service_category: 'MULTI_SERVICE',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'NORMAL',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft ({{website}}). We build practical software, digital platforms, and AI business automation.\n\nI came across {{company_name}} and wanted to ask how your team currently manages {{business_function}}.\n\nWould you be open to a brief 5-minute conversation?",
    required_variables: ['company_name', 'business_function', 'sales_executive_name'],
    optional_variables: ['prospect_name', 'website'],
    approval_required: true,
  },
  {
    template_id: 'WA_FOUNDER_002',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'STARTUP_OR_SME',
    prospect_role: 'FOUNDER',
    service_category: 'MULTI_SERVICE',
    language: 'EN',
    tone: 'EXECUTIVE',
    priority: 'HIGH',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}}, Founder at ZenLyft. Speaking founder-to-founder, I noticed {{company_name}} growing in {{location}} and wanted to understand how you currently handle {{business_function}}.\n\nWould you be open to a quick 10-minute chat this week?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name', 'location'],
    approval_required: true,
  },
  {
    template_id: 'WA_CEO_003',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'CORPORATE',
    prospect_role: 'CEO_OR_MD',
    service_category: 'AI_AND_AUTOMATION',
    language: 'EN',
    tone: 'EXECUTIVE',
    priority: 'HIGH',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft ({{website}}). We partner with leadership teams across India to streamline {{business_function}} using reliable software and intelligent workflow automation.\n\nWould you or your operations lead be open to a brief introductory call?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_CTO_004',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'IT_AND_TECH',
    prospect_role: 'CTO_OR_IT_HEAD',
    service_category: 'SOFTWARE_DEVELOPMENT',
    language: 'EN',
    tone: 'EXECUTIVE',
    priority: 'HIGH',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft. We support engineering teams with custom backend development, API integrations, and AI agent workflows.\n\nIs {{company_name}} currently exploring external engineering support for {{business_function}}?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_SME_005',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'SME',
    prospect_role: 'BUSINESS_OWNER',
    service_category: 'SOFTWARE_DEVELOPMENT',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'NORMAL',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft ({{website}}). We help Indian SMEs replace manual spreadsheets and scattered tools in {{business_function}} with clean digital workflows.\n\nOpen to a quick chat about how {{company_name}} handles this today?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_EDU_006',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'EDUCATION',
    prospect_role: 'PRINCIPAL_OR_MANAGEMENT',
    service_category: 'SAAS_AND_DIGITAL_PRODUCTS',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'HIGH',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft ({{website}}). We build institutional administration platforms—including student hostel outpass, warden approvals, and automated parent WhatsApp updates.\n\nHow does {{company_name}} currently manage {{business_function}}?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_MFG_007',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'MANUFACTURING',
    prospect_role: 'OPERATIONS_HEAD',
    service_category: 'SOFTWARE_DEVELOPMENT',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'HIGH',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft. We build custom internal tools, production dashboards, and automated reporting systems for Indian manufacturing teams.\n\nWould you be open to sharing how {{company_name}} manages {{business_function}}?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_HEALTH_008',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'HEALTHCARE',
    prospect_role: 'MANAGEMENT',
    service_category: 'SAAS_AND_DIGITAL_PRODUCTS',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'HIGH',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft ({{website}}). We help clinics and hospitals simplify {{business_function}} through clean web portals and automated WhatsApp reminders.\n\nWould a quick 5-minute discussion this week be useful for {{company_name}}?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_RETAIL_009',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'RETAIL_AND_ECOMMERCE',
    prospect_role: 'BUSINESS_OWNER',
    service_category: 'AI_AND_AUTOMATION',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'NORMAL',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft. We help retail and e-commerce brands automate {{business_function}} and customer WhatsApp support.\n\nWould you be open to a quick conversation on what {{company_name}} is prioritizing this quarter?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_STARTUP_010',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'STARTUP',
    prospect_role: 'FOUNDER_OR_CTO',
    service_category: 'SOFTWARE_DEVELOPMENT',
    language: 'EN',
    tone: 'EXECUTIVE',
    priority: 'HIGH',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft ({{website}}). We partner with startups to ship SaaS modules, API integrations, and AI automation quickly without expanding fixed payroll.\n\nDoes {{company_name}} need extra build velocity around {{business_function}}?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_AI_011',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'GENERAL',
    prospect_role: 'OPERATIONS_HEAD',
    service_category: 'AI_AND_AUTOMATION',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'NORMAL',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft. Where we see practical ROI with AI is automating repetitive {{business_function}}—like document routing, data entry, and enquiry triage.\n\nIs {{company_name}} evaluating practical workflow automation right now?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_CUSTOM_012',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'GENERAL',
    prospect_role: 'IT_HEAD',
    service_category: 'SOFTWARE_DEVELOPMENT',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'NORMAL',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft ({{website}}). We specialize in custom web applications, API connectors, and modernizing legacy internal tools.\n\nAre there specific bottlenecks in {{company_name}}'s {{business_function}} you're looking to simplify?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_SAAS_013',
    channel: 'WHATSAPP',
    purpose: 'FIRST_CONTACT',
    industry: 'GENERAL',
    prospect_role: 'CEO_OR_PRODUCT',
    service_category: 'SAAS_AND_DIGITAL_PRODUCTS',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'NORMAL',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft. We build dedicated web portals and SaaS workflow systems tailored to how organisations operate.\n\nWould you be open to a short chat about how {{company_name}} handles {{business_function}}?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_REFERRAL_014',
    channel: 'WHATSAPP',
    purpose: 'REFERRAL',
    industry: 'GENERAL',
    prospect_role: 'DECISION_MAKER',
    service_category: 'DISCOVERY_CONVERSATION',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'HIGH',
    message:
      "Hello {{prospect_name}},\n\nI'm {{sales_executive_name}} from ZenLyft ({{website}}). Your colleague at {{company_name}} kindly suggested I connect with you regarding {{business_function}}.\n\nWould you be open to a brief 5-minute introduction this week?",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'WA_FOLLOWUP_015',
    channel: 'WHATSAPP',
    purpose: 'FOLLOW_UP',
    industry: 'GENERAL',
    prospect_role: 'DECISION_MAKER',
    service_category: 'DISCOVERY_CONVERSATION',
    language: 'EN',
    tone: 'PROFESSIONAL',
    priority: 'NORMAL',
    message:
      "Hello {{prospect_name}},\n\nFollowing up briefly on my earlier note regarding {{company_name}} and {{business_function}}.\n\nIf now isn't the right priority, no problem at all—just let me know if another week works better.",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
  {
    template_id: 'EMAIL_FIRST_001',
    channel: 'EMAIL',
    purpose: 'FIRST_CONTACT',
    industry: 'GENERAL',
    prospect_role: 'DECISION_MAKER',
    service_category: 'MULTI_SERVICE',
    language: 'EN',
    tone: 'EXECUTIVE',
    priority: 'NORMAL',
    subject: 'Exploring Technology Opportunities with {{company_name}}',
    message:
      "Dear {{prospect_name}},\n\nGreetings from ZenLyft.\n\nI'm reaching out to introduce ZenLyft (https://zenlyft.in), a technology venture focused on AI workflow automation, SaaS platforms, and custom software solutions.\n\nAfter learning about {{company_name}}, I wanted to explore whether there may be opportunities to simplify {{business_function}} through practical technology.\n\nWould you be available for a brief introductory discussion?\n\nBest regards,\n{{sales_executive_name}}\nFounder & CEO, ZenLyft\nhttps://zenlyft.in",
    required_variables: ['company_name', 'business_function'],
    optional_variables: ['prospect_name'],
    approval_required: true,
  },
];

export const ZENLYFT_SALES_DATASET = {
  company: {
    name: 'ZenLyft',
    website: 'https://zenlyft.in',
    identity: ['AI_AND_AUTOMATION', 'SAAS_AND_DIGITAL_PRODUCTS', 'SOFTWARE_DEVELOPMENT'],
    market: 'INDIA',
  },
  channels: ['WHATSAPP', 'EMAIL'],
  templates: ZENLYFT_TEMPLATES,
  follow_up_rules: {
    day_0: 'First contact',
    day_3: 'First follow-up draft (Founder-approved)',
    day_7: 'Second follow-up draft (Founder-approved)',
    day_14: 'Final follow-up draft (Founder-approved)',
    post_day_14: 'Mark UNRESPONSIVE and stop sequence',
  },
  response_classes: [
    'POSITIVE_INTEREST',
    'REQUEST_FOR_DEMO',
    'REQUEST_FOR_PROPOSAL',
    'REQUEST_FOR_PRICING',
    'NEEDS_MORE_INFORMATION',
    'REFERRAL',
    'NOT_INTERESTED',
    'NOT_NOW',
    'FOLLOW_UP_REQUESTED',
    'WRONG_CONTACT',
    'OUT_OF_OFFICE',
    'OPT_OUT',
    'UNCLEAR',
  ] as MasterResponseClass[],
};

export function selectSalesTemplate(options: {
  industry?: string;
  category?: string;
  serviceRoute?: ServiceRoute;
  channel?: 'WHATSAPP' | 'EMAIL';
}): SalesTemplate {
  const ch = options.channel || 'WHATSAPP';
  if (ch === 'EMAIL') {
    return ZENLYFT_TEMPLATES.find((t) => t.template_id === 'EMAIL_FIRST_001')!;
  }

  const hay = `${options.industry || ''} ${options.category || ''}`.toLowerCase();
  if (/college|hostel|school|university|education|institute/.test(hay)) {
    return ZENLYFT_TEMPLATES.find((t) => t.template_id === 'WA_EDU_006')!;
  }
  if (/clinic|hospital|health|medical/.test(hay)) {
    return ZENLYFT_TEMPLATES.find((t) => t.template_id === 'WA_HEALTH_008')!;
  }
  if (/manufactur|factory|industrial|engineering/.test(hay)) {
    return ZENLYFT_TEMPLATES.find((t) => t.template_id === 'WA_MFG_007')!;
  }
  if (/retail|ecommerce|shop|store|hotel|cafe|restaurant/.test(hay)) {
    return ZENLYFT_TEMPLATES.find((t) => t.template_id === 'WA_RETAIL_009')!;
  }
  if (/startup|software|it|saas|tech/.test(hay)) {
    return ZENLYFT_TEMPLATES.find((t) => t.template_id === 'WA_STARTUP_010')!;
  }
  if (options.serviceRoute === 'AI_AND_AUTOMATION') {
    return ZENLYFT_TEMPLATES.find((t) => t.template_id === 'WA_AI_011')!;
  }
  if (options.serviceRoute === 'SOFTWARE_DEVELOPMENT') {
    return ZENLYFT_TEMPLATES.find((t) => t.template_id === 'WA_CUSTOM_012')!;
  }
  if (options.serviceRoute === 'SAAS_AND_DIGITAL_PRODUCTS') {
    return ZENLYFT_TEMPLATES.find((t) => t.template_id === 'WA_SAAS_013')!;
  }
  return ZENLYFT_TEMPLATES[0];
}

export function renderSalesTemplate(
  template: SalesTemplate,
  vars: {
    prospect_name?: string | null;
    company_name: string;
    location?: string | null;
    business_function?: string | null;
    sales_executive_name?: string;
    website?: string;
  }
): string {
  const greetingName =
    vars.prospect_name && vars.prospect_name.trim()
      ? vars.prospect_name.trim()
      : `${vars.company_name.trim()} Team`;

  return template.message
    .replace(/\{\{prospect_name\}\}/g, greetingName)
    .replace(/\{\{company_name\}\}/g, vars.company_name.trim())
    .replace(/\{\{location\}\}/g, vars.location?.trim() || 'India')
    .replace(
      /\{\{business_function\}\}/g,
      vars.business_function?.trim() || 'core digital workflows'
    )
    .replace(/\{\{sales_executive_name\}\}/g, vars.sales_executive_name || 'Niresh Senthoor')
    .replace(/\{\{website\}\}/g, vars.website || 'https://zenlyft.in');
}

export function generateFirstContactOutreach(options: {
  companyName: string;
  prospectName?: string | null;
  category?: string;
  industry?: string;
  location?: string | null;
  hasWebsite?: boolean;
  channel?: 'WHATSAPP' | 'EMAIL';
}) {
  const routed = routeZenLyftService({
    industry: options.industry,
    category: options.category,
    hasWebsite: options.hasWebsite,
  });
  const template = selectSalesTemplate({
    industry: options.industry,
    category: options.category,
    serviceRoute: routed.route,
    channel: options.channel,
  });
  const message = renderSalesTemplate(template, {
    prospect_name: options.prospectName,
    company_name: options.companyName,
    location: options.location,
    business_function: routed.businessFunction,
  });

  return {
    template_id: template.template_id,
    service_route: routed.route,
    business_function: routed.businessFunction,
    message,
  };
}

/** Section 20: Exact Sales Performance KPIs without fabricated figures */
export function computeSalesKpis(counts: {
  researchedLeads: number;
  qualifiedLeads: number;
  deliveredMessages: number;
  repliesReceived: number;
  positiveReplies: number;
  meetingsBooked: number;
}) {
  const pct = (num: number, den: number) =>
    den > 0 ? Number(((num / den) * 100).toFixed(1)) : null;

  return {
    response_rate_pct: pct(counts.repliesReceived, counts.deliveredMessages),
    positive_response_rate_pct: pct(counts.positiveReplies, counts.deliveredMessages),
    meeting_conversion_rate_pct: pct(counts.meetingsBooked, counts.deliveredMessages),
    lead_qualification_rate_pct: pct(counts.qualifiedLeads, counts.researchedLeads),
  };
}

