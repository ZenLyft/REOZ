import { createClient } from '@/lib/supabase/server';
import type { AuditLogEntry } from '@/lib/types/database';

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

  // Fetch settings for global pause status
  let isPaused = false;
  try {
    const { data: settingData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'global_pause')
      .single();
    if (settingData?.value?.paused) {
      isPaused = true;
    }
  } catch {
    // If settings table not seeded yet, fallback to false
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            System Live • Zero Budget Mode
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Welcome back, {user?.email?.split('@')[0] || 'Founder'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            ZenLyft Revenue Engine • Pipeline & Lead Intelligence Control Panel
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
            isPaused
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'
          }`}>
            Automation: {isPaused ? 'PAUSED' : 'ACTIVE'}
          </div>
        </div>
      </div>

      {/* KPI / Pipeline Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Discovered Leads
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">0</div>
          <div className="text-xs text-slate-400 mt-1">Local businesses & institutions</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Qualified (Score &gt; 60)
          </div>
          <div className="text-2xl font-bold text-sky-600 mt-2">0</div>
          <div className="text-xs text-slate-400 mt-1">Ready for research brief</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Pending Approvals
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-2">0</div>
          <div className="text-xs text-slate-400 mt-1">Outreach & proposal drafts</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Won Deals
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">0</div>
          <div className="text-xs text-slate-400 mt-1">₹0 cash collected</div>
        </div>
      </div>

      {/* Human in the loop guarantee card */}
      <div className="bg-gradient-to-r from-sky-50 to-indigo-50 rounded-2xl p-5 border border-sky-100 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-sm">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Autonomous Safety Safeguard Active
          </h3>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            AI agents can only research, score, and draft proposals. No message, email, WhatsApp, or price can ever be issued without your explicit, tamper-checked cryptographic approval.
          </p>
        </div>
      </div>

      {/* Audit Log Stream */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Security & Activity Audit Log</h3>
            <p className="text-xs text-slate-500 mt-0.5">Immutable record of logins, changes, and agent actions</p>
          </div>
          <span className="text-xs font-medium text-slate-400">Latest records</span>
        </div>

        <div className="divide-y divide-slate-100">
          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              No audit events recorded yet. Authentication events and database operations will appear here.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {log.action}
                    </span>
                    <span className="text-xs text-slate-400">by {log.actor_type}:{log.actor_id}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Object: {log.object_type} ({log.object_id})
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${
                    log.result === 'success'
                      ? 'bg-emerald-50 text-emerald-700'
                      : log.result === 'blocked'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-rose-50 text-rose-700'
                  }`}>
                    {log.result}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-1">
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
