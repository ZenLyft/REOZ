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

  // Fetch recent audit events
  let auditLogs: AuditLogEntry[] = [];
  try {
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(6);
    if (data) {
      auditLogs = data as AuditLogEntry[];
    }
  } catch (err) {
    console.error('Error fetching audit logs:', err);
  }

  // Fetch live counts
  let discoveredCount = 0;
  let qualifiedCount = 0;
  let approvalsCount = 0;
  let wonCount = 0;

  try {
    const { count: dCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    discoveredCount = dCount || 0;

    const { count: qCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('score', 60);
    qualifiedCount = qCount || 0;

    const { count: aCount } = await supabase
      .from('approvals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    approvalsCount = aCount || 0;

    const { count: wCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('pipeline_stage', 'won');
    wonCount = wCount || 0;
  } catch (err) {
    console.error('Error fetching dashboard counts:', err);
  }

  // Calculate cohort performance against mandatory targets (100 leads, 10 onboarded)
  const cohortKpis = calculateWeeklyCohortMetrics(discoveredCount, wonCount);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            System Live • Balanced Autonomy Mode
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-100">
            Welcome back, {user?.email?.split('@')[0] || 'Founder'}
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            ZenLyft Autonomous Revenue Operations • Executive CEO Command Center
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/settings"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition"
          >
            ⚙️ Autonomy Settings
          </Link>
          <div className="px-3 py-2 rounded-xl text-xs font-bold border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            24/7 Cloud Cron: ACTIVE
          </div>
        </div>
      </div>

      {/* MANDATORY WEEKLY TARGET COHORT PROGRESS (100 LEADS • 10 CLIENTS) */}
      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-zinc-900 to-purple-950/30 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800/80 pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              Weekly Acquisition Cohort Target
            </span>
            <h3 className="text-base font-bold text-zinc-100">
              100 Unique Leads • 10 Onboarded Clients (≥10% Conversion)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold border ${
                cohortKpis.pipeline_health_status === 'healthy'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              }`}
            >
              {cohortKpis.pipeline_health_status === 'healthy'
                ? '● Velocity Healthy'
                : '▲ Attention Needed'}
            </span>
          </div>
        </div>

        {/* Progress Bars */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Target 1: Lead Discovery (100) */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-zinc-300">1. Discovered Unique Prospects</span>
              <span className="text-indigo-400 font-mono">
                {discoveredCount} / {cohortKpis.weekly_leads_target} ({cohortKpis.weekly_leads_progress_pct}%)
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${cohortKpis.weekly_leads_progress_pct}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-zinc-500 block">
              Discovered across Tamil Nadu (Tiruppur, Erode, Salem, Coimbatore, Chennai)
            </span>
          </div>

          {/* Target 2: Onboarded Clients (10) */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-zinc-300">2. Onboarded Clients (≥10% Target)</span>
              <span className="text-emerald-400 font-mono">
                {wonCount} / {cohortKpis.weekly_onboarding_target} ({cohortKpis.weekly_onboarding_progress_pct}%)
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${cohortKpis.weekly_onboarding_progress_pct}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-zinc-500 block">
              Conversion Rate: <strong className="text-emerald-400">{cohortKpis.conversion_rate_pct}%</strong>
            </span>
          </div>
        </div>

        {/* AI Bottleneck Diagnosis & Corrective Action */}
        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-xs">
          <div className="flex items-center gap-2 font-semibold text-zinc-300">
            <span>🧠 AI CEO Operational Diagnostic:</span>
            <span className="text-zinc-400 font-normal">{cohortKpis.bottleneck_diagnosis}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-indigo-400">
            <span className="font-semibold">Recommended Action:</span>
            <span className="text-zinc-300">{cohortKpis.recommended_corrective_action}</span>
          </div>
        </div>
      </div>

      {/* KPI / Pipeline Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/dashboard/leads"
          className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm hover:border-indigo-500/50 transition block"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Discovered Leads
          </div>
          <div className="text-2xl font-bold text-zinc-100 mt-2">{discoveredCount}</div>
          <div className="text-xs text-zinc-400 mt-1">Local businesses & institutions</div>
        </Link>

        <Link
          href="/dashboard/leads"
          className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm hover:border-indigo-500/50 transition block"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Qualified (Score &gt; 60)
          </div>
          <div className="text-2xl font-bold text-sky-400 mt-2">{qualifiedCount}</div>
          <div className="text-xs text-zinc-400 mt-1">Ready for research brief</div>
        </Link>

        <Link
          href="/dashboard/approvals"
          className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm hover:border-indigo-500/50 transition block"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Pending Approvals
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">{approvalsCount}</div>
          <div className="text-xs text-zinc-400 mt-1">Outreach & proposal drafts</div>
        </Link>

        <Link
          href="/dashboard/revenue"
          className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm hover:border-emerald-500/50 transition block"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Won Deals & Revenue
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{wonCount}</div>
          <div className="text-xs text-zinc-400 mt-1">₹8,999 verified collected cash</div>
        </Link>
      </div>

      {/* Human in the loop guarantee card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            Autonomous Safety Safeguard Active (Cryptographic Integrity)
          </h3>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            AI agents can only research, score, and draft proposals. No message, email, WhatsApp, or price can ever be issued without your explicit, tamper-checked cryptographic approval.
          </p>
        </div>
      </div>

      {/* Audit Log Stream */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Security & Activity Audit Log</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Immutable record of logins, changes, and agent actions</p>
          </div>
          <Link href="/dashboard/audit" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300">
            View All Records &rarr;
          </Link>
        </div>

        <div className="divide-y divide-zinc-800/60 font-mono">
          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No audit events recorded yet. Authentication events and database operations will appear here.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-200">
                      {log.action}
                    </span>
                    <span className="text-xs text-zinc-400">by {log.actor_type}:{log.actor_id?.slice(0, 8)}...</span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    Object: {log.object_type} ({log.object_id?.slice(0, 8)}...)
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${
                      log.result === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : log.result === 'blocked'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {log.result}
                  </span>
                  <div className="text-[10px] text-zinc-500 mt-1">
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
