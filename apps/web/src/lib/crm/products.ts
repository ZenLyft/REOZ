/**
 * ZenLyft Central Product & Service Catalogue
 * Commercial source of truth for AI agents (SDR, AE, Negotiation, Closing, Customer Success)
 */

export type ProductCategory =
  | 'education_technology'
  | 'website_development'
  | 'ai_automation'
  | 'custom_software'
  | 'technical_services';

export interface ProductCatalogueItem {
  id: string;
  name: string;
  category: ProductCategory;
  category_label: string;
  description: string;
  target_customer: string;
  problems_solved: string[];
  features: string[];
  deliverables: string[];
  requirements: string[];
  dependencies: string[];
  supported_technologies: string[];
  limitations: string[];
  pricing_model: 'fixed' | 'monthly_retainer' | 'per_student' | 'milestone';
  minimum_approved_price_inr: number;
  recommended_price_inr: number;
  maximum_approved_discount_percent: number;
  implementation_time_days: number;
  payment_terms: string;
  maintenance_options: string;
  demo_available: boolean;
  is_active: boolean;
  faqs: { q: string; a: string }[];
}

export const ZENLYFT_PRODUCT_CATALOGUE: readonly ProductCatalogueItem[] = [
  // --- Category A: Education Technology ---
  {
    id: 'prod-homs',
    name: 'Hostel Outpass Management System (HOMS)',
    category: 'education_technology',
    category_label: 'Education Technology',
    description:
      'Digital student outpass and hostel movement tracking system with parent WhatsApp/SMS alerts and biometric verification.',
    target_customer: 'Engineering colleges, Arts & Science colleges, and residential university hostels',
    problems_solved: [
      'Manual paper outpass registers getting lost or falsified',
      'Parents unaware of when their children enter or exit the hostel',
      'Hostel wardens overwhelmed by manual phone calls for approvals',
      'Delayed warden sign-offs during weekend and holiday rushes',
    ],
    features: [
      'Student mobile outpass request workflow',
      '1-tap warden approval via responsive web app',
      'Instant parent WhatsApp notification upon sign-out and sign-in',
      'Gate security QR scan verification',
      'Warden administrative dashboard with real-time in-hostel roll call',
    ],
    deliverables: [
      'Fully deployed HOMS web portal on college custom subdomain',
      'Gate security scanner interface',
      'Warden & Administrator management dashboard',
      'WhatsApp notification API integration',
      'Staff and warden onboarding & training session',
    ],
    requirements: ['College domain DNS access', 'Student roster CSV export'],
    dependencies: ['WhatsApp Gateway (Evolution API / Meta Business)', 'Cloud Database'],
    supported_technologies: ['Next.js', 'PostgreSQL', 'Tailwind CSS', 'WhatsApp Business API'],
    limitations: ['Hardware turnstile integration requires dedicated on-site biometric bridge'],
    pricing_model: 'milestone',
    minimum_approved_price_inr: 35000,
    recommended_price_inr: 45000,
    maximum_approved_discount_percent: 15,
    implementation_time_days: 14,
    payment_terms: '40% advance, 40% on pilot deployment, 20% on final warden handover',
    maintenance_options: '₹4,999/month for cloud hosting, database backups, and 24/7 priority support',
    demo_available: true,
    is_active: true,
    faqs: [
      {
        q: 'Can wardens approve outpasses from their mobile phones?',
        a: 'Yes, wardens have a mobile-first dashboard where they can review student reasons and approve with 1 tap.',
      },
      {
        q: 'Does HOMS notify parents automatically?',
        a: 'Yes, as soon as the security gate scans the student outpass QR code, an automated message is delivered to the parent WhatsApp.',
      },
    ],
  },
  {
    id: 'prod-edu-erp',
    name: 'College Attendance & Admin ERP Module',
    category: 'education_technology',
    category_label: 'Education Technology',
    description:
      'Cloud-based student attendance, timetable management, and administrative reporting module for higher education departments.',
    target_customer: 'Autonomous colleges and private educational institutions',
    problems_solved: [
      'Fragmented paper attendance registers',
      'Slow monthly percentage calculations for exam eligibility',
      'Lack of unified department reporting',
    ],
    features: [
      'Faculty daily period attendance marker',
      'Automated shortage calculation (<75% alerts)',
      'Department HOD overview dashboard',
      'Exportable PDF/Excel compliance reports',
    ],
    deliverables: [
      'Department ERP deployment',
      'Faculty & HOD account configuration',
      'Database integration with existing student records',
    ],
    requirements: ['Student semester lists', 'Department timetable schedule'],
    dependencies: ['Cloud Database', 'College Server/Domain'],
    supported_technologies: ['Next.js', 'PostgreSQL', 'Tailwind CSS'],
    limitations: ['Custom university exam portal syncing depends on university API availability'],
    pricing_model: 'milestone',
    minimum_approved_price_inr: 50000,
    recommended_price_inr: 75000,
    maximum_approved_discount_percent: 10,
    implementation_time_days: 21,
    payment_terms: '50% advance, 50% on department rollout',
    maintenance_options: '₹7,500/month ongoing maintenance & server patching',
    demo_available: true,
    is_active: true,
    faqs: [],
  },

  // --- Category B: Website Development ---
  {
    id: 'prod-web-starter',
    name: 'Starter Business Showcase Website (3-Page)',
    category: 'website_development',
    category_label: 'Website Development',
    description:
      'High-performance, mobile-first business website designed to convert local prospects into direct phone calls and WhatsApp enquiries.',
    target_customer: 'Local clinics, salons, cafes, retail stores, and service businesses in Tamil Nadu',
    problems_solved: [
      'No web presence when customers search on Google',
      'Losing customers to competitors who have professional mobile websites',
      'Lack of direct WhatsApp or call-to-action buttons for walk-in inquiries',
    ],
    features: [
      'Ultra-fast Next.js architecture (sub-second load time)',
      '1-tap WhatsApp consultation & Click-to-Call buttons',
      'Google Business Profile & Google Maps location embed',
      'SEO metadata setup for local search ranking',
      'Free SSL certificate & global CDN hosting',
    ],
    deliverables: [
      '3 custom-designed pages (Home, Services/Menu, Contact)',
      'Mobile-responsive layout',
      'Domain linking and SSL configuration',
      'Google Search Console submission',
    ],
    requirements: ['Business logo, photos, and list of services/prices'],
    dependencies: ['Domain name registration (by client or ZenLyft)'],
    supported_technologies: ['Next.js 14', 'Tailwind CSS', 'Vercel / Cloudflare Pages'],
    limitations: ['Does not include e-commerce cart or payment gateway'],
    pricing_model: 'fixed',
    minimum_approved_price_inr: 8999,
    recommended_price_inr: 9999,
    maximum_approved_discount_percent: 10,
    implementation_time_days: 5,
    payment_terms: '50% advance before design, 50% upon deployment to live domain',
    maintenance_options: '₹1,499/month for content updates, hosting monitoring, and monthly backup',
    demo_available: true,
    is_active: true,
    faqs: [
      {
        q: 'How fast can our website go live?',
        a: 'Within 5 business days from receiving your photos and content.',
      },
    ],
  },
  {
    id: 'prod-web-growth',
    name: 'Growth Booking & Catalog Suite (5-Page)',
    category: 'website_development',
    category_label: 'Website Development',
    description:
      'Interactive website with product/service catalog, online appointment booking form, and instant founder WhatsApp alerts.',
    target_customer: 'Hospitals, hotels, restaurants, coaching academies, and manufacturing SMEs',
    problems_solved: [
      'Manual phone booking chaos during peak hours',
      'Outdated static PDF menus or catalogs that customers cannot view on mobile',
      'Missed customer inquiries after business hours',
    ],
    features: [
      '5 structured pages (Home, About, Catalog/Services, Booking, Contact)',
      'Interactive appointment booking widget with instant WhatsApp alert to business owner',
      'Interactive digital catalog with photo gallery and price filters',
      'Bilingual support (English + Tamil)',
      'Customer reviews and testimonials carousel',
    ],
    deliverables: [
      'Complete 5-page responsive web platform',
      'Booking inquiry management backend',
      'SEO optimization for target city/district keywords',
    ],
    requirements: ['Product/service photos, descriptions, and booking schedule hours'],
    dependencies: ['Custom domain', 'WhatsApp notification webhook'],
    supported_technologies: ['Next.js', 'PostgreSQL', 'Tailwind CSS'],
    limitations: ['Does not include credit card payment gateway integration (inquire for custom quote)'],
    pricing_model: 'fixed',
    minimum_approved_price_inr: 15999,
    recommended_price_inr: 17999,
    maximum_approved_discount_percent: 12,
    implementation_time_days: 8,
    payment_terms: '50% advance, 50% on live client sign-off',
    maintenance_options: '₹2,499/month including up to 4 monthly catalog updates and priority support',
    demo_available: true,
    is_active: true,
    faqs: [],
  },

  // --- Category C: AI and Business Automation ---
  {
    id: 'prod-ai-enquiry-bot',
    name: 'AI WhatsApp Customer Enquiry Assistant',
    category: 'ai_automation',
    category_label: 'AI & Business Automation',
    description:
      'Autonomous WhatsApp conversational AI agent trained on your business pricing, operating hours, and services that answers customer questions 24/7.',
    target_customer: 'Hotels, clinics, academies, retail shops, and professional service firms',
    problems_solved: [
      'Staff wasting hours answering repetitive "What is your pricing?" questions',
      'Customers messaging at night and getting no response, resulting in lost deals',
      'Inconsistent information provided by different front-desk employees',
    ],
    features: [
      'Natural conversational AI in English and Tamil',
      'Automatic instant responses based on verified business knowledge base',
      'Escalation to human owner whenever high-intent customer requests quotation or callback',
      'Lead capture and CRM integration',
    ],
    deliverables: [
      'Configured AI model with business knowledge vector store',
      'WhatsApp Business API / Evolution API connection',
      'Owner escalation alert workflow',
    ],
    requirements: ['WhatsApp phone number', 'FAQ document / price list'],
    dependencies: ['Evolution API or Meta Cloud API', 'Groq / Gemini AI Provider'],
    supported_technologies: ['Python', 'Groq Llama-3.3-70b', 'Evolution API', 'PostgreSQL'],
    limitations: ['Does not make voice telephone calls (text messaging only)'],
    pricing_model: 'fixed',
    minimum_approved_price_inr: 18000,
    recommended_price_inr: 22000,
    maximum_approved_discount_percent: 10,
    implementation_time_days: 7,
    payment_terms: '50% advance, 50% upon live WhatsApp testing completion',
    maintenance_options: '₹2,999/month for AI tokens, knowledge base tuning, and server monitoring',
    demo_available: true,
    is_active: true,
    faqs: [],
  },

  // --- Category D: Custom Software ---
  {
    id: 'prod-custom-portal',
    name: 'Custom Business Operations Portal & Dashboard',
    category: 'custom_software',
    category_label: 'Custom Software',
    description:
      'Tailored internal web application to replace messy spreadsheets, manage orders, assign staff tasks, and track business revenue.',
    target_customer: 'Textile manufacturers in Tiruppur, distributors, logistics providers, and regional SMEs',
    problems_solved: [
      'Spreadsheet version chaos and accidental formula overwriting',
      'No real-time visibility into daily production, dispatch, or pending invoices',
      'Lack of role-based permissions between staff, managers, and owners',
    ],
    features: [
      'Role-based access control (Admin, Manager, Staff)',
      'Live order pipeline & dispatch tracking',
      'Automated invoice generation and payment recording',
      'Mobile-friendly executive dashboard for the owner',
    ],
    deliverables: [
      'Custom database schema and secure backend',
      'Responsive web portal with staff authentication',
      'Staff training documentation and 30-day warranty',
    ],
    requirements: ['Detailed workflow briefing and current Excel/paper sample templates'],
    dependencies: ['Cloud Database', 'Hosting Infrastructure'],
    supported_technologies: ['Next.js', 'PostgreSQL / Supabase', 'Tailwind CSS', 'TypeScript'],
    limitations: ['Custom ERP integrations with legacy on-premise systems quoted separately'],
    pricing_model: 'milestone',
    minimum_approved_price_inr: 45000,
    recommended_price_inr: 65000,
    maximum_approved_discount_percent: 15,
    implementation_time_days: 25,
    payment_terms: '40% advance, 30% milestone review, 30% final deployment',
    maintenance_options: '₹4,999/month including database backups, bug fixes, and minor adjustments',
    demo_available: true,
    is_active: true,
    faqs: [],
  },

  // --- Category E: Technical Services ---
  {
    id: 'prod-tech-maintenance',
    name: 'Monthly Website Care & Security Maintenance',
    category: 'technical_services',
    category_label: 'Technical Services',
    description:
      'Continuous uptime monitoring, weekly security backups, SSL renewals, performance audits, and up to 3 hours of content updates each month.',
    target_customer: 'Any existing website owner looking to avoid hacking, downtime, and slow loading',
    problems_solved: [
      'Websites crashing or getting defaced with nobody noticing for days',
      'Expired SSL certificates showing "Not Secure" warning to customers',
      'Business owners lacking technical skills to update text, photos, or prices',
    ],
    features: [
      '24/7 uptime monitoring with instant WhatsApp alert on downtime',
      'Automated off-site database & code backups',
      'Monthly speed and Core Web Vitals optimization',
      'Content updates (text, images, banners) within 24 hours of request',
    ],
    deliverables: [
      'Monthly maintenance health report',
      'Dedicated WhatsApp support group with ZenLyft engineers',
    ],
    requirements: ['Current hosting / DNS credentials'],
    dependencies: ['Access to existing web server'],
    supported_technologies: ['WordPress', 'Next.js', 'PHP', 'HTML/CSS', 'Node.js'],
    limitations: ['Major feature redesigns are billed under development packages'],
    pricing_model: 'monthly_retainer',
    minimum_approved_price_inr: 1999,
    recommended_price_inr: 2999,
    maximum_approved_discount_percent: 10,
    implementation_time_days: 1,
    payment_terms: 'Billed monthly in advance',
    maintenance_options: 'Annual commitment includes 2 months free',
    demo_available: false,
    is_active: true,
    faqs: [],
  },
];

/**
 * Validates whether an agent's proposed price and discount are within approved commercial boundaries.
 */
export function validateCommercialOffer(
  productId: string,
  proposedPriceInr: number,
  proposedDiscountPercent: number
): { isApproved: boolean; reason: string; item?: ProductCatalogueItem } {
  const item = ZENLYFT_PRODUCT_CATALOGUE.find((p) => p.id === productId);
  if (!item) {
    return {
      isApproved: false,
      reason: `Product ID "${productId}" not found in approved ZenLyft catalogue.`,
    };
  }

  if (!item.is_active) {
    return {
      isApproved: false,
      reason: `Product "${item.name}" is currently deactivated in the catalogue.`,
      item,
    };
  }

  if (proposedPriceInr < item.minimum_approved_price_inr) {
    return {
      isApproved: false,
      reason: `Proposed price ₹${proposedPriceInr} is below minimum approved floor of ₹${item.minimum_approved_price_inr} for ${item.name}. Escalation to founder required (Autonomy Level 3).`,
      item,
    };
  }

  if (proposedDiscountPercent > item.maximum_approved_discount_percent) {
    return {
      isApproved: false,
      reason: `Proposed discount of ${proposedDiscountPercent}% exceeds maximum approved limit of ${item.maximum_approved_discount_percent}%. Escalation to founder required (Autonomy Level 3).`,
      item,
    };
  }

  return {
    isApproved: true,
    reason: 'Commercially approved within catalogue boundaries.',
    item,
  };
}
