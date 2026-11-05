import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AIChatDrawer } from '@/components/AIChatDrawer';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const navLinks = [
    { href: '/dashboard', label: 'Overview' },
    { href: '/dashboard/agents', label: '15 AI Agents' },
    { href: '/dashboard/whatsapp', label: 'WhatsApp Acquisition' },
    { href: '/dashboard/leads', label: 'Leads & Pipeline' },
    { href: '/dashboard/approvals', label: 'Approvals' },
    { href: '/dashboard/products', label: 'Catalogue' },
    { href: '/dashboard/projects', label: 'Onboarding & Projects' },
    { href: '/dashboard/revenue', label: 'Revenue & Invoices' },
    { href: '/dashboard/settings', label: 'Autonomy & Safety' },
    { href: '/dashboard/audit', label: 'Audit Log' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-20 md:pb-0">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-black flex items-center justify-center text-sm shadow-md shadow-indigo-600/30">
                R
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 tracking-tight text-base">
                  REOZ
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full uppercase tracking-wider">
                  CEO Control Centre
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded-xl transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono hidden sm:inline-block">
              {user.email}
            </span>
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="text-xs font-semibold text-slate-400 hover:text-rose-400 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-rose-500/30 bg-slate-900 transition-colors"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>

        {/* Tablet Secondary Nav Bar */}
        <div className="hidden md:flex lg:hidden overflow-x-auto px-4 py-2 border-t border-slate-800/80 gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1 text-xs font-semibold text-slate-400 hover:text-slate-100 whitespace-nowrap rounded-lg"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>

      {/* Floating AI Orchestrator Command Centre */}
      <AIChatDrawer />

      {/* Mobile Bottom Navigation Bar (iPhone PWA Navigation) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur border-t border-slate-800 md:hidden flex justify-around py-2.5 px-2 safe-area-bottom">
        <Link
          href="/dashboard"
          className="flex flex-col items-center text-indigo-400 text-[10px] font-semibold"
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Overview
        </Link>
        <Link
          href="/dashboard/leads"
          className="flex flex-col items-center text-slate-400 hover:text-slate-100 text-[10px] font-medium"
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Leads
        </Link>
        <Link
          href="/dashboard/approvals"
          className="flex flex-col items-center text-slate-400 hover:text-slate-100 text-[10px] font-medium relative"
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Approvals
        </Link>
        <Link
          href="/dashboard/projects"
          className="flex flex-col items-center text-slate-400 hover:text-slate-100 text-[10px] font-medium"
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Projects
        </Link>
        <Link
          href="/dashboard/revenue"
          className="flex flex-col items-center text-slate-400 hover:text-slate-100 text-[10px] font-medium"
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Revenue
        </Link>
      </nav>
    </div>
  );
}
