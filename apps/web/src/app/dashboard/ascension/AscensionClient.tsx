'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

interface EngineStatus {
  configured?: boolean;
  cloud_connected: boolean;
  total_agent_roles?: number;
  active_agent_slots?: number;
  emergency_stop?: boolean;
  monthly_budget_cents?: number;
  allow_paid_fallback?: boolean;
  orchestrator?: string;
  memory_protocol?: string;
  workflows_active?: string[];
  error?: string;
}

interface DiscoveredProspect {
  organisation_name?: string;
  location?: string;
  category?: string;
  homs_score?: number;
  recommended_package?: string;
  whatsapp_draft?: string;
  website_url?: string | null;
}

interface SyncSummary {
  saved_leads: number;
  skipped_duplicates: number;
  created_approvals: number;
}

interface CampaignDef {
  id: string;
  region: string;
  label: string;
  cities: string;
  objective: string;
}

interface DepartmentSummary {
  key: string;
  name: string;
  role_count: number;
  starter_active_count: number;
  manager_id: string;
}

interface PaperclipStatus {
  configured?: boolean;
  ready?: boolean;
  service?: string;
  adapter_type?: string;
  zero_cost_policy?: { allowPaidFallback?: boolean; monthlyBudgetCents?: number };
  routines_count?: number;
  last_heartbeat_at?: string | null;
  error?: string;
}

const REGIONS: CampaignDef[] = [
  {
    id: 'global',
    region: 'global',
    label: 'All Continents',
    cities: 'London, New York, Singapore, Dubai, Toronto, Sydney',
    objective: 'Discover & qualify colleges and hostels worldwide for ZenLyft HOMS (₹35,000)',
  },
  {
    id: 'north_america',
    region: 'north_america',
    label: 'North America',
    cities: 'New York, Toronto, Austin, Chicago',
    objective: 'Discover & qualify colleges and student housing across North America',
  },
  {
    id: 'europe',
    region: 'europe',
    label: 'Europe & UK',
    cities: 'London, Berlin, Amsterdam, Dublin',
    objective: 'Discover & qualify colleges and hostels across UK & Europe',
  },
  {
    id: 'middle_east',
    region: 'middle_east',
    label: 'Middle East & Africa',
    cities: 'Dubai, Abu Dhabi, Riyadh, Cape Town',
    objective: 'Discover & qualify campuses and institutes across Middle East & Africa',
  },
  {
    id: 'apac',
    region: 'apac',
    label: 'Asia-Pacific & India',
    cities: 'Singapore, Bengaluru, Tokyo, Sydney',
    objective: 'Discover & qualify colleges and hostels across APAC & India',
  },
  {
    id: 'latam',
    region: 'latam',
    label: 'Latin America',
    cities: 'Sao Paulo, Mexico City, Bogota, Santiago',
    objective: 'Discover & qualify educational campuses across Latin America',
  },
];

export default function AscensionClient() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [paperclip, setPaperclip] = useState<PaperclipStatus | null>(null);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<CampaignDef>(REGIONS[0]);
  const [customCity, setCustomCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prospects, setProspects] = useState<DiscoveredProspect[]>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [showTechDetails, setShowTechDetails] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, paperclipRes] = await Promise.all([
        fetch('/api/ascension/status', { cache: 'no-store' }),
        fetch('/api/ascension/paperclip', { cache: 'no-store' }),
      ]);
      const data = await statusRes.json();
      setStatus(data);
      if (Array.isArray(data.departments)) setDepartments(data.departments);
      if (paperclipRes.ok) setPaperclip(await paperclipRes.json());
    } catch {
      setStatus({ cloud_connected: false, error: 'Unable to reach discovery engine' });
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleFindClients() {
    setBusy(true);
    setErrorMsg(null);
    setMessage(null);
    setSyncSummary(null);

    const targetLabel = customCity.trim() || selectedRegion.label;
    const objective = customCity.trim()
      ? `Discover & qualify colleges and hostels in ${customCity.trim()} for ZenLyft HOMS (₹35,000)`
      : selectedRegion.objective;

    try {
      const res = await fetch('/api/ascension/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          region: customCity.trim() || selectedRegion.region,
          objective,
          product: 'HOMS',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || data.detail || 'Could not complete search. Please try again.');
      } else {
        const list: DiscoveredProspect[] = Array.isArray(data.qualified_leads)
          ? data.qualified_leads
          : [];
        setProspects(list);
        const sync: SyncSummary | null = data.crm_sync || null;
        setSyncSummary(sync);
        setMessage(
          `Found ${list.length} real prospect${list.length === 1 ? '' : 's'} for ${targetLabel}` +
            (sync
              ? ` — ${sync.saved_leads} added to Leads & ${sync.created_approvals} ready in Approvals.`
              : '.')
        );
      }
      await loadStatus();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleKillSwitch() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ascension/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'kill_switch',
          engaged: !status?.emergency_stop,
          reason: 'Founder toggle from Global Client Finder',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to toggle pause switch');
      }
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  const isPaused = Boolean(status?.emergency_stop);
  const isReady = Boolean(status?.cloud_connected);

  return (
    <div className="space-y-6">
      {/* Main Finder Card */}
      <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5DDD0] pb-5">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                  isReady
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isReady ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'
                  }`}
                />
                {isReady ? 'Auto-Finder Ready' : 'Waking Engine...'}
              </span>
              <span className="rounded-full bg-[#FFF0E6] border border-[#FDBA74] px-3 py-1 text-xs font-bold text-[#C2410C]">
                ₹0 Cloud Spend Lock
              </span>
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-[#11100E]">
              Global Client Finder
            </h1>
            <p className="mt-1 text-sm text-[#5A554C]">
              Pick a region or enter any city worldwide. AI finds real institutions, qualifies fit, and queues WhatsApp drafts for your 1-tap approval.
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={toggleKillSwitch}
            className={`self-start sm:self-auto px-4 py-2 rounded-xl text-xs font-bold border transition ${
              isPaused
                ? 'bg-emerald-700 hover:bg-emerald-600 text-[#FAF6EE] border-emerald-800'
                : 'bg-[#FFFDF9] hover:bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {isPaused ? 'Resume Auto-Finder' : 'Pause All Automation'}
          </button>
        </div>

        {/* Region Selector Pills */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[#7C756A]">
            1. Choose Target Region
          </div>
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((r) => {
              const active = !customCity.trim() && selectedRegion.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCustomCity('');
                    setSelectedRegion(r);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition border ${
                    active
                      ? 'bg-[#11100E] border-[#EA580C] text-[#FAF6EE] shadow-sm'
                      : 'bg-[#FAF6EE] border-[#DDD4C4] text-[#5A554C] hover:bg-[#EFE7DA] hover:text-[#11100E]'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[#7C756A]">
            Target hubs: <span className="font-semibold text-[#11100E]">{selectedRegion.cities}</span>
          </p>
        </div>

        {/* Custom City + 1-Tap Launch CTA */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <input
            type="text"
            value={customCity}
            onChange={(e) => setCustomCity(e.target.value)}
            placeholder="Or type any city (e.g. Tokyo, Melbourne, Mumbai, Paris)..."
            className="flex-1 px-4 py-3 rounded-xl bg-[#FAF6EE] border border-[#DDD4C4] text-sm text-[#11100E] placeholder-[#7C756A] focus:outline-none focus:border-[#EA580C]"
          />
          <button
            type="button"
            disabled={busy || isPaused}
            onClick={handleFindClients}
            className="px-7 py-3.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] disabled:opacity-50 text-sm font-bold text-[#FAF6EE] shadow-md transition whitespace-nowrap flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-[#FAF6EE]/30 border-t-[#FAF6EE] animate-spin" />
                Finding Clients...
              </>
            ) : (
              'Find Clients Now'
            )}
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-medium">
            {errorMsg}
          </div>
        )}

        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="font-semibold">{message}</span>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/dashboard/leads"
                className="px-3 py-1.5 rounded-lg bg-[#FFFDF9] hover:bg-[#EFE7DA] border border-[#DDD4C4] text-[#11100E] font-bold"
              >
                Open Leads &rarr;
              </Link>
              <Link
                href="/dashboard/approvals"
                className="px-3 py-1.5 rounded-lg bg-[#11100E] hover:bg-[#272420] text-[#FAF6EE] font-bold"
              >
                Review & Approve &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Results Stream */}
      {prospects.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#11100E]">
              Found Prospects ({prospects.length})
            </h2>
            {syncSummary && (
              <span className="text-xs text-[#5A554C]">
                {syncSummary.saved_leads} saved • {syncSummary.skipped_duplicates} already in CRM •{' '}
                {syncSummary.created_approvals} queued for approval
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prospects.map((p, idx) => (
              <div
                key={`${p.organisation_name || 'lead'}-${idx}`}
                className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#11100E]">
                      {p.organisation_name || 'Verified Prospect'}
                    </h3>
                    <p className="text-xs text-[#5A554C] mt-0.5">
                      {p.location || 'Global'} • {p.category || 'Institution'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#EA580C] px-2.5 py-0.5 text-xs font-bold text-[#FAF6EE]">
                    Score {p.homs_score ?? '—'}/100
                  </span>
                </div>

                {p.whatsapp_draft && (
                  <p className="rounded-xl bg-[#FAF6EE] border border-[#E5DDD0] p-3 text-xs text-[#5A554C] leading-relaxed">
                    “{p.whatsapp_draft}”
                  </p>
                )}

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[#C2410C] font-bold">
                    {p.recommended_package || 'ZenLyft HOMS'}
                  </span>
                  <Link
                    href="/dashboard/approvals"
                    className="font-bold text-[#11100E] underline underline-offset-4 hover:text-[#EA580C]"
                  >
                    Approve & Send WhatsApp &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Technical Drawer */}
      <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTechDetails((prev) => !prev)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-bold text-[#5A554C] hover:text-[#11100E] transition"
        >
          <span>System & Engine Telemetry</span>
          <span>{showTechDetails ? 'Hide Details ▲' : 'Show Details ▼'}</span>
        </button>

        {showTechDetails && (
          <div className="px-5 pb-5 pt-2 border-t border-[#E5DDD0] space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-[#FAF6EE] border border-[#E5DDD0] p-3">
                <div className="text-[#7C756A]">Active Agent Slots</div>
                <div className="text-base font-black text-[#11100E] mt-1">
                  {status?.active_agent_slots ?? 5} / 5 (of {status?.total_agent_roles ?? 59})
                </div>
              </div>
              <div className="rounded-xl bg-[#FAF6EE] border border-[#E5DDD0] p-3">
                <div className="text-[#7C756A]">Spend Lock</div>
                <div className="text-base font-black text-emerald-800 mt-1">
                  ₹0 ($0.0000)
                </div>
              </div>
              <div className="rounded-xl bg-[#FAF6EE] border border-[#E5DDD0] p-3">
                <div className="text-[#7C756A]">Paperclip Scheduler</div>
                <div className="text-base font-black text-[#11100E] mt-1">
                  {paperclip?.ready ? 'READY' : 'Standby'} ({paperclip?.routines_count ?? 6})
                </div>
              </div>
              <div className="rounded-xl bg-[#FAF6EE] border border-[#E5DDD0] p-3">
                <div className="text-[#7C756A]">Engine Stack</div>
                <div className="text-xs font-bold text-[#11100E] mt-1">
                  {status?.orchestrator || 'LangGraph + CrewAI'}
                </div>
              </div>
            </div>

            {departments.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {departments.map((d) => (
                  <div
                    key={d.key}
                    className="rounded-lg bg-[#FAF6EE] border border-[#E5DDD0] px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="text-[#11100E] font-semibold">{d.name}</span>
                    <span className="text-[#7C756A] font-mono">{d.role_count} roles</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
