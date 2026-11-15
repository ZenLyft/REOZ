/**
 * REOZ 3.0 Conversation Intelligence & Reply Classification Engine
 * Classifies incoming email & WhatsApp replies into 12 actionable categories
 * and enforces strict suppression & founder-approval workflows.
 */

export type ReplyCategory =
  | 'interested'
  | 'pricing'
  | 'demo'
  | 'meeting'
  | 'clarification'
  | 'negotiation'
  | 'not_interested'
  | 'contact_later'
  | 'wrong_contact'
  | 'unsubscribe'
  | 'complaint'
  | 'human_review';

export interface ClassificationResult {
  category: ReplyCategory;
  confidence: number;
  reason: string;
  recommendedAction: string;
  recommendedStage?: string;
  isOptOut: boolean;
}

const OPT_OUT_TRIGGERS = [
  'stop',
  'unsubscribe',
  'optout',
  'opt out',
  'do not contact',
  'don\'t message',
  'remove me',
  'block',
  'spam',
];

const WRONG_CONTACT_TRIGGERS = [
  'wrong number',
  'wrong person',
  'wrong email',
  'not working here',
  'left the company',
  'no longer with',
  'not the owner',
];

const NOT_INTERESTED_TRIGGERS = [
  'not interested',
  'no thanks',
  'no need',
  'we have our own',
  'already have',
  'do not need',
  'not required',
];

const CONTACT_LATER_TRIGGERS = [
  'contact later',
  'busy now',
  'next month',
  'next week',
  'call tomorrow',
  'reach out next',
  'after few days',
  'traveling',
];

const MEETING_TRIGGERS = [
  'call me',
  'meet',
  'meeting',
  'schedule a call',
  'connect over google meet',
  'zoom',
  'available tomorrow',
  'can we talk',
  'let\'s discuss',
];

const DEMO_TRIGGERS = [
  'demo',
  'walkthrough',
  'show me',
  'presentation',
  'video demo',
  'sample',
];

const PRICING_TRIGGERS = [
  'price',
  'cost',
  'pricing',
  'how much',
  'quote',
  'budget',
  'charges',
  'fee',
  'rate',
];

const NEGOTIATION_TRIGGERS = [
  'discount',
  'too expensive',
  'high price',
  'reduce',
  'best offer',
  'concession',
];

/**
 * Classifies incoming WhatsApp / Email response text
 */
export function classifyIncomingMessage(text: string): ClassificationResult {
  const clean = text.toLowerCase().trim();

  // 1. Strict Opt-out / Suppression detection
  for (const trigger of OPT_OUT_TRIGGERS) {
    if (clean === trigger || clean.includes(trigger)) {
      return {
        category: 'unsubscribe',
        confidence: 0.99,
        reason: `Matched explicit suppression trigger: "${trigger}"`,
        recommendedAction: 'Immediately mark lead as DO_NOT_CONTACT and halt all cadences.',
        recommendedStage: 'do_not_contact',
        isOptOut: true,
      };
    }
  }

  // 2. Wrong Contact detection
  for (const trigger of WRONG_CONTACT_TRIGGERS) {
    if (clean.includes(trigger)) {
      return {
        category: 'wrong_contact',
        confidence: 0.95,
        reason: `Recipient reported incorrect contact details: "${trigger}"`,
        recommendedAction: 'Flag contact channel as invalid. Research alternate decision-maker.',
        recommendedStage: 'disqualified',
        isOptOut: false,
      };
    }
  }

  // 3. Meeting Request
  for (const trigger of MEETING_TRIGGERS) {
    if (clean.includes(trigger)) {
      return {
        category: 'meeting',
        confidence: 0.92,
        reason: `Recipient requested a discussion or call: "${trigger}"`,
        recommendedAction: 'Propose 2 meeting slots and generate meeting discovery brief.',
        recommendedStage: 'meeting',
        isOptOut: false,
      };
    }
  }

  // 4. Product Demo Request
  for (const trigger of DEMO_TRIGGERS) {
    if (clean.includes(trigger)) {
      return {
        category: 'demo',
        confidence: 0.9,
        reason: `Recipient requested product demonstration: "${trigger}"`,
        recommendedAction: 'Prepare tailored interactive product demo and send meeting invite.',
        recommendedStage: 'meeting',
        isOptOut: false,
      };
    }
  }

  // 5. Pricing Inquiries
  for (const trigger of PRICING_TRIGGERS) {
    if (clean.includes(trigger)) {
      return {
        category: 'pricing',
        confidence: 0.88,
        reason: `Recipient asked about commercial pricing: "${trigger}"`,
        recommendedAction: 'Send standard transparent package proposal outline.',
        recommendedStage: 'requirements_confirmed',
        isOptOut: false,
      };
    }
  }

  // 6. Negotiation / Discount Discussion
  for (const trigger of NEGOTIATION_TRIGGERS) {
    if (clean.includes(trigger)) {
      return {
        category: 'negotiation',
        confidence: 0.85,
        reason: `Recipient requested discount or terms negotiation: "${trigger}"`,
        recommendedAction: 'Check margin limits. Submit proposed concession for founder signoff.',
        recommendedStage: 'negotiation',
        isOptOut: false,
      };
    }
  }

  // 7. Contact Later
  for (const trigger of CONTACT_LATER_TRIGGERS) {
    if (clean.includes(trigger)) {
      return {
        category: 'contact_later',
        confidence: 0.86,
        reason: `Recipient requested follow-up at a future date: "${trigger}"`,
        recommendedAction: 'Schedule follow-up task 7 days later. Suspend immediate messaging.',
        recommendedStage: 'on_hold',
        isOptOut: false,
      };
    }
  }

  // 8. Explicit Not Interested
  for (const trigger of NOT_INTERESTED_TRIGGERS) {
    if (clean.includes(trigger)) {
      return {
        category: 'not_interested',
        confidence: 0.9,
        reason: `Recipient declined offer: "${trigger}"`,
        recommendedAction: 'Politely acknowledge and mark lead as lost. Cease active follow-ups.',
        recommendedStage: 'lost',
        isOptOut: false,
      };
    }
  }

  // 9. General Positive Interest
  const positiveSignals = ['yes', 'sure', 'interested', 'tell me more', 'details', 'okay', 'ok', 'share details'];
  for (const signal of positiveSignals) {
    if (clean === signal || clean.startsWith(signal) || clean.includes(signal)) {
      return {
        category: 'interested',
        confidence: 0.84,
        reason: `Positive interest signal: "${signal}"`,
        recommendedAction: 'Acknowledge interest, present tailored value proposition and suggest call.',
        recommendedStage: 'responded',
        isOptOut: false,
      };
    }
  }

  // Default: Human Review
  return {
    category: 'human_review',
    confidence: 0.5,
    reason: 'Uncategorized reply requiring human executive review.',
    recommendedAction: 'Present in inbox for sales representative or founder review.',
    recommendedStage: 'responded',
    isOptOut: false,
  };
}
