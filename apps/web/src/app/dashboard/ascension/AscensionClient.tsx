'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';

interface AutopilotMetrics {
  total_leads: number;
  first_cold_sent_count: number;
  pending_founder_permissions_count: number;
}

interface AutopilotSettingsState {
  autonomy_level: number;
  emergency_stop_active: boolean;
  auto_pilot_enabled: boolean;
  auto_send_first_cold: boolean;
  notify_every_event: boolean;
  next_permission_founder_only: boolean;
}

interface ExecutionItem {
  id: string;
  agent_name: string;
  command: string;
  status: string;
  result_summary: string;
  created_at: string;
}

interface NotificationItem {
  id: string;
  category: string;
  title: string;
  body: string;
  url: string;
  created_at: string;
}

interface DepartmentSummary {
  key: string;
  name: string;
  role_count: number;
}

async function parseResponseJson<T = Record<string, unknown>>(res: Response): Promise<T | null> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function AscensionClient() {
  const [settings, setSettings] = useState<AutopilotSettingsState | null>(null);
  const [metrics, setMetrics] = useState<AutopilotMetrics | null>(null);
  const [waSession, setWaSession] = useState<{ status: string; phone?: string } | null>(null);
  const [recentRuns, setRecentRuns] = useState<ExecutionItem[]>([]);
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [busyPause, setBusyPause] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [manualCity, setManualCity] = useState('');
  const autoTriggeredRef = useRef(false);

  const loadAutopilot = useCallback(async () => {
    try {
      const [apRes, notifRes, statusRes] = await Promise.all([
        fetch('/api/autopilot/run', { cache: 'no-store' }),
        fetch('/api/notifications', { cache: 'no-store' }),
        fetch('/api/ascension/status', { cache: 'no-store' }),
      ]);

      const apData = await parseResponseJson<{
        success?: boolean;
        settings?: AutopilotSettingsState;
        metrics?: AutopilotMetrics;
        whatsapp_session?: { status: string; phone?: string };
        recent_runs?: ExecutionItem[];
        error?: string;
      }>(apRes);

      if (apData?.settings) setSettings(apData.settings);
      if (apData?.metrics) setMetrics(apData.metrics);
      if (apData?.whatsapp_session) setWaSession(apData.whatsapp_session);
      if (Array.isArray(apData?.recent_runs)) setRecentRuns(apData.recent_runs);

      const notifData = await parseResponseJson<{ notifications?: NotificationItem[] }>(notifRes);
      if (Array.isArray(notifData?.notifications)) {
        setAlerts(notifData.notifications.slice(0, 6));
      }

      const statusData = await parseResponseJson<{ departments?: DepartmentSummary[] }>(statusRes);
      if (Array.isArray(statusData?.departments)) {
        setDepartments(statusData.departments);
      }

      return apData;
    } catch {
      return null;
    }
  }, []);

  const triggerCycle = useCallback(
    async (cityOverride?: string) => {
      setSyncing(true);
      setErrorMsg(null);
      try {
        const res = await fetch('/api/autopilot/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city: cityOverride?.trim() || undefined,
            limit: 6,
            source: cityOverride ? 'founder_city_override' : 'auto_background_sync',
          }),
        });
        const data = await parseResponseJson<{
          status?: string;
          city?: string;
          discovered_count?: number;
          saved_leads?: number;
          first_cold_auto_sent?: number;
          queued_for_founder?: number;
          reason?: string;
          error?: string;
        }>(res);

        if (!data) {
          setErrorMsg(`Engine returned unexpected status (${res.status}).`);
        } else if (!res.ok) {
          setErrorMsg(data.error || 'Autopilot sweep could not complete.');
        } else if (data.status === 'completed') {
          setBanner(
            `Autopilot synced ${data.city}: ${data.discovered_count ?? 0} found, ${data.saved_leads ?? 0} saved, ${data.first_cold_auto_sent ?? 0} 1st cold WhatsApp sent, ${data.queued_for_founder ?? 0} awaiting action.`
          );
        } else if (data.reason) {
          setBanner(data.reason);
        }
        await loadAutopilot();
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : 'Network error');
      } finally {
        setSyncing(false);
      }
    },
    [loadAutopilot]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await loadAutopilot();
      if (!active || autoTriggeredRef.current) return;
      autoTriggeredRef.current = true;

      const s = data?.settings;
      if (s && s.auto_pilot_enabled && !s.emergency_stop_active) {
        const latestAt = data?.recent_runs?.[0]?.created_at
          ? new Date(data.recent_runs[0].created_at).getTime()
          : 0;
        const staleMs = 90 * 60 * 1000;
        if (!latestAt || Date.now() - latestAt > staleMs) {
          await triggerCycle();
        }
      }
    })();

    const poll = setInterval(() => {
      loadAutopilot();
    }, 30000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [loadAutopilot, triggerCycle]);

  async function toggleEmergencyStop() {
    setBusyPause(true);
    setErrorMsg(null);
    const nextPaused = !settings?.emergency_stop_active;
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergency_stop_active: nextPaused }),
      });
      if (!res.ok) {
        const err = await parseResponseJson<{ error?: string }>(res);
        setErrorMsg(err?.error || 'Failed to update Master Stop');
      } else {
        setBanner(
          nextPaused
            ? 'Automation paused cleanly across all channels.'
            : '24/7 Autopilot resumed cleanly.'
        );
      }
      await loadAutopilot();
    } finally {
      setBusyPause(false);
    }
  }

  const isPaused = Boolean(settings?.emergency_stop_active);
  const autoColdOn = Boolean(settings?.auto_send_first_cold ?? true) && !isPaused;
  const waReady = waSession?.status === 'ready' || waSession?.status === 'authenticated';

  return (
    <div className="space-y-6">
      {/* Main Hands-Free Autopilot Control Header */}
      <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E4E7EC] pb-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                  !isPaused
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    !isPaused ? 'bg-emerald-600 animate-pulse' : 'bg-red-600'
                  }`}
                />
                {!isPaused ? '24/7 Autopilot Running (No Clicks Needed)' : 'Automation Paused'}
              </span>

              <span className="rounded-full bg-[#FFF1EC] border border-[#FFCBB8] px-3 py-1 text-xs font-bold text-[#E05220]">
                1st Cold WhatsApp: {autoColdOn ? 'AUTO-SEND ON' : 'PAUSED'}
              </span>

              <span className="rounded-full bg-[#ECEFF3] border border-[#D0D5DD] px-3 py-1 text-xs font-bold text-[#151B2B]">
                Next Permission: Founder Access Only
              </span>
            </div>

            <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-[#151B2B]">
              Autonomous Client & Outreach Engine
            </h1>
            <p className="mt-1 text-sm text-[#525A6B]">
              Runs every 2 hours worldwide automatically. Discovers prospects, dispatches 1st cold WhatsApp pitches autonomously, pushes every event to your iPhone PWA, and holds all follow-ups & replies for your Founder permission.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              disabled={busyPause}
              onClick={toggleEmergencyStop}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                isPaused
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-[#F5F6F8] border-emerald-800'
                  : 'bg-[#FFFFFF] hover:bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {isPaused ? 'Resume Autopilot' : 'Pause Autopilot'}
            </button>
          </div>
        </div>

        {/* 4 Key Autonomous Telemetry KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/dashboard/leads"
            className="rounded-2xl border border-[#E4E7EC] bg-[#F5F6F8] p-4 hover:border-[#FF6B35] transition block"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
              Global Prospects Found
            </div>
            <div className="mt-1.5 text-2xl font-black text-[#151B2B] tabular-nums">
              {metrics?.total_leads ?? 0}
            </div>
            <div className="text-xs text-[#525A6B] mt-0.5">Synced continuously</div>
          </Link>

          <Link
            href="/dashboard/whatsapp"
            className="rounded-2xl border border-[#E4E7EC] bg-[#F5F6F8] p-4 hover:border-[#FF6B35] transition block"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#E05220]">
              1st Cold Auto-Sent
            </div>
            <div className="mt-1.5 text-2xl font-black text-[#FF6B35] tabular-nums">
              {metrics?.first_cold_sent_count ?? 0}
            </div>
            <div className="text-xs text-[#525A6B] mt-0.5">Dispatched autonomously</div>
          </Link>

          <Link
            href="/dashboard/approvals"
            className="rounded-2xl border-2 border-[#FF6B35] bg-[#151B2B] p-4 text-[#F5F6F8] hover:bg-[#2B313C] transition block"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#FF8A5B]">
              Next Permission Queue
            </div>
            <div className="mt-1.5 text-2xl font-black tabular-nums">
              {metrics?.pending_founder_permissions_count ?? 0}
            </div>
            <div className="text-xs text-[#CBD5E1] mt-0.5">Awaiting Founder 1-tap access &rarr;</div>
          </Link>

          <Link
            href="/dashboard/whatsapp"
            className="rounded-2xl border border-[#E4E7EC] bg-[#F5F6F8] p-4 hover:border-[#FF6B35] transition block"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
              WhatsApp Gateway
            </div>
            <div className="mt-1.5 text-sm font-black uppercase text-[#151B2B]">
              {waReady ? 'Connected & Active' : waSession?.status || 'Disconnected'}
            </div>
            <div className="text-xs text-[#525A6B] mt-1">
              {waReady ? 'Sending +91 80159 29139 live' : 'Tap to link OpenWA QR →'}
            </div>
          </Link>
        </div>

        {syncing && (
          <div className="rounded-xl border border-[#FFCBB8] bg-[#FFF1EC] px-4 py-3 text-xs font-semibold text-[#E05220] flex items-center gap-2.5">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-[#FF6B35]/30 border-t-[#FF6B35] animate-spin" />
            Running automatic global discovery, 1st cold outreach check & iPhone alert sync...
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-medium">
            {errorMsg}
          </div>
        )}

        {banner && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 font-semibold flex items-center justify-between gap-3">
            <span>{banner}</span>
            <Link
              href="/dashboard/approvals"
              className="shrink-0 rounded-lg bg-[#151B2B] px-3 py-1.5 text-[11px] font-bold text-[#F5F6F8] hover:bg-[#2B313C]"
            >
              Open Approvals &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* Two-Column Real-Time Autopilot Stream + iPhone PWA Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E4E7EC] pb-3">
            <div>
              <h2 className="text-base font-bold text-[#151B2B]">Recent Autonomous Cycles</h2>
              <p className="text-xs text-[#667085]">Automatic scheduled sweeps & outreach runs</p>
            </div>
            <span className="text-[11px] font-bold text-[#FF6B35] uppercase">Auto Every 2h</span>
          </div>

          {recentRuns.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#667085]">
              Waiting for first automated cycle result.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentRuns.map((run) => (
                <div
                  key={run.id}
                  className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#151B2B]">{run.command}</span>
                    <span className="text-[10px] text-[#667085]">
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[#525A6B]">{run.result_summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E4E7EC] pb-3">
            <div>
              <h2 className="text-base font-bold text-[#151B2B]">iPhone PWA Alert Stream</h2>
              <p className="text-xs text-[#667085]">Every single event pushed directly to you</p>
            </div>
            <Link
              href="/dashboard/settings"
              className="text-xs font-bold text-[#FF6B35] hover:text-[#E05220]"
            >
              Configure PWA &rarr;
            </Link>
          </div>

          {alerts.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#667085]">
              Tap the Alerts bell at the top right to pair your iPhone PWA for lock-screen push notifications.
            </div>
          ) : (
            <div className="space-y-2.5">
              {alerts.map((n) => (
                <Link
                  key={n.id}
                  href={n.url || '/dashboard/approvals'}
                  className="block rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3.5 text-xs hover:border-[#FF6B35] transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#151B2B]">{n.title}</span>
                    <span className="text-[10px] uppercase font-bold text-[#E05220]">
                      {n.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-[#525A6B] mt-0.5">{n.body}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Optional Collapsed Manual City Targeting (Zero Required Clicks) */}
      <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowManualOverride((p) => !p)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-bold text-[#525A6B] hover:text-[#151B2B] transition"
        >
          <span>Optional: Manual City Override & Agent Workforce Telemetry</span>
          <span>{showManualOverride ? 'Hide ▲' : 'Show ▼'}</span>
        </button>

        {showManualOverride && (
          <div className="px-5 pb-5 pt-3 border-t border-[#E4E7EC] space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={manualCity}
                onChange={(e) => setManualCity(e.target.value)}
                placeholder="Optional: target specific city immediately (e.g. Dubai, London, Bengaluru)..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#F5F6F8] border border-[#D0D5DD] text-xs text-[#151B2B] placeholder-[#667085] focus:outline-none focus:border-[#FF6B35]"
              />
              <button
                type="button"
                disabled={syncing || isPaused}
                onClick={() => triggerCycle(manualCity)}
                className="px-5 py-2.5 rounded-xl bg-[#FF6B35] hover:bg-[#E05220] disabled:opacity-50 text-xs font-bold text-[#FFFFFF] whitespace-nowrap"
              >
                {syncing ? 'Scanning...' : 'Scan City Now'}
              </button>
            </div>

            {departments.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {departments.map((d) => (
                  <div
                    key={d.key}
                    className="rounded-lg bg-[#F5F6F8] border border-[#E4E7EC] px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="text-[#151B2B] font-semibold">{d.name}</span>
                    <span className="text-[#667085] font-mono">{d.role_count} roles</span>
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
