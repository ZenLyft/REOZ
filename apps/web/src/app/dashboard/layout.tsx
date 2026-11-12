import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AIChatDrawer } from '@/components/AIChatDrawer';
import { DesktopNavLinks, MobileBottomNav } from '@/components/DashboardNav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#11100E] flex flex-col pb-20 lg:pb-0">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#FAF6EE]/95 backdrop-blur-md border-b border-[#E5DDD0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#11100E] text-[#FAF6EE] font-black text-sm flex items-center justify-center shadow-sm tracking-tight border-b-2 border-[#EA580C]">
              R
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-[#11100E] tracking-tight text-sm sm:text-base">
                REOZ
              </span>
              <span className="hidden xl:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FFF0E6] text-[#C2410C] border border-[#FDBA74]">
                ZenLyft HQ
              </span>
            </div>
          </Link>

          {/* Desktop Condensed Working Tabs */}
          <DesktopNavLinks />

          {/* User Badge & Sign Out */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs font-medium text-[#5A554C]">
              {user?.email}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-xs font-semibold text-[#11100E] bg-[#FFFDF9] hover:bg-[#EFE7DA] px-3 py-1.5 rounded-lg border border-[#DDD4C4] transition-colors whitespace-nowrap"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9">
        {children}
      </main>

      {/* Live AI Orchestrator Drawer */}
      <AIChatDrawer />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
