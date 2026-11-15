/**
 * REOZ 3.0 Customer Onboarding & Delivery Checklists
 * Enforces rigorous milestone tracking and delivery verification across all ZenLyft service lines.
 */

export interface OnboardingChecklistItem {
  id: string;
  title: string;
  description: string;
  category: 'intake' | 'engineering' | 'verification' | 'delivery';
  completed: boolean;
  completedAt?: string | null;
  assignedRole: 'DEVELOPER' | 'SALES_EXECUTIVE' | 'SUPER_ADMIN';
}

export function getOnboardingChecklistForService(serviceLine: string): OnboardingChecklistItem[] {
  switch (serviceLine) {
    case 'website_project':
      return [
        { id: 'web-1', title: 'Collect Brand Assets & Copy', description: 'Logo, color palette, business contact details, services list, and photos.', category: 'intake', completed: false, assignedRole: 'SALES_EXECUTIVE' },
        { id: 'web-2', title: 'Domain & DNS Configuration', description: 'Register or connect custom domain and configure Cloudflare DNS.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'web-3', title: 'Frontend UI/UX Build', description: 'Assemble mobile-responsive pages with Next.js/Tailwind CSS.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'web-4', title: 'Click-to-Call & WhatsApp Wiring', description: 'Verify all CTA buttons route directly to confirmed staff numbers.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'web-5', title: 'Mobile Responsiveness & Speed Test', description: 'Run Google PageSpeed test and verify on iOS & Android devices.', category: 'verification', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'web-6', title: 'Client Signoff & Domain Go-Live', description: 'Conduct client review call and secure written approval for live DNS.', category: 'delivery', completed: false, assignedRole: 'SUPER_ADMIN' },
      ];

    case 'booking_enquiry':
      return [
        { id: 'book-1', title: 'Collect Appointment Slots & Staff Info', description: 'Working hours, consultation categories, buffer times, and doctor/staff names.', category: 'intake', completed: false, assignedRole: 'SALES_EXECUTIVE' },
        { id: 'book-2', title: 'Deploy Booking Widget Architecture', description: 'Setup database schema and interactive slot selector.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'book-3', title: 'WhatsApp Notification Integration', description: 'Connect WhatsApp gateway to send instant booking confirmation alerts.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'book-4', title: 'End-to-End Booking UAT Test', description: 'Perform 3 simulated patient bookings with real SMS/WhatsApp receipts.', category: 'verification', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'book-5', title: 'Staff Training & Reception Handover', description: 'Walk reception desk staff through the booking management interface.', category: 'delivery', completed: false, assignedRole: 'SALES_EXECUTIVE' },
      ];

    case 'business_automation':
      return [
        { id: 'auto-1', title: 'Process Mapping & Requirements Document', description: 'Document current manual workflow and API integrations.', category: 'intake', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'auto-2', title: 'Workflow Scripting & n8n / Webhook Setup', description: 'Build automated triggers and data transformation scripts.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'auto-3', title: 'Exception Handling & Alert Channels', description: 'Setup retry queues and error notifications via Telegram/Email.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'auto-4', title: 'Staging Environment Dry Run', description: 'Test automation pipeline with synthetic transactions.', category: 'verification', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'auto-5', title: 'Production Go-Live & Founder Signoff', description: 'Deploy to live workload and monitor first 24 hours of operation.', category: 'delivery', completed: false, assignedRole: 'SUPER_ADMIN' },
      ];

    case 'homs_pilot':
      return [
        { id: 'homs-1', title: 'Hostel Roster & Warden Permissions Intake', description: 'Collect student hostel lists, room numbers, and warden contact profiles.', category: 'intake', completed: false, assignedRole: 'SALES_EXECUTIVE' },
        { id: 'homs-2', title: 'Campus HOMS Instance Provisioning', description: 'Deploy dedicated campus instance with custom branding & login portal.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'homs-3', title: 'Security Gate QR Scanner Setup', description: 'Configure tablet or mobile scanners at campus entry/exit gates.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'homs-4', title: 'Parent WhatsApp Alerts Dry Run', description: 'Verify test outpass generates instant parent alert and warden approval.', category: 'verification', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'homs-5', title: 'Warden & Security Guard Onsite Walkthrough', description: 'Train campus personnel on approval queues and scanner operations.', category: 'delivery', completed: false, assignedRole: 'SUPER_ADMIN' },
        { id: 'homs-6', title: '14-Day Pilot Review & Commercial Conversion', description: 'Present pilot uptime report and secure annual campus contract.', category: 'delivery', completed: false, assignedRole: 'SUPER_ADMIN' },
      ];

    case 'campus_node':
      return [
        { id: 'node-1', title: 'Campus LAN & Hardware Specifications Audit', description: 'Inspect local server or mini-PC hardware and campus intranet subnet.', category: 'intake', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'node-2', title: 'Offline-First OS & Campus Node Image Installation', description: 'Flash and provision Linux/Docker image with local database sync.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'node-3', title: 'Bi-directional Cloud Synchronization Test', description: 'Verify seamless offline caching and instant cloud sync upon reconnect.', category: 'verification', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'node-4', title: 'Final Handover to Campus IT Administrator', description: 'Provide system documentation and administrative credentials.', category: 'delivery', completed: false, assignedRole: 'SUPER_ADMIN' },
      ];

    default: // custom_software
      return [
        { id: 'cust-1', title: 'Statement of Work & Architecture Approval', description: 'Finalize scope, technical architecture, and milestones.', category: 'intake', completed: false, assignedRole: 'SUPER_ADMIN' },
        { id: 'cust-2', title: 'Sprint 1 Core Backend & Database Build', description: 'Implement API contracts, database models, and authentication.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'cust-3', title: 'Sprint 2 Frontend Interface Build', description: 'Implement client dashboards, responsive views, and forms.', category: 'engineering', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'cust-4', title: 'User Acceptance Testing (UAT)', description: 'Conduct structured testing with client stakeholders.', category: 'verification', completed: false, assignedRole: 'DEVELOPER' },
        { id: 'cust-5', title: 'Production Deployment & SLA Initiation', description: 'Deploy to production environment and initiate support agreement.', category: 'delivery', completed: false, assignedRole: 'SUPER_ADMIN' },
      ];
  }
}
