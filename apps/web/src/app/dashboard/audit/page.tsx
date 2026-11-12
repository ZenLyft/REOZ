import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  const supabase = createClient();

  const { data: logs, error } = await supabase
    .from('audit_log')
    .select('id, actor_type, actor_id, action, object_type, object_id, timestamp, result, metadata_without_secrets')
    .order('timestamp', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E5DDD0] pb-5">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#11100E]">
          Security & Activity Audit Log
        </h1>
        <p className="mt-1 text-sm text-[#5A554C]">
          Immutable record tracking founder approvals, agent runs, client onboarding, and verified payments.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load audit logs: {error.message}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DDD0] bg-[#FAF6EE] text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Actor</th>
                  <th className="py-3.5 px-4">Target</th>
                  <th className="py-3.5 px-4">Outcome</th>
                  <th className="py-3.5 px-4">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE7DA] text-[#11100E] font-mono">
                {!logs || logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#7C756A] font-sans">
                      No audit events logged yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#FAF6EE] transition">
                      <td className="py-3 px-4 text-[#5A554C] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#11100E]">{log.action}</td>
                      <td className="py-3 px-4 text-[#5A554C]">
                        <span className="text-[#8C6A3B]">{log.actor_type}</span>: {log.actor_id}
                      </td>
                      <td className="py-3 px-4 text-[#5A554C]">
                        {log.object_type}:{String(log.object_id || '').slice(0, 14)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            log.result === 'success'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : log.result === 'blocked'
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : 'border-red-200 bg-red-50 text-red-800'
                          }`}
                        >
                          {log.result}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-[#7C756A] max-w-xs truncate">
                        {log.metadata_without_secrets
                          ? JSON.stringify(log.metadata_without_secrets)
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
