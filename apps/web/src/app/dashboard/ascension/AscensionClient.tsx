'use client';

import { useCallback, useEffect, useState } from 'react';

interface DepartmentMeta {
  id: string;
  name: string;
  managerAgentId: string;
  targetHeadcount: number;
  initialActive: number;
}

interface ProviderInfo {
  name: string;
  default_model: string;
  configured: boolean;
  is_paid: boolean;
  allowed_now: boolean;
}

interface AscensionStatusPayload {
  connectionStatus: 'CONNECTED' | 'OFFLINE' | 'NOT_CONFIGURED';
  error?: string;
  health?: {
    environment?: string;
    allow_paid_fallback?: boolean;
    kill_switch?: { engaged: boolean; reason?: string };
    workforce?: { total_roles: number; active_count: number; max_concurrent_active: number };
    orchester?: { mode: string; flow_execution_delegated_to: string };
    providers?: ProviderInfo[];
  };
  registry?: {
    agents?: Array<{
      agent_id: string;
      code: string;
      name: string;
      department: string;
      tier: string;
      reports_to: string;
      preferred_provider: string;
      model: string;
      active: boolean;
      completed_tasks: number;
    }>;
  };
  metrics?: {
    tasks?: Array<{
      task_id: string;
      description: string;
      status: string;
      assigned_agent: string;
    }>;
    token_ledger?: {
      tokens_by_provider?: Record<string, number>;
      total_cost_usd?: number;
    };
  };
  memoryFacts?: Array<{
    fact_id: string;
    scope: string;
    subject: string;
    content: string;
    classification: string;
    provenance_source: string;
    confidence: number;
  }>;
  architecture?: {
    orchestrator: string;
    workforce: string;
    memory_protocol: string;
    automation: string;
    departments: DepartmentMeta[];
    total_roles: number;
  };
}

export default function AscensionClient() {
  const [data, setData] = useState<AscensionStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('Coimbatore');
  const [objective, setObjective] = useState('Discover & qualify colleges and hostels for ZenLyft HOMS (₹35,000)');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastWorkflowResult, setLastWorkflowResult] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ascension/status', { cache: 'no-store' });
      const json = await res.json();
      setData(json);
    } catch {
      setActionMessage('Failed to load Ascension status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function runWorkflow() {
    setActionMessage('Triggering LangGraph + CrewAI workflow...');
    try {
      const res = await fetch('/api/ascension/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', city, objective, limit: 5 }),
      });
      const json = await res.json();
      setLastWorkflowResult(json);
      if (!res.ok) {
        setActionMessage(`Backend notice: ${json.error || json.detail || 'Error'}`);
      } else {
        setActionMessage(`Workflow ${json.thread_id}: ${json.status}`);
        refresh();
      }
    } catch {
      setActionMessage('Network error triggering workflow.');
    }
  }

  async function toggleKillSwitch(engaged: boolean) {
    try {
      const res = await fetch('/api/ascension/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'kill_switch',
          engaged,
          reason: engaged ? 'Founder engaged global emergency shutdown' : 'Founder cleared kill switch',
        }),
      });
      const json = await res.json();
      setActionMessage(json.error ? json.error : `Kill switch is now ${engaged ? 'ENGAGED' : 'CLEAR'}.`);
      refresh();
    } catch {
      setActionMessage('Unable to update kill switch.');
    }
  }

  const conn = data?.connectionStatus || 'NOT_CONFIGURED';
  const killEngaged = Boolean(data?.health?.kill_switch?.engaged);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">ZenLyft Ascension — 59-Agent Cloud HQ</h1>
          <p className="text-sm text-slate-400">
            LangGraph Control Plane • CrewAI Specialist Teams • Orchester Memory Protocol • n8n &amp; G.E.N.I. Gateway (₹0 Cloud Architecture)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              conn === 'CONNECTED'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                : conn === 'OFFLINE'
                  ? 'bg-rose-950 text-rose-300 border border-rose-700'
                  : 'bg-amber-950 text-amber-300 border border-amber-700'
            }`}
          >
            Cloud Backend: {conn}
          </span>
          <button
            onClick={() => toggleKillSwitch(!killEngaged)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              killEngaged ? 'bg-emerald-600 text-white' : 'bg-rose-700 text-white hover:bg-rose-600'
            }`}
          >
            {killEngaged ? 'Release Kill Switch' : 'Emergency Kill Switch'}
          </button>
        </div>
      </div>

      {data?.error && (
        <div className="rounded-xl border border-amber-800/70 bg-amber-950/30 p-4 text-sm text-amber-200">
          <strong>Runtime Notice ({conn}):</strong> {data.error}
        </div>
      )}

      {actionMessage && (
        <div className="rounded-lg border border-indigo-800 bg-indigo-950/40 px-4 py-2 text-sm text-indigo-200">
          {actionMessage}
        </div>
      )}

      {/* Architecture Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Total Workforce Roles</div>
          <div className="text-2xl font-bold text-white mt-1">
            {data?.health?.workforce?.total_roles ?? data?.architecture?.total_roles ?? 59}
          </div>
          <div className="text-xs text-slate-400 mt-1">Across 9 organized departments</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Active Cloud Slots</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {data?.health?.workforce ? `${data.health.workforce.active_count} / ${data.health.workforce.max_concurrent_active}` : '5 / 5 (Policy)'}
          </div>
          <div className="text-xs text-slate-400 mt-1">Bounded concurrency (never 59 simultaneous)</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Paid Fallback Policy</div>
          <div className="text-2xl font-bold text-sky-400 mt-1">
            {data?.health?.allow_paid_fallback ? 'ENABLED' : '₹0 STRICT LOCK'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Cloud Spend: ${(data?.metrics?.token_ledger?.total_cost_usd ?? 0).toFixed(4)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Orchester / Memory</div>
          <div className="text-lg font-bold text-violet-300 mt-1">
            {data?.health?.orchester?.mode || 'embedded_protocol_adapter'}
          </div>
          <div className="text-xs text-slate-400 mt-1">Flow Control: LangGraph</div>
        </div>
      </div>

      {/* Launch Controlled LangGraph + CrewAI Pipeline */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white">Launch LangGraph + CrewAI HOMS Acquisition Pipeline</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Target Indian City (e.g. Coimbatore)"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Founder Objective"
            className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={runWorkflow}
            disabled={conn !== 'CONNECTED'}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Run 5-Agent Controlled Pipeline
          </button>
          <button
            onClick={refresh}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            {loading ? 'Refreshing...' : 'Refresh Telemetry'}
          </button>
        </div>

        {lastWorkflowResult && (
          <pre className="rounded-lg bg-slate-950 p-3 text-xs text-emerald-300 overflow-x-auto">
            {JSON.stringify(lastWorkflowResult, null, 2)}
          </pre>
        )}
      </div>

      {/* 9 Departments Org Overview */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Department Architecture (59 Logical Roles)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(data?.architecture?.departments || []).map((dept) => (
            <div key={dept.id} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-100 text-sm">{dept.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {dept.targetHeadcount} roles
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Manager: <code>{dept.managerAgentId}</code> • Starter Active: {dept.initialActive}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Provenance Memory Inspector */}
      {data?.memoryFacts && data.memoryFacts.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold text-white mb-3">Shared Memory Inspector (Provenance &amp; RBAC)</h2>
          <div className="space-y-2">
            {data.memoryFacts.map((fact) => (
              <div key={fact.fact_id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>
                    <strong className="text-indigo-300">[{fact.scope}]</strong> {fact.subject}
                  </span>
                  <span>
                    {fact.classification} • {Math.round((fact.confidence || 0) * 100)}% • src: {fact.provenance_source}
                  </span>
                </div>
                <p className="text-slate-200">{fact.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

