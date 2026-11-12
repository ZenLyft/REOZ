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
                ? 'bg-[#11100E] text-[#FAF6EE] shadow-sm'
                : 'text-[#5A554C] hover:text-[#11100E] hover:bg-[#EFE7DA]'
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
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFDF9]/95 backdrop-blur border-t border-[#E5DDD0] px-2 py-2 flex items-center justify-around">
      {mobileItems.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition ${
              isActive
                ? 'bg-[#11100E] text-[#FAF6EE]'
                : 'text-[#5A554C] hover:text-[#11100E]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

