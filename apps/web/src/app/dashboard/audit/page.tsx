import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const supabase = createClient();
  const { data: logs, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Security & Activity Audit Log
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Tamper-evident, immutable event log tracking all authentication, founder approvals, agent task runs, and external WhatsApp dispatches.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-400">
          Failed to load audit logs: {error.message}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Object</th>
                  <th className="py-2.5 px-3">Result</th>
                  <th className="py-2.5 px-3">Details / Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300 font-mono">
                {logs && logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-800/30 transition text-[11px]">
                      <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                        {log.timestamp
                          ? `${new Date(log.timestamp).toISOString().replace('T', ' ').slice(0, 19)} UTC`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-zinc-100">{log.action}</td>
                      <td className="py-2.5 px-3 text-zinc-400">
                        <span className="capitalize">{log.actor_type}</span>: {String(log.actor_id || '')}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400">
                        {log.object_type}:{String(log.object_id || '').slice(0, 12)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            log.result === 'success'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {log.result}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[10px] text-zinc-500 max-w-xs truncate">
                        {JSON.stringify(log.metadata_without_secrets ?? {})}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">
                      No audit events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

