/**
 * REOZ 3.0 Proposal & Commercial Quotation Engine
 * Prepares professional branded proposals with margin analysis & founder approval gates.
 */

import { RevenueDivision } from '@/lib/types/database';
import { calculateGrossMargin } from '@/lib/crm/leads';

export interface ProposalDeliverable {
  title: string;
  description: string;
  included: boolean;
}

export interface PaymentMilestone {
  milestone: string;
  percentage: number;
  amountInr: number;
  condition: string;
}

export interface ProposalPayload {
  leadId: string;
  division: RevenueDivision;
  productName: string;
  scope: string;
  deliverables: ProposalDeliverable[];
  exclusions: string;
  timelineDays: number;
  quoteInr: number;
  estimatedHours: number;
  paymentMilestones: PaymentMilestone[];
  deliveryCostInr: number;
  grossMarginPercent: number;
  meetsMinimumMargin: boolean;
}

export function buildProposalForProduct(params: {
  leadId: string;
  division: RevenueDivision;
  serviceLine: 'website_starter' | 'website_booking' | 'homs_pilot' | 'custom_software';
  clientName: string;
  customQuoteInr?: number;
  customHours?: number;
}): ProposalPayload {
  const { leadId, division, serviceLine, clientName } = params;

  if (serviceLine === 'website_starter') {
    const quoteInr = params.customQuoteInr || 9999;
    const estimatedHours = params.customHours || 4;
    const margin = calculateGrossMargin(quoteInr, estimatedHours, 500, 1000);

    return {
      leadId,
      division,
      productName: 'Professional Business Web Showcase',
      scope: `Complete modern, high-speed, mobile-responsive web platform designed for ${clientName}. Includes corporate branding, services showcase, Google Maps / SEO integration, and direct click-to-call / click-to-WhatsApp capabilities.`,
      deliverables: [
        { title: 'Custom UI/UX Web Architecture', description: '5-section responsive design optimized for mobile and desktop.', included: true },
        { title: 'Google SEO & Local Maps Setup', description: 'Meta tags, OpenGraph previews, and Google Business Profile indexing.', included: true },
        { title: 'Click-to-WhatsApp & Direct Contact CTAs', description: 'Direct customer routing to your active phone/WhatsApp numbers.', included: true },
        { title: '1 Year High-Speed Cloud Hosting', description: 'SSL certificate, 99.9% uptime, and CDN acceleration.', included: true },
      ],
      exclusions: 'E-commerce payment gateways, multi-vendor portals, or ongoing marketing advertising spend.',
      timelineDays: 7,
      quoteInr,
      estimatedHours,
      paymentMilestones: [
        { milestone: 'Project Kickoff & Intake', percentage: 50, amountInr: Math.round(quoteInr * 0.5), condition: 'Upon agreement signing' },
        { milestone: 'Final Deployment & Domain Live', percentage: 50, amountInr: Math.round(quoteInr * 0.5), condition: 'Upon DNS go-live confirmation' },
      ],
      deliveryCostInr: margin.deliveryCostInr,
      grossMarginPercent: margin.grossMarginPercent,
      meetsMinimumMargin: margin.meetsMinimumMargin,
    };
  }

  if (serviceLine === 'website_booking') {
    const quoteInr = params.customQuoteInr || 17999;
    const estimatedHours = params.customHours || 8;
    const margin = calculateGrossMargin(quoteInr, estimatedHours, 500, 1000);

    return {
      leadId,
      division,
      productName: 'Business Web Platform + Automated Booking & Enquiry Engine',
      scope: `Comprehensive digital presence for ${clientName} with an automated appointment booking, enquiry management, and customer reminder workflow.`,
      deliverables: [
        { title: 'Interactive Appointment Booking Widget', description: 'Calendar time slot selector with customer intake form.', included: true },
        { title: 'Instant WhatsApp & Email Alert System', description: 'Immediate notification dispatched to staff upon new booking.', included: true },
        { title: 'Customer Confirmation & Reminder Engine', description: 'Automated booking confirmation sent directly to client phone.', included: true },
        { title: 'Admin Appointments Management Dashboard', description: 'Simple view to manage, reschedule, and verify daily bookings.', included: true },
        { title: 'Full Website Development & 1-Yr Cloud Hosting', description: 'Domain setup, SSL certificate, and CDN acceleration.', included: true },
      ],
      exclusions: 'Third-party SMS gateway carrier fees (uses WhatsApp Business API), proprietary CRM migrations.',
      timelineDays: 10,
      quoteInr,
      estimatedHours,
      paymentMilestones: [
        { milestone: 'Project Kickoff & Architecture Signoff', percentage: 50, amountInr: Math.round(quoteInr * 0.5), condition: 'Upon agreement signing' },
        { milestone: 'Booking Widget UAT & Go-Live', percentage: 50, amountInr: Math.round(quoteInr * 0.5), condition: 'Upon verified booking test and domain live' },
      ],
      deliveryCostInr: margin.deliveryCostInr,
      grossMarginPercent: margin.grossMarginPercent,
      meetsMinimumMargin: margin.meetsMinimumMargin,
    };
  }

  // Institutional HOMS
  const quoteInr = params.customQuoteInr || 85000;
  const estimatedHours = params.customHours || 20;
  const margin = calculateGrossMargin(quoteInr, estimatedHours, 600, 4000);

  return {
    leadId,
    division: 'division_b_institutional',
    productName: 'HOMS (Hostel Outpass Management System) — Annual Campus License',
    scope: `Deployment of ZenLyft HOMS across campus hostels for ${clientName}. Digitizes warden leave authorizations, automated parent WhatsApp notifications, and security gate QR/biometric checkout.`,
    deliverables: [
      { title: 'Student Digital Outpass Mobile App / Portal', description: '1-tap request with emergency, local, and weekend categories.', included: true },
      { title: 'Warden Approval & Duty Roster Console', description: 'Real-time multi-hostel approval queue with curfew alerts.', included: true },
      { title: 'Automated Parent Notification Gateway', description: 'Instant departure and safe arrival confirmation to registered parents.', included: true },
      { title: 'Security Gate Scanner Console', description: 'Offline-capable QR scan and timestamp verification at main gates.', included: true },
      { title: '14-Day Zero-Risk Pilot Setup & Staff Training', description: 'Hands-on onboarding for wardens and security staff.', included: true },
    ],
    exclusions: 'Hardware purchases (tablets or biometric readers can be provided at cost or run on existing smartphones).',
    timelineDays: 21,
    quoteInr,
    estimatedHours,
    paymentMilestones: [
      { milestone: 'Pilot Setup & Campus Configuration', percentage: 30, amountInr: Math.round(quoteInr * 0.3), condition: 'Upon pilot deployment' },
      { milestone: 'Full Campus Rollout & Integration', percentage: 40, amountInr: Math.round(quoteInr * 0.4), condition: 'Upon successful pilot review' },
      { milestone: 'Annual License & Support Confirmation', percentage: 30, amountInr: Math.round(quoteInr * 0.3), condition: '30 days after live operation' },
    ],
    deliveryCostInr: margin.deliveryCostInr,
    grossMarginPercent: margin.grossMarginPercent,
    meetsMinimumMargin: margin.meetsMinimumMargin,
  };
}
