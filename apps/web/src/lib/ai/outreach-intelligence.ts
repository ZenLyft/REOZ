import {
  computeCanonicalApprovalHash,
  type CanonicalApprovalPayload,
} from '@/lib/crm/pricing-and-hash';
import { scoreProspect100Point } from './zenlyft-client-engine';

export type PrimaryServiceCategory =
  | 'AI_AND_AUTOMATION'
  | 'SAAS_AND_DIGITAL_PRODUCTS'
  | 'CUSTOM_SOFTWARE_DEVELOPMENT'
  | 'MULTI_SERVICE';

export type ProspectIndustryClass =
  | 'HEALTHCARE'
  | 'FITNESS'
  | 'EDUCATION_HOSTEL'
  | 'EDUCATION_INSTITUTION'
  | 'COACHING_ACADEMY'
  | 'MANUFACTURING'
  | 'RETAIL_ECOMMERCE'
  | 'REAL_ESTATE'
  | 'HOSPITALITY'
  | 'IT_STARTUPS'
  | 'GENERAL_BUSINESS'
  | 'NOT_A_FIT';

export type VerificationFlag = 'VERIFIED' | 'UNKNOWN';
export type ConfidenceLevelLabel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ProspectResearchInput {
  lead_id?: string;
  company_name: string;
  industry?: string | null;
  category?: string | null;
  location?: string | null;
  website_url?: string | null;
  website_status?: string | null;
  public_phone?: string | null;
  public_email?: string | null;
  decision_maker_name?: string | null;
  decision_maker_role?: string | null;
  business_description?: string | null;
  services_offered?: string[];
  research_sources?: string[];
  observed_facts?: string[];
  contact_restriction?: string | null;
}

export interface ResearchProfile {
  company_name: string;
  industry: string;
  sub_industry: string;
  location: string;
  official_website: string;
  business_description: string;
  services_offered: string[];
  target_audience: string[];
  digital_presence: {
    website_available: boolean;
    booking_system: VerificationFlag;
    customer_portal: VerificationFlag;
    mobile_app: VerificationFlag;
    online_payments: VerificationFlag;
    automation_signals: string[];
  };
  public_business_observations: string[];
  potential_business_needs: string[];
  research_sources: string[];
  confidence_score: number;
  confidence_label: ConfidenceLevelLabel;
  research_status: 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE';
  decision_maker_name: string | null;
  decision_maker_role: string;
}

export interface BusinessNeedItem {
  need: string;
  evidence: string[];
  confidence: ConfidenceLevelLabel;
  recommended_solution: string;
  potential_benefit: string;
  discovery_question: string;
}

export interface ServiceMatchAnalysis {
  primary_service: PrimaryServiceCategory;
  recommended_solution: string;
  why_this_service: string;
  problem_addressed: string;
  expected_business_outcome: string;
  why_prospect_might_be_interested: string;
  personalization_reason: string;
}

export interface MessageQualityBreakdown {
  business_relevance: number; // max 25
  personalization: number; // max 20
  research_accuracy: number; // max 20
  service_matching: number; // max 15
  professional_communication: number; // max 10
  call_to_action: number; // max 10
}

export interface MessageQualityEvaluation {
  score: number;
  eligible_for_approval_inbox: boolean;
  needs_manual_research: boolean;
  regeneration_count: number;
  breakdown: MessageQualityBreakdown;
  issues: string[];
}

export interface OutreachIntelligenceDossier {
  status: 'READY' | 'NEEDS_MANUAL_RESEARCH' | 'NOT_A_FIT' | 'SUPPRESSED';
  template_version: string;
  industry_class: ProspectIndustryClass;
  lead_score: number;
  research_profile: ResearchProfile;
  business_needs: BusinessNeedItem[];
  service_match: ServiceMatchAnalysis;
  discovery_question: string;
  whatsapp_draft: string;
  email_subject: string;
  email_draft: string;
  quality_evaluation: MessageQualityEvaluation;
  whatsapp_recipient: string;
  email_recipient: string;
  whatsapp_hash: string;
  email_hash: string;
  canonical_whatsapp_payload: CanonicalApprovalPayload;
  canonical_email_payload: CanonicalApprovalPayload;
}

export const BANNED_GENERIC_PHRASES = [
  'we provide ai, saas and software solutions',
  'let us transform your business',
  'we offer cutting-edge technology',
  'modern mobile booking showcase',
  '2-minute digital preview',
];

export const UNSUPPORTED_CLAIM_PHRASES = [
  'we reviewed your entire digital presence',
  'we identified problems in your system',
  'we noticed you do not have an application',
  'we developed a solution specifically for you',
];

export function hasDisallowedClaimsOrGenericPitch(text: string): string[] {
  const lower = (text || '').toLowerCase();
  const hits: string[] = [];
  for (const p of BANNED_GENERIC_PHRASES) {
    if (lower.includes(p)) hits.push(`Banned generic phrase: "${p}"`);
  }
  for (const c of UNSUPPORTED_CLAIM_PHRASES) {
    if (lower.includes(c)) hits.push(`Unsupported claim: "${c}"`);
  }
  return hits;
}

/** Lightweight public website inspection (non-blocking 2.5s timeout, never fabricates signals) */
export async function inspectPublicWebsiteMetadata(websiteUrl?: string | null): Promise<{
  reachable: boolean;
  title?: string;
  description?: string;
  bookingSignal: VerificationFlag;
  portalSignal: VerificationFlag;
  paymentSignal: VerificationFlag;
  appSignal: VerificationFlag;
}> {
  if (!websiteUrl || !websiteUrl.startsWith('http')) {
    return {
      reachable: false,
      bookingSignal: 'UNKNOWN',
      portalSignal: 'UNKNOWN',
      paymentSignal: 'UNKNOWN',
      appSignal: 'UNKNOWN',
    };
  }

  try {
    const res = await fetch(websiteUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'ZenLyft-REOZ-Research/1.0 (+https://zenlyft.in)' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return {
        reachable: false,
        bookingSignal: 'UNKNOWN',
        portalSignal: 'UNKNOWN',
        paymentSignal: 'UNKNOWN',
        appSignal: 'UNKNOWN',
      };
    }

    const html = (await res.text()).slice(0, 60000);
    const titleMatch = html.match(/<title[^>]*>([^<]{2,140})<\/title>/i);
    const descMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{4,240})["']/i
    );
    const lowerHtml = html.toLowerCase();

    return {
      reachable: true,
      title: titleMatch?.[1]?.trim(),
      description: descMatch?.[1]?.trim(),
      bookingSignal:
        /\b(book appointment|book online|appointment|schedule a visit|reserve room)\b/.test(lowerHtml)
          ? 'VERIFIED'
          : 'UNKNOWN',
      portalSignal:
        /\b(student portal|patient portal|member login|lms login|erp login)\b/.test(lowerHtml)
          ? 'VERIFIED'
          : 'UNKNOWN',
      paymentSignal:
        /\b(razorpay|stripe|pay online|fee payment|upi)\b/.test(lowerHtml) ? 'VERIFIED' : 'UNKNOWN',
      appSignal:
        /\b(play\.google\.com\/store\/apps|apps\.apple\.com\/app)\b/.test(lowerHtml)
          ? 'VERIFIED'
          : 'UNKNOWN',
    };
  } catch {
    return {
      reachable: false,
      bookingSignal: 'UNKNOWN',
      portalSignal: 'UNKNOWN',
      paymentSignal: 'UNKNOWN',
      appSignal: 'UNKNOWN',
    };
  }
}

export function classifyProspectIndustry(input: ProspectResearchInput): ProspectIndustryClass {
  const text = `${input.company_name || ''} ${input.industry || ''} ${input.category || ''} ${input.business_description || ''}`.toLowerCase();

  if (/\b(personal blog|spam test|do not contact test|irrelevant consumer|tea stall|roadside|pan shop|street vendor)\b/.test(text)) {
    return 'NOT_A_FIT';
  }
  if (/\b(hostel|dormitory|student housing|pg accommodation|men'?s hostel|women'?s hostel)\b/.test(text)) {
    return 'EDUCATION_HOSTEL';
  }
  if (/\b(coaching|ias|upsc|neet|jee|academy|tuition|training institute|competitive exam)\b/.test(text)) {
    return 'COACHING_ACADEMY';
  }
  if (/\b(college|university|school|polytechnic|campus|institute of technology)\b/.test(text)) {
    return 'EDUCATION_INSTITUTION';
  }
  if (/\b(hospital|eye|clinic|healthcare|medical|dental|diagnostic|pharma|orthopaedic)\b/.test(text)) {
    return 'HEALTHCARE';
  }
  if (/\b(fitness|gym|wellness|crossfit|yoga studio|pilates|health club)\b/.test(text)) {
    return 'FITNESS';
  }
  if (/\b(manufactur|factory|industrial|gears|textile|spinning|foundry|machinery|cnc|packaging)\b/.test(text)) {
    return 'MANUFACTURING';
  }
  if (/\b(retail|ecommerce|e-commerce|supermarket|apparel|store|showroom|boutique)\b/.test(text)) {
    return 'RETAIL_ECOMMERCE';
  }
  if (/\b(real estate|property|builders|developers|apartments|villas|realtor)\b/.test(text)) {
    return 'REAL_ESTATE';
  }
  if (/\b(hotel|resort|hospitality|restaurant|cafe|banquet|lodge)\b/.test(text)) {
    return 'HOSPITALITY';
  }
  if (/\b(software|it company|saas|startup|tech|digital agency|fintech|cloud)\b/.test(text)) {
    return 'IT_STARTUPS';
  }
  return 'GENERAL_BUSINESS';
}

interface IndustryPlaybook {
  industryLabel: string;
  subIndustry: string;
  targetAudience: string[];
  defaultRole: string;
  defaultServices: string[];
  primaryService: PrimaryServiceCategory;
  solutionName: string;
  focusArea: string;
  needsTemplates: Array<{
    need: string;
    solution: string;
    benefit: string;
    question: string;
  }>;
}

const INDUSTRY_PLAYBOOKS: Record<Exclude<ProspectIndustryClass, 'NOT_A_FIT'>, IndustryPlaybook> = {
  HEALTHCARE: {
    industryLabel: 'Healthcare & Hospitals',
    subIndustry: 'Specialty Clinic / Multi-Specialty Hospital',
    targetAudience: ['Patients & Families', 'Outpatient Care Seekers'],
    defaultRole: 'Hospital Operations / Medical Administration',
    defaultServices: ['Outpatient consultations', 'Specialist diagnostics & care'],
    primaryService: 'SAAS_AND_DIGITAL_PRODUCTS',
    solutionName: 'Healthcare Appointment & Patient Enquiry Software',
    focusArea: 'patient appointment management and outpatient enquiry workflows',
    needsTemplates: [
      {
        need: 'Streamlined online patient appointment booking & doctor availability scheduling',
        solution: 'Healthcare appointment management software',
        benefit: 'Reduces front-desk call bottlenecks and improves OPD scheduling clarity',
        question: 'How does your front desk currently coordinate specialist appointment bookings and patient reminders?',
      },
      {
        need: 'Automated patient enquiry triage and appointment reminder communication',
        solution: 'Patient enquiry & WhatsApp reminder workflow',
        benefit: 'Cuts missed appointments and speeds up patient response times',
        question: 'Are missed OPD slots or manual enquiry follow-ups a challenge for your reception team?',
      },
      {
        need: 'Unified hospital administration web portal for enquiry and queue visibility',
        solution: 'Custom hospital web & administration portal',
        benefit: 'Gives coordinators real-time visibility into incoming patient requests',
        question: 'Is improving digital patient communication a current operational priority?',
      },
    ],
  },
  FITNESS: {
    industryLabel: 'Fitness & Wellness',
    subIndustry: 'Gym / Personal Training & Wellness Centre',
    targetAudience: ['Fitness Members', 'Corporate & Walk-in Trial Prospects'],
    defaultRole: 'Founder / Club Manager',
    defaultServices: ['Gym memberships', 'Personal training & wellness programs'],
    primaryService: 'SAAS_AND_DIGITAL_PRODUCTS',
    solutionName: 'Gym Membership, Trial Booking & Renewal Platform',
    focusArea: 'membership enquiries, trial session bookings, and renewal workflows',
    needsTemplates: [
      {
        need: 'Automated membership enquiry capture & trial session booking workflows',
        solution: 'Trial booking & membership enquiry platform',
        benefit: 'Converts more walk-in and digital fitness enquiries into paying members',
        question: 'How does your team currently track incoming membership enquiries and trial bookings?',
      },
      {
        need: 'Timely membership renewal reminders & trainer schedule coordination',
        solution: 'Gym management & automated renewal system',
        benefit: 'Improves monthly member retention with minimal manual follow-up',
        question: 'Are membership renewals and trainer scheduling currently managed manually?',
      },
      {
        need: 'Centralized attendance & member engagement dashboard',
        solution: 'Custom fitness member administration portal',
        benefit: 'Gives studio managers clear retention and capacity visibility',
        question: 'Is simplifying member management something your team is currently considering?',
      },
    ],
  },
  EDUCATION_HOSTEL: {
    industryLabel: 'Education & Student Housing',
    subIndustry: 'College Hostel & Residential Campus Administration',
    targetAudience: ['Residential Students', 'Parents & Campus Wardens'],
    defaultRole: 'Chief Warden / Principal / Correspondent',
    defaultServices: ['Residential student accommodation', 'Campus hostel administration'],
    primaryService: 'SAAS_AND_DIGITAL_PRODUCTS',
    solutionName: 'Hostel Outpass Management System (HOMS) & Warden Portal',
    focusArea: 'student hostel outpass requests, warden approvals, and parent alerts',
    needsTemplates: [
      {
        need: 'Digitized student hostel leave & outpass approval workflows replacing paper registers',
        solution: 'ZenLyft Hostel Outpass Management System (HOMS)',
        benefit: 'Eliminates manual register delays and creates verified gatepass audit trails',
        question: 'How does your institution currently manage student leave requests and hostel outpass approvals?',
      },
      {
        need: 'Automated parent & warden confirmation notifications for campus exits and returns',
        solution: 'Automated parent-warden approval workflow',
        benefit: 'Strengthens campus safety communication with timely parent updates',
        question: 'Would real-time warden and parent approval notifications help your hostel staff?',
      },
      {
        need: 'Daily hostel attendance & occupancy administration visibility',
        solution: 'Institutional hostel administration dashboard',
        benefit: 'Reduces manual reconciliation workload for residential wardens',
        question: 'Are your wardens looking to simplify daily student attendance and hostel administration?',
      },
    ],
  },
  EDUCATION_INSTITUTION: {
    industryLabel: 'Education Institutions',
    subIndustry: 'College / University / School Campus',
    targetAudience: ['Prospective & Enrolled Students', 'Parents & Faculty'],
    defaultRole: 'Principal / Correspondent / Registrar',
    defaultServices: ['Academic degree programs', 'Campus student administration'],
    primaryService: 'SAAS_AND_DIGITAL_PRODUCTS',
    solutionName: 'Institutional Admissions, Student Portal & Hostel Workflow Platform',
    focusArea: 'student admission enquiries, fee tracking, and campus administration workflows',
    needsTemplates: [
      {
        need: 'Structured prospective student admission enquiry tracking & follow-up workflows',
        solution: 'Student enquiry & admission workflow portal',
        benefit: 'Prevents admission leads from slipping through manual registers',
        question: 'How does your admissions desk currently track student enquiries across departments?',
      },
      {
        need: 'Centralized student administration, attendance, and parent communication tools',
        solution: 'Institutional management & communication platform',
        benefit: 'Saves administrative staff hours spent on repetitive circular updates',
        question: 'Which administrative workflow creates the most manual coordination for your staff today?',
      },
      {
        need: 'Connected fee & residential hostel leave administration',
        solution: 'Custom education workflow & HOMS module',
        benefit: 'Unifies student records and campus approvals in one web portal',
        question: 'Are you evaluating digital workflow improvements for upcoming academic cycles?',
      },
    ],
  },
  COACHING_ACADEMY: {
    industryLabel: 'Coaching & Competitive Exam Academies',
    subIndustry: 'IAS / Competitive Test Prep & Skill Coaching Centre',
    targetAudience: ['Competitive Exam Aspirants', 'College & Graduate Students'],
    defaultRole: 'Director / Academy Founder',
    defaultServices: ['Classroom & test series coaching', 'Student counselling & batch training'],
    primaryService: 'SAAS_AND_DIGITAL_PRODUCTS',
    solutionName: 'Coaching Enquiry, Course Registration & Batch Management System',
    focusArea: 'student enquiries, course registrations, counselling bookings, and batch scheduling',
    needsTemplates: [
      {
        need: 'High-intent aspirant enquiry capture & counselling session scheduling',
        solution: 'Admission enquiry & counselling booking portal',
        benefit: 'Speeds up counselling conversion during peak admission seasons',
        question: 'How do counsellors at your academy currently follow up on student enquiries and demo classes?',
      },
      {
        need: 'Batch scheduling, course registration, and fee installment tracking',
        solution: 'Coaching batch & student administration software',
        benefit: 'Keeps batch rosters and fee reminders organized without spreadsheet errors',
        question: 'Is coordinating multiple batch schedules and fee follow-ups a manual effort right now?',
      },
      {
        need: 'Automated student communication for test schedules and material updates',
        solution: 'Automated student WhatsApp & portal alert system',
        benefit: 'Keeps batches informed with less administrative effort',
        question: 'Would simplifying student communication and assessment updates help your faculty team?',
      },
    ],
  },
  MANUFACTURING: {
    industryLabel: 'Manufacturing & Industrial',
    subIndustry: 'Industrial Production & Engineering Enterprise',
    targetAudience: ['B2B Industrial Buyers', 'Plant Operations Teams'],
    defaultRole: 'Managing Director / Plant Operations Head',
    defaultServices: ['Industrial manufacturing', 'B2B component & product supply'],
    primaryService: 'CUSTOM_SOFTWARE_DEVELOPMENT',
    solutionName: 'Custom Production Tracking, Inventory & Approval Reporting System',
    focusArea: 'inventory workflows, production tracking, and internal operational approvals',
    needsTemplates: [
      {
        need: 'Real-time visibility into raw material inventory & shop-floor job status',
        solution: 'Custom inventory & production tracking module',
        benefit: 'Reduces manual spreadsheet consolidation and stock discrepancies',
        question: 'How does your team currently track daily production progress and inventory levels across departments?',
      },
      {
        need: 'Structured internal maintenance, purchase, and dispatch approval workflows',
        solution: 'Internal workflow & approval web platform',
        benefit: 'Cuts approval turnaround time across plant supervisors and management',
        question: 'Are internal approvals or maintenance logs still handled over spreadsheets and paper slips?',
      },
      {
        need: 'Automated management reporting & exception alerts from operational logs',
        solution: 'AI-assisted operational reporting dashboard',
        benefit: 'Gives leadership concise daily production metrics without manual reporting',
        question: 'Would unified operational reporting be valuable for your plant leadership?',
      },
    ],
  },
  RETAIL_ECOMMERCE: {
    industryLabel: 'Retail & E-Commerce',
    subIndustry: 'Omnichannel Retail Store / Consumer Brand',
    targetAudience: ['Retail Shoppers', 'Repeat Online Customers'],
    defaultRole: 'Founder / Retail Operations Head',
    defaultServices: ['Consumer retail', 'Direct-to-customer ordering'],
    primaryService: 'AI_AND_AUTOMATION',
    solutionName: 'AI Customer Support, Order Enquiry & Inventory Workflow Automation',
    focusArea: 'customer product enquiries, order status automation, and repeat engagement',
    needsTemplates: [
      {
        need: 'Fast, structured responses to high-volume WhatsApp & web product enquiries',
        solution: 'AI-powered customer enquiry & support assistant',
        benefit: 'Captures buyers outside store hours and cuts manual support volume',
        question: 'How does your team currently handle incoming product enquiries and order status questions?',
      },
      {
        need: 'Connected online ordering and real-time catalog inventory visibility',
        solution: 'Custom e-commerce & inventory synchronization workflow',
        benefit: 'Prevents stock-out disappointments and streamlines fulfilment',
        question: 'Are catalog updates and customer order tracking synchronized across your sales channels?',
      },
      {
        need: 'Opt-in customer retention & post-purchase engagement flows',
        solution: 'Customer retention & CRM workflow automation',
        benefit: 'Encourages repeat orders with relevant, permission-based updates',
        question: 'Is improving digital enquiry conversion a focus for your stores this quarter?',
      },
    ],
  },
  REAL_ESTATE: {
    industryLabel: 'Real Estate & Property',
    subIndustry: 'Residential / Commercial Property Developer & Brokerage',
    targetAudience: ['Home Buyers', 'Commercial Property Investors'],
    defaultRole: 'Director / Sales Head',
    defaultServices: ['Property sales', 'Site visits & buyer consultation'],
    primaryService: 'SAAS_AND_DIGITAL_PRODUCTS',
    solutionName: 'Property Enquiry CRM & Site Visit Scheduling Platform',
    focusArea: 'property lead tracking, site visit scheduling, and buyer follow-ups',
    needsTemplates: [
      {
        need: 'Centralized property enquiry capture & verified site-visit scheduling',
        solution: 'Property enquiry CRM & site visit scheduler',
        benefit: 'Ensures every serious buyer inquiry receives structured follow-up',
        question: 'How does your sales team currently schedule site visits and track buyer enquiries across projects?',
      },
      {
        need: 'Consistent, transparent post-visit buyer follow-up workflows',
        solution: 'Lead management & follow-up pipeline portal',
        benefit: 'Improves sales visibility across brochures, floor plans, and follow-ups',
        question: 'Would better visibility into post-visit follow-ups help your sales advisors close faster?',
      },
      {
        need: 'Interactive digital project showcase & unit availability portal',
        solution: 'Custom property listing & availability web platform',
        benefit: 'Lets prospects explore verified floor details before arriving on site',
        question: 'Are you looking to upgrade how buyers inspect project listings and book visits online?',
      },
    ],
  },
  HOSPITALITY: {
    industryLabel: 'Hotels & Hospitality',
    subIndustry: 'Hotel / Resort / Guest Accommodation',
    targetAudience: ['Leisure & Business Travelers', 'Event & Banquet Guests'],
    defaultRole: 'General Manager / Owner',
    defaultServices: ['Room accommodation', 'Guest hospitality & event bookings'],
    primaryService: 'SAAS_AND_DIGITAL_PRODUCTS',
    solutionName: 'Direct Reservation Enquiry & Guest Communication Platform',
    focusArea: 'direct booking enquiries, room availability coordination, and guest messaging',
    needsTemplates: [
      {
        need: 'Streamlined direct reservation enquiries reducing reliance on third-party commissions',
        solution: 'Direct hospitality reservation & availability portal',
        benefit: 'Encourages higher-margin direct bookings from prospective guests',
        question: 'How does your front desk currently coordinate direct booking enquiries and room availability requests?',
      },
      {
        need: 'Timely pre-arrival check-in guidance & guest WhatsApp support',
        solution: 'Automated guest communication workflow',
        benefit: 'Enhances guest experience while freeing up reception bandwidth',
        question: 'Do staff handle most guest directions, check-in queries, and banquet enquiries manually?',
      },
      {
        need: 'Consolidated room & event booking workflow dashboard',
        solution: 'Custom hospitality administration platform',
        benefit: 'Reduces manual coordination between reservations and housekeeping',
        question: 'Is simplifying direct reservation workflows on your roadmap this season?',
      },
    ],
  },
  IT_STARTUPS: {
    industryLabel: 'IT Companies & Technology Startups',
    subIndustry: 'Software / Digital Product / B2B Tech',
    targetAudience: ['Enterprise & SMB Tech Buyers', 'Product Users'],
    defaultRole: 'CTO / Founder / Engineering Lead',
    defaultServices: ['Technology products', 'B2B software & digital services'],
    primaryService: 'CUSTOM_SOFTWARE_DEVELOPMENT',
    solutionName: 'Custom Backend API Engineering, AI Integration & SaaS Acceleration',
    focusArea: 'internal workflow automation, API integrations, and AI feature delivery',
    needsTemplates: [
      {
        need: 'Faster delivery of custom backend APIs and third-party system integrations',
        solution: 'Custom backend & API engineering modules',
        benefit: 'Ships integration roadmaps faster without slowing down core product sprints',
        question: 'Where does your engineering team currently see the biggest backlog across integrations or internal tools?',
      },
      {
        need: 'Practical AI workflow & document automation inside existing products',
        solution: 'Production AI agent & workflow integration',
        benefit: 'Adds verifiable automation features while maintaining strict guardrails',
        question: 'Are customers or internal ops requesting workflow automation that hasn’t fit into recent sprints?',
      },
      {
        need: 'Dedicated SaaS admin tooling and internal operations portals',
        solution: 'Custom SaaS & internal workflow systems',
        benefit: 'Keeps core engineers focused on flagship product differentiation',
        question: 'Would flexible engineering capacity for supporting portals or AI modules be helpful right now?',
      },
    ],
  },
  GENERAL_BUSINESS: {
    industryLabel: 'Commercial B2B Enterprise',
    subIndustry: 'Service / Commercial Organisation',
    targetAudience: ['Commercial Clients', 'Regional Customers'],
    defaultRole: 'Founder / Operations Head',
    defaultServices: ['Commercial business operations'],
    primaryService: 'AI_AND_AUTOMATION',
    solutionName: 'Business Process Workflow & Enquiry Management System',
    focusArea: 'client enquiry management and internal operational workflows',
    needsTemplates: [
      {
        need: 'Organized customer enquiry tracking & response workflows',
        solution: 'Business enquiry & workflow management platform',
        benefit: 'Prevents missed enquiries across staff and shifts',
        question: 'How does your team currently organize incoming client enquiries and internal follow-ups?',
      },
      {
        need: 'Reduced manual repetition across administrative reporting & approvals',
        solution: 'Automated business workflow integration',
        benefit: 'Frees staff time for higher-value customer delivery',
        question: 'Which repetitive administrative task takes the most time for your team each week?',
      },
      {
        need: 'Custom digital administration tools tailored to company operations',
        solution: 'Custom internal software portal',
        benefit: 'Centralizes operational visibility without spreadsheet silos',
        question: 'Are you evaluating software or workflow improvements for your operations this year?',
      },
    ],
  },
};

export function buildResearchProfile(
  input: ProspectResearchInput,
  liveSignals?: Awaited<ReturnType<typeof inspectPublicWebsiteMetadata>>
): { profile: ResearchProfile; industryClass: ProspectIndustryClass } {
  const companyName = String(input.company_name || '').trim();
  const industryClass = classifyProspectIndustry(input);
  const playbook =
    industryClass === 'NOT_A_FIT'
      ? INDUSTRY_PLAYBOOKS.GENERAL_BUSINESS
      : INDUSTRY_PLAYBOOKS[industryClass];

  const hasWebsite = Boolean(input.website_url && input.website_url.startsWith('http'));
  const observations: string[] = [...(input.observed_facts || [])];

  if (input.location) {
    observations.push(`Public business location recorded in ${input.location}.`);
  }
  if (hasWebsite && liveSignals?.reachable && liveSignals.title) {
    observations.push(`Official website title observed: "${liveSignals.title}".`);
  } else if (hasWebsite) {
    observations.push(`Public website listed at ${input.website_url} (feature completeness unverified).`);
  } else {
    observations.push('No official website URL confirmed in initial public registry check (UNKNOWN if external portal exists).');
  }
  if (input.public_phone) {
    observations.push('Public business phone contact listed.');
  }
  if (input.public_email) {
    observations.push('Public business email contact listed.');
  }

  const bookingSystem: VerificationFlag = liveSignals?.bookingSignal || 'UNKNOWN';
  const customerPortal: VerificationFlag = liveSignals?.portalSignal || 'UNKNOWN';
  const mobileApp: VerificationFlag = liveSignals?.appSignal || 'UNKNOWN';
  const onlinePayments: VerificationFlag = liveSignals?.paymentSignal || 'UNKNOWN';

  const automationSignals: string[] = [];
  if (bookingSystem === 'VERIFIED') automationSignals.push('Online booking keywords verified');
  if (customerPortal === 'VERIFIED') automationSignals.push('User portal link verified');
  if (onlinePayments === 'VERIFIED') automationSignals.push('Online payments verified');

  const isMissingCompanyInfo = companyName.length < 3 || (!input.category && !input.industry && !input.location);
  const confidenceScore = isMissingCompanyInfo
    ? 32
    : Math.min(
        96,
        52 +
          (hasWebsite ? 16 : 6) +
          (liveSignals?.reachable ? 10 : 0) +
          (input.public_phone ? 10 : 0) +
          (input.public_email ? 6 : 0) +
          (input.decision_maker_name ? 6 : 0)
      );

  const confidenceLabel: ConfidenceLevelLabel =
    confidenceScore >= 78 ? 'HIGH' : confidenceScore >= 55 ? 'MEDIUM' : 'LOW';

  const researchStatus: 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE' = isMissingCompanyInfo
    ? 'INCOMPLETE'
    : hasWebsite || Boolean(input.public_phone || input.public_email)
      ? 'COMPLETE'
      : 'PARTIAL';

  const profile: ResearchProfile = {
    company_name: companyName || 'Unknown Organisation',
    industry: input.industry || playbook.industryLabel,
    sub_industry: input.category || playbook.subIndustry,
    location: String(input.location || 'India').trim(),
    official_website: input.website_url || 'UNKNOWN',
    business_description:
      input.business_description ||
      liveSignals?.description ||
      `${companyName || 'This organisation'} operates in ${playbook.industryLabel} serving ${playbook.targetAudience.join(' & ')} in ${input.location || 'India'}.`,
    services_offered:
      input.services_offered && input.services_offered.length > 0
        ? input.services_offered
        : playbook.defaultServices,
    target_audience: playbook.targetAudience,
    digital_presence: {
      website_available: hasWebsite,
      booking_system: bookingSystem,
      customer_portal: customerPortal,
      mobile_app: mobileApp,
      online_payments: onlinePayments,
      automation_signals: automationSignals,
    },
    public_business_observations: observations,
    potential_business_needs: playbook.needsTemplates.map((n) => n.need),
    research_sources:
      input.research_sources && input.research_sources.length > 0
        ? input.research_sources
        : [input.website_url || 'https://www.openstreetmap.org'],
    confidence_score: confidenceScore,
    confidence_label: confidenceLabel,
    research_status: researchStatus,
    decision_maker_name: input.decision_maker_name?.trim() || null,
    decision_maker_role: input.decision_maker_role?.trim() || playbook.defaultRole,
  };

  return { profile, industryClass };
}

export function identifyBusinessNeeds(
  profile: ResearchProfile,
  industryClass: ProspectIndustryClass
): BusinessNeedItem[] {
  const playbook =
    industryClass === 'NOT_A_FIT'
      ? INDUSTRY_PLAYBOOKS.GENERAL_BUSINESS
      : INDUSTRY_PLAYBOOKS[industryClass];

  const baseEvidence =
    profile.public_business_observations.length > 0
      ? profile.public_business_observations.slice(0, 2)
      : [`Industry classification: ${profile.industry}`];

  return playbook.needsTemplates.map((tpl, idx) => {
    // Only assign HIGH confidence when backed by direct verified website/source observation AND strong profile confidence
    const confidence: ConfidenceLevelLabel =
      idx === 0 && profile.confidence_label === 'HIGH' && profile.digital_presence.website_available
        ? 'HIGH'
        : profile.research_status === 'INCOMPLETE'
          ? 'LOW'
          : idx < 2
            ? 'MEDIUM'
            : 'LOW';

    return {
      need: tpl.need,
      evidence: baseEvidence,
      confidence,
      recommended_solution: tpl.solution,
      potential_benefit: tpl.benefit,
      discovery_question: tpl.question,
    };
  });
}

export function matchZenLyftService(
  profile: ResearchProfile,
  needs: BusinessNeedItem[],
  industryClass: ProspectIndustryClass
): ServiceMatchAnalysis {
  const playbook =
    industryClass === 'NOT_A_FIT'
      ? INDUSTRY_PLAYBOOKS.GENERAL_BUSINESS
      : INDUSTRY_PLAYBOOKS[industryClass];

  const primaryNeed = needs[0];
  return {
    primary_service: playbook.primaryService,
    recommended_solution: playbook.solutionName,
    why_this_service: `Matches ${profile.company_name}'s sector (${profile.industry}) and role profile (${profile.decision_maker_role}) around ${playbook.focusArea}.`,
    problem_addressed: primaryNeed?.need || playbook.focusArea,
    expected_business_outcome:
      primaryNeed?.potential_benefit || 'Improves operational coordination and enquiry responsiveness.',
    why_prospect_might_be_interested: `${profile.industry} organisations in ${profile.location} typically see direct operational time savings when ${playbook.focusArea} is streamlined without disrupting existing operations.`,
    personalization_reason: `Tailored to ${profile.company_name} (${profile.industry}, ${profile.location}) focusing specifically on ${playbook.focusArea} rather than generic pitch templates.`,
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildIndustrySpecificWhatsappAndEmail(options: {
  profile: ResearchProfile;
  needs: BusinessNeedItem[];
  serviceMatch: ServiceMatchAnalysis;
  industryClass: ProspectIndustryClass;
  discoveryMode?: boolean;
}): { whatsapp: string; emailSubject: string; emailBody: string } {
  const { profile, needs, serviceMatch, industryClass, discoveryMode } = options;
  const greeting = profile.decision_maker_name
    ? `Hello ${profile.decision_maker_name},`
    : `Hello ${profile.company_name} Team,`;

  const topNeed = needs[0];
  const playbook =
    industryClass === 'NOT_A_FIT'
      ? INDUSTRY_PLAYBOOKS.GENERAL_BUSINESS
      : INDUSTRY_PLAYBOOKS[industryClass];

  let bodyCore = '';
  let emailSubject = `Exploring Workflow Improvements at ${profile.company_name}`;
  let emailIntro = '';

  if (discoveryMode || profile.research_status === 'INCOMPLETE') {
    bodyCore = `I'm Niresh from ZenLyft.\n\nI came across ${profile.company_name}${profile.location ? ` in ${profile.location}` : ''} and wanted to learn whether streamlining internal operations or digital customer workflows is a current priority for your team.\n\nWould you be open to a brief introductory conversation this week?`;
    emailSubject = `Introductory Note — Operational Workflows at ${profile.company_name}`;
    emailIntro = `I wanted to reach out respectfully and learn whether ${profile.company_name} is exploring workflow automation or custom digital tooling this quarter. Rather than assuming your current setup, I would appreciate a brief conversation to understand your priorities.`;
  } else {
    switch (industryClass) {
      case 'HEALTHCARE':
        bodyCore = `I'm Niresh from ZenLyft.\n\nI came across ${profile.company_name} in ${profile.location} and wanted to connect regarding outpatient appointment management and patient enquiry coordination.\n\nWe build software that helps healthcare clinics simplify appointment scheduling, reception enquiries, and patient reminders without adding staff workload.\n\nIs streamlining any of those workflows a current focus for your team?`;
        emailSubject = `Exploring Appointment Workflow Improvements at ${profile.company_name}`;
        emailIntro = `After looking into ${profile.company_name}'s specialist services in ${profile.location}, I wanted to explore whether reducing front-desk scheduling friction and automating patient appointment reminders is a current priority.`;
        break;
      case 'FITNESS':
        bodyCore = `I'm Niresh from ZenLyft.\n\nI came across ${profile.company_name} in ${profile.location} and wanted to connect regarding your membership enquiry, trial booking, and renewal workflows.\n\nWe develop dedicated gym management platforms that help fitness clubs capture trial leads, coordinate trainer schedules, and automate renewal reminders.\n\nIs improving any of those member workflows something your club is considering?`;
        emailSubject = `Digital Membership Management for ${profile.company_name}`;
        emailIntro = `Noticing ${profile.company_name}'s wellness and training offerings in ${profile.location}, I wanted to ask how your team currently tracks trial session bookings and membership renewal follow-ups.`;
        break;
      case 'COACHING_ACADEMY':
        bodyCore = `I'm Niresh from ZenLyft.\n\nI came across ${profile.company_name} in ${profile.location} and wanted to understand how your team currently handles student enquiries, course registrations, and batch scheduling.\n\nZenLyft builds focused coaching management systems designed to simplify counselling follow-ups, batch tracking, and student communication.\n\nWould you be open to discussing whether a tailored system could help your academy?`;
        emailSubject = `Student Enquiry & Batch Workflow Solutions for ${profile.company_name}`;
        emailIntro = `I came across ${profile.company_name} in ${profile.location} and wanted to understand how your counsellors and faculty coordinate high-volume aspirant enquiries, course registrations, and batch scheduling.`;
        break;
      case 'EDUCATION_HOSTEL':
        bodyCore = `I'm Niresh from ZenLyft.\n\nI wanted to connect regarding student hostel administration at ${profile.company_name} in ${profile.location}.\n\nWe develop institutional hostel platforms for Indian campuses—covering digital outpass requests, warden approvals, and timely parent confirmation workflows.\n\nWould you be open to a brief conversation on how your hostel staff currently manage student leave approvals?`;
        emailSubject = `Student Administration & Hostel Workflows for ${profile.company_name}`;
        emailIntro = `I wanted to connect regarding residential student administration at ${profile.company_name}. We build digital hostel outpass and warden approval workflows designed to reduce paperwork for campus wardens.`;
        break;
      case 'EDUCATION_INSTITUTION':
        bodyCore = `I'm Niresh from ZenLyft.\n\nI came across ${profile.company_name} in ${profile.location} and wanted to connect regarding student admissions tracking and campus administration workflows.\n\nWe build institutional education portals and hostel outpass systems tailored to college departments and registrars.\n\nIs simplifying student administration or admissions enquiry follow-ups a priority this semester?`;
        emailSubject = `Student Administration Solutions for ${profile.company_name}`;
        emailIntro = `I came across ${profile.company_name} in ${profile.location} and wanted to explore whether digitizing admission enquiry tracking or student campus administration is a priority for your leadership team.`;
        break;
      case 'MANUFACTURING':
        bodyCore = `I'm Niresh from ZenLyft.\n\nI came across ${profile.company_name} in ${profile.location} and wanted to ask how your plant team currently tracks inventory movement, production logs, and internal approvals.\n\nWe build custom operational dashboards and internal workflow modules tailored for Indian manufacturing teams.\n\nWould a quick conversation on where manual reporting takes the most time be useful?`;
        emailSubject = `Exploring Production & Workflow Visibility at ${profile.company_name}`;
        emailIntro = `After learning about ${profile.company_name}'s manufacturing operations in ${profile.location}, I wanted to explore how your team handles shop-floor inventory visibility, maintenance logs, and internal approvals.`;
        break;
      default:
        bodyCore = `I'm Niresh from ZenLyft.\n\nI came across ${profile.company_name} (${profile.location}) and wanted to understand how your team currently handles ${playbook.focusArea}.\n\nWe build ${serviceMatch.recommended_solution.toLowerCase()} tailored to ${profile.industry.toLowerCase()} workflows.\n\nWould you be open to a brief conversation on whether simplifying these workflows could help your team?`;
        emailSubject = `Exploring Workflow Improvements at ${profile.company_name}`;
        emailIntro = `I came across ${profile.company_name} in ${profile.location} and wanted to explore how your team currently manages ${playbook.focusArea}.`;
        break;
    }
  }

  const whatsapp = `${greeting}\n\n${bodyCore}\n\nRegards,\nNiresh\nZenLyft`;

  const emailBody = `${greeting}\n\nGreetings from ZenLyft (https://zenlyft.in).\n\n${emailIntro}\n\nSpecifically, we support organisations in ${profile.industry} with ${serviceMatch.recommended_solution}—focused on ${topNeed?.need.toLowerCase() || playbook.focusArea} so ${serviceMatch.expected_business_outcome.toLowerCase()}.\n\n${topNeed?.discovery_question || 'Would you be available for a brief 15-minute introductory call this week?'}\n\nBest regards,\nNiresh Senthoor\nFounder & CEO, ZenLyft\nhttps://zenlyft.in`;

  return { whatsapp, emailSubject, emailBody };
}

export function evaluateMessageQuality(options: {
  whatsapp: string;
  emailSubject: string;
  emailBody: string;
  profile: ResearchProfile;
  needs: BusinessNeedItem[];
  serviceMatch: ServiceMatchAnalysis;
  regenerationCount?: number;
}): MessageQualityEvaluation {
  const { whatsapp, emailSubject, emailBody, profile, serviceMatch } = options;
  const issues: string[] = [];

  const claimViolations = [
    ...hasDisallowedClaimsOrGenericPitch(whatsapp),
    ...hasDisallowedClaimsOrGenericPitch(emailBody),
  ];
  issues.push(...claimViolations);

  const wc = countWords(whatsapp);
  if (wc < 35 || wc > 125) {
    issues.push(`WhatsApp word count (${wc}) outside ideal 45–100 word band.`);
  }

  const mentionsCompany =
    whatsapp.includes(profile.company_name) &&
    emailBody.includes(profile.company_name) &&
    emailSubject.includes(profile.company_name);

  if (!mentionsCompany) {
    issues.push('Message missing exact company name.');
  }

  const business_relevance =
    profile.research_status === 'INCOMPLETE' ? 14 : mentionsCompany ? 24 : 15;
  const personalization = mentionsCompany
    ? profile.location && whatsapp.includes(profile.location)
      ? 19
      : 16
    : 8;
  const research_accuracy =
    claimViolations.length > 0
      ? 5
      : profile.research_status === 'COMPLETE'
        ? 19
        : profile.research_status === 'PARTIAL'
          ? 16
          : 12;
  const service_matching = serviceMatch.primary_service ? 14 : 8;
  const professional_communication = wc >= 35 && wc <= 120 ? 10 : 7;
  const call_to_action = whatsapp.includes('?') && emailBody.includes('?') ? 10 : 6;

  const score = Math.min(
    100,
    business_relevance +
      personalization +
      research_accuracy +
      service_matching +
      professional_communication +
      call_to_action
  );

  return {
    score,
    eligible_for_approval_inbox: score >= 75 && claimViolations.length === 0,
    needs_manual_research: score < 75 || profile.research_status === 'INCOMPLETE',
    regeneration_count: options.regenerationCount ?? 0,
    breakdown: {
      business_relevance,
      personalization,
      research_accuracy,
      service_matching,
      professional_communication,
      call_to_action,
    },
    issues,
  };
}

/**
 * Full Research-Driven Outreach Pipeline:
 * 1. Inspects public evidence / website metadata
 * 2. Builds Business Intelligence ResearchProfile
 * 3. Identifies 3+ Business Needs with HIGH/MEDIUM/LOW confidence
 * 4. Matches exactly 1 primary ZenLyft service & explanation
 * 5. Generates unique WhatsApp (~45-100 words) & Email (subject + body) drafts
 * 6. Evaluates Quality Score (>=75/100 threshold, regenerating or flagging manual research if <75)
 * 7. Computes canonical full SHA-256 hashes bound to exact Lead, Recipient & Channel
 */
export async function researchAndPrepareOutreach(
  input: ProspectResearchInput,
  options?: { inspectWebsite?: boolean }
): Promise<OutreachIntelligenceDossier> {
  const suppression = String(input.contact_restriction || 'none').toLowerCase();
  const isSuppressed = suppression === 'opt_out' || suppression === 'do_not_contact';

  const liveSignals =
    options?.inspectWebsite && input.website_url
      ? await inspectPublicWebsiteMetadata(input.website_url)
      : undefined;

  const { profile, industryClass } = buildResearchProfile(input, liveSignals);
  const needs = identifyBusinessNeeds(profile, industryClass);
  const serviceMatch = matchZenLyftService(profile, needs, industryClass);
  const scoreRes = scoreProspect100Point({
    industry: profile.industry,
    hasDecisionMaker: Boolean(profile.decision_maker_role),
    decisionMakerVerified: Boolean(profile.decision_maker_name),
    identifiedChallenge: needs.some((n) => n.confidence !== 'LOW'),
    serviceRoute:
      serviceMatch.primary_service === 'CUSTOM_SOFTWARE_DEVELOPMENT'
        ? 'SOFTWARE_DEVELOPMENT'
        : serviceMatch.primary_service,
    hasPhoneOrEmail: Boolean(input.public_phone || input.public_email),
    hasWebsite: profile.digital_presence.website_available,
  });

  // Generate & evaluate with automatic regeneration if < 75
  let drafts = buildIndustrySpecificWhatsappAndEmail({
    profile,
    needs,
    serviceMatch,
    industryClass,
    discoveryMode: profile.research_status === 'INCOMPLETE',
  });

  let evaluation = evaluateMessageQuality({
    whatsapp: drafts.whatsapp,
    emailSubject: drafts.emailSubject,
    emailBody: drafts.emailBody,
    profile,
    needs,
    serviceMatch,
    regenerationCount: 0,
  });

  if (!evaluation.eligible_for_approval_inbox) {
    drafts = buildIndustrySpecificWhatsappAndEmail({
      profile,
      needs,
      serviceMatch,
      industryClass,
      discoveryMode: true,
    });
    evaluation = evaluateMessageQuality({
      whatsapp: drafts.whatsapp,
      emailSubject: drafts.emailSubject,
      emailBody: drafts.emailBody,
      profile,
      needs,
      serviceMatch,
      regenerationCount: 1,
    });
  }

  const leadId = String(input.lead_id || 'pending-lead-id');
  const templateVersion = 'research-v2';
  const whatsappRecipient = String(input.public_phone || 'Pending Verified Contact').trim();
  const emailRecipient = String(input.public_email || 'Pending Verified Email').trim();

  const canonicalWhatsappPayload: CanonicalApprovalPayload = {
    lead_id: leadId,
    recipient: whatsappRecipient,
    channel: 'whatsapp',
    message_content: drafts.whatsapp,
    template_version: templateVersion,
    approval_scope: 'first_contact',
  };

  const canonicalEmailPayload: CanonicalApprovalPayload = {
    lead_id: leadId,
    recipient: emailRecipient,
    channel: 'email',
    message_content: drafts.emailBody,
    subject: drafts.emailSubject,
    template_version: templateVersion,
    approval_scope: 'first_contact',
  };

  const status: OutreachIntelligenceDossier['status'] = isSuppressed
    ? 'SUPPRESSED'
    : industryClass === 'NOT_A_FIT'
      ? 'NOT_A_FIT'
      : evaluation.needs_manual_research
        ? 'NEEDS_MANUAL_RESEARCH'
        : 'READY';

  return {
    status,
    template_version: templateVersion,
    industry_class: industryClass,
    lead_score: scoreRes.score,
    research_profile: profile,
    business_needs: needs,
    service_match: serviceMatch,
    discovery_question: needs[0]?.discovery_question || '',
    whatsapp_draft: drafts.whatsapp,
    email_subject: drafts.emailSubject,
    email_draft: drafts.emailBody,
    quality_evaluation: evaluation,
    whatsapp_recipient: whatsappRecipient,
    email_recipient: emailRecipient,
    whatsapp_hash: computeCanonicalApprovalHash(canonicalWhatsappPayload),
    email_hash: computeCanonicalApprovalHash(canonicalEmailPayload),
    canonical_whatsapp_payload: canonicalWhatsappPayload,
    canonical_email_payload: canonicalEmailPayload,
  };
}
