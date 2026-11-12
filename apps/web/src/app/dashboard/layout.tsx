import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { DesktopNavLinks, MobileBottomNav } from '@/components/DashboardNav';
import { PwaPushControl } from '@/components/PwaPushControl';

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
    <div className="min-h-[100dvh] bg-[#F5F6F8] text-[#151B2B] flex flex-col pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
      {/* Top Navigation Bar with iPhone Safe-Area Support */}
      <header className="sticky top-0 z-40 bg-[#F5F6F8]/95 backdrop-blur-md border-b border-[#E4E7EC] pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#151B2B] text-[#F5F6F8] font-black text-sm flex items-center justify-center shadow-sm tracking-tight border-b-2 border-[#FF6B35]">
              R
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-[#151B2B] tracking-tight text-sm sm:text-base">
                REOZ
              </span>
              <span className="hidden xl:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FFF1EC] text-[#E05220] border border-[#FFCBB8]">
                ZenLyft HQ
              </span>
            </div>
          </Link>

          {/* Desktop Condensed Working Tabs */}
          <DesktopNavLinks />

          {/* User Badge, iPhone Alerts & Sign Out */}
          <div className="flex items-center gap-2.5 shrink-0">
            <PwaPushControl />
            <span className="hidden sm:inline text-xs font-medium text-[#525A6B]">
              {user?.email}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-xs font-semibold text-[#151B2B] bg-[#FFFFFF] hover:bg-[#ECEFF3] px-3 py-1.5 rounded-lg border border-[#D0D5DD] transition-colors whitespace-nowrap"
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

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
