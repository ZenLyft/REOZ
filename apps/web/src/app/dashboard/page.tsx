import { createClient } from '@/lib/supabase/server';
import type { AuditLogEntry } from '@/lib/types/database';
import { calculateWeeklyCohortMetrics } from '@/lib/crm/acquisition-targets';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let auditLogs: AuditLogEntry[] = [];
  let discoveredCount = 0;
  let qualifiedCount = 0;
  let approvalsCount = 0;
  let wonCount = 0;
  let projectsCount = 0;
  let verifiedCashInr = 0;
  let invoicedTotalInr = 0;
  let autonomyLevel = 1;
  let emergencyStopActive = false;
  let activeMarket = 'Global (Worldwide)';

  try {
    const [
      { data: logs },
      { count: dCount },
      { count: qCount },
      { count: aCount },
      { count: wCount },
      { count: pCount },
      { data: payments },
      { data: invoices },
      { data: settings },
    ] = await Promise.all([
      supabase.from('audit_log').select('*').order('timestamp', { ascending: false }).limit(6),
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }).gte('score', 60),
      supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('pipeline_stage', 'won'),
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('payments').select('amount_received_inr'),
      supabase.from('invoices').select('amount_inr'),
      supabase
        .from('system_settings')
        .select('autonomy_level, emergency_stop_active, active_market_country')
        .eq('id', 'zenlyft-global-settings')
        .maybeSingle(),
    ]);

    if (logs) auditLogs = logs as AuditLogEntry[];
    discoveredCount = dCount || 0;
    qualifiedCount = qCount || 0;
    approvalsCount = aCount || 0;
    wonCount = wCount || 0;
    projectsCount = pCount || 0;
    verifiedCashInr = (payments || []).reduce(
      (sum, row: { amount_received_inr: number | null }) => sum + (row.amount_received_inr || 0),
      0
    );
    invoicedTotalInr = (invoices || []).reduce(
      (sum, row: { amount_inr: number | null }) => sum + (row.amount_inr || 0),
      0
    );
    if (settings) {
      autonomyLevel = settings.autonomy_level ?? 1;
      emergencyStopActive = Boolean(settings.emergency_stop_active);
      activeMarket = settings.active_market_country || 'Global (Worldwide)';
    }
  } catch (err) {
    console.error('Error fetching dashboard metrics:', err);
  }

  const cohortKpis = calculateWeeklyCohortMetrics(discoveredCount, wonCount);

  return (
    <div className="space-y-6">
      {/* Executive Header Card */}
      <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div
            className={`inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold border mb-2.5 ${
              emergencyStopActive
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                emergencyStopActive ? 'bg-red-600' : 'bg-emerald-600 animate-pulse'
              }`}
            />
            {emergencyStopActive
              ? 'Emergency Stop Engaged • Outbound Halted'
              : `Live • Autonomy Level ${autonomyLevel} • ${activeMarket}`}
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#11100E]">
            Welcome back, {user?.email?.split('@')[0] || 'Founder'}
          </h1>
          <p className="text-sm text-[#5A554C] mt-1">
            ZenLyft Global Revenue Operations — Find clients, approve outreach in 1 tap, and track real cash collected.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard/ascension"
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#EA580C] text-[#FAF6EE] hover:bg-[#C2410C] transition shadow-sm"
          >
            Find Clients Worldwide
          </Link>
          <Link
            href="/dashboard/approvals"
            className="px-4 py-2.5 rounded-xl text-xs font-bold border border-[#11100E] bg-[#11100E] text-[#FAF6EE] hover:bg-[#272420] transition"
          >
            Approvals ({approvalsCount})
          </Link>
        </div>
      </div>

      {/* Primary KPI Grid — 100% Live DB Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/dashboard/leads"
          className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm hover:border-[#EA580C] transition block"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
            Discovered Leads
          </div>
          <div className="text-3xl font-black text-[#11100E] mt-2 tabular-nums">
            {discoveredCount}
          </div>
          <div className="text-xs text-[#5A554C] mt-1">
            {qualifiedCount} qualified (score ≥ 60)
          </div>
        </Link>

        <Link
          href="/dashboard/approvals"
          className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm hover:border-[#EA580C] transition block"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
            Pending Approvals
          </div>
          <div className="text-3xl font-black text-[#EA580C] mt-2 tabular-nums">
            {approvalsCount}
          </div>
          <div className="text-xs text-[#5A554C] mt-1">Ready for 1-tap sign-off</div>
        </Link>

        <Link
          href="/dashboard/projects"
          className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm hover:border-[#EA580C] transition block"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
            Active Clients & Won
          </div>
          <div className="text-3xl font-black text-[#11100E] mt-2 tabular-nums">
            {projectsCount}
          </div>
          <div className="text-xs text-[#5A554C] mt-1">
            {wonCount} won CRM deals
          </div>
        </Link>

        <Link
          href="/dashboard/revenue"
          className="rounded-2xl border-2 border-[#EA580C] bg-[#11100E] p-5 shadow-sm hover:bg-[#1E1C18] transition block text-[#FAF6EE]"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#FB923C]">
            Verified Cash Collected
          </div>
          <div className="text-3xl font-black text-[#FAF6EE] mt-2 tabular-nums">
            ₹{verifiedCashInr.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-[#D6CCB9] mt-1">
            ₹{invoicedTotalInr.toLocaleString('en-IN')} invoiced total
          </div>
        </Link>
      </div>

      {/* 30-Day Revenue Cohort Velocity */}
      <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#E5DDD0] pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#EA580C]">
              Acquisition Velocity Target
            </span>
            <h2 className="text-base font-bold text-[#11100E]">
              {cohortKpis.weekly_leads_target} Unique Leads • {cohortKpis.weekly_onboarding_target} Onboarded Clients (≥10% Conversion)
            </h2>
          </div>
          <span
            className={`self-start sm:self-auto rounded-full px-3 py-1 text-xs font-bold border ${
              cohortKpis.pipeline_health_status === 'healthy'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {cohortKpis.pipeline_health_status === 'healthy' ? 'Velocity Healthy' : 'Push Outreach & Close'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-[#11100E]">1. Discovered Global Prospects</span>
              <span className="font-mono text-[#11100E]">
                {discoveredCount} / {cohortKpis.weekly_leads_target} ({cohortKpis.weekly_leads_progress_pct}%)
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[#EFE7DA] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#EA580C] transition-all duration-500"
                style={{ width: `${cohortKpis.weekly_leads_progress_pct}%` }}
              />
            </div>
            <span className="text-[11px] text-[#7C756A] block">
              Live verified colleges, hostels & SMEs across Americas, Europe, MEA & APAC
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-[#11100E]">2. Onboarded Paying Clients</span>
              <span className="font-mono text-emerald-800">
                {wonCount} / {cohortKpis.weekly_onboarding_target} ({cohortKpis.weekly_onboarding_progress_pct}%)
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[#EFE7DA] overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-700 transition-all duration-500"
                style={{ width: `${cohortKpis.weekly_onboarding_progress_pct}%` }}
              />
            </div>
            <span className="text-[11px] text-[#7C756A] block">
              Conversion Rate: <strong className="text-[#11100E]">{cohortKpis.conversion_rate_pct}%</strong>
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-4 text-xs space-y-1">
          <div>
            <span className="font-bold text-[#11100E]">Live Diagnostic: </span>
            <span className="text-[#5A554C]">{cohortKpis.bottleneck_diagnosis}</span>
          </div>
          <div>
            <span className="font-bold text-[#EA580C]">Recommended Action: </span>
            <span className="text-[#11100E]">{cohortKpis.recommended_corrective_action}</span>
          </div>
        </div>
      </div>

      {/* Zero-Trust Safeguard + Quick Revenue Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#11100E] text-[#FAF6EE] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#11100E]">
              ₹0 Strict Guardrail & Cryptographic Approval Lock
            </h3>
            <p className="text-xs text-[#5A554C] mt-1 leading-relaxed">
              Discovery & drafting run on zero cloud LLM spend. Every outbound WhatsApp pitch is SHA-256 hashed and held until your 1-tap founder approval.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 flex flex-col justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#11100E]">Revenue Closing Shortcuts</h3>
            <p className="text-xs text-[#5A554C] mt-0.5">
              Move fast from discovery to signed contracts and collected payments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/projects"
              className="rounded-xl bg-[#F4EEE3] border border-[#DDD4C4] px-3 py-1.5 text-xs font-semibold text-[#11100E] hover:bg-[#EAE1D2]"
            >
              + Onboard Client
            </Link>
            <Link
              href="/dashboard/revenue"
              className="rounded-xl bg-[#F4EEE3] border border-[#DDD4C4] px-3 py-1.5 text-xs font-semibold text-[#11100E] hover:bg-[#EAE1D2]"
            >
              + Issue Invoice / Record Cash
            </Link>
            <Link
              href="/dashboard/products"
              className="rounded-xl bg-[#F4EEE3] border border-[#DDD4C4] px-3 py-1.5 text-xs font-semibold text-[#11100E] hover:bg-[#EAE1D2]"
            >
              Pricing Catalogue
            </Link>
          </div>
        </div>
      </div>

      {/* Live Audit Stream */}
      <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-[#E5DDD0] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#11100E]">Security & Activity Audit Log</h3>
            <p className="text-xs text-[#5A554C] mt-0.5">
              Immutable trail of logins, approvals, client onboarding, and verified payments
            </p>
          </div>
          <Link
            href="/dashboard/audit"
            className="text-xs font-bold text-[#11100E] underline underline-offset-4 hover:text-[#EA580C]"
          >
            View All &rarr;
          </Link>
        </div>

        <div className="divide-y divide-[#EFE7DA] font-mono">
          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#7C756A]">
              No audit events recorded yet. Live operations will stream here automatically.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 flex items-center justify-between hover:bg-[#FAF6EE] transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#F2EBE0] text-[#11100E]">
                      {log.action}
                    </span>
                    <span className="text-xs text-[#5A554C]">
                      by {log.actor_type}:{log.actor_id?.slice(0, 12)}
                    </span>
                  </div>
                  <div className="text-xs text-[#7C756A]">
                    Object: {log.object_type} ({log.object_id?.slice(0, 12)})
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded border ${
                      log.result === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : log.result === 'blocked'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-red-50 text-red-800 border-red-200'
                    }`}
                  >
                    {log.result}
                  </span>
                  <div className="text-[10px] text-[#7C756A] mt-1">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
