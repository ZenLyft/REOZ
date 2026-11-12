'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', exact: true },
  { href: '/dashboard/ascension', label: 'Find Clients', exact: false },
  { href: '/dashboard/leads', label: 'Leads', exact: false },
  { href: '/dashboard/approvals', label: 'Approvals', exact: false },
  { href: '/dashboard/whatsapp', label: 'WhatsApp', exact: false },
  { href: '/dashboard/projects', label: 'Projects', exact: false },
  { href: '/dashboard/revenue', label: 'Revenue', exact: false },
  { href: '/dashboard/settings', label: 'Settings', exact: false },
];

export function DesktopNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="hidden lg:flex items-center gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isActive
                ? 'bg-[#151B2B] text-[#F5F6F8] shadow-sm border-b-2 border-[#FF6B35]'
                : 'text-[#525A6B] hover:text-[#151B2B] hover:bg-[#ECEFF3]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const mobileItems = [
    { href: '/dashboard', label: 'Home', exact: true },
    { href: '/dashboard/ascension', label: 'Find', exact: false },
    { href: '/dashboard/leads', label: 'Leads', exact: false },
    { href: '/dashboard/approvals', label: 'Approve', exact: false },
    { href: '/dashboard/revenue', label: 'Revenue', exact: false },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-t border-[#E4E7EC] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-[0_-4px_20px_rgba(21,27,43,0.06)]">
      {mobileItems.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`min-h-[38px] flex items-center justify-center px-3 py-1.5 rounded-xl text-[11px] font-bold transition-transform active:scale-95 ${
              isActive
                ? 'bg-[#FF6B35] text-[#FFFFFF] shadow-sm'
                : 'text-[#525A6B] hover:text-[#151B2B]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
