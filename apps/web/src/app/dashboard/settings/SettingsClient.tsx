'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SettingsInitial {
  autonomy_level: number;
  emergency_stop_active: boolean;
  daily_discovery_limit: number;
  active_market_country: string;
  auto_pilot_enabled: boolean;
  auto_send_first_cold: boolean;
  notify_every_event: boolean;
  next_permission_founder_only: boolean;
  groqConfigured: boolean;
  ascensionConfigured: boolean;
  whatsappPhone: string;
  vapidConfigured: boolean;
  pairedDevicesCount: number;
}

export function SettingsClient({ initialSettings }: { initialSettings: SettingsInitial }) {
  const [autonomyLevel, setAutonomyLevel] = useState<number>(initialSettings.autonomy_level);
  const [emergencyStop, setEmergencyStop] = useState<boolean>(initialSettings.emergency_stop_active);
  const [dailyLimit, setDailyLimit] = useState<number>(initialSettings.daily_discovery_limit);
  const [activeMarket, setActiveMarket] = useState<string>(initialSettings.active_market_country);
  const [autoPilot, setAutoPilot] = useState<boolean>(initialSettings.auto_pilot_enabled);
  const [autoFirstCold, setAutoFirstCold] = useState<boolean>(initialSettings.auto_send_first_cold);
  const [notifyEveryEvent, setNotifyEveryEvent] = useState<boolean>(initialSettings.notify_every_event);
  const [nextPermFounderOnly, setNextPermFounderOnly] = useState<boolean>(
    initialSettings.next_permission_founder_only
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function saveSettingsPatch(payload: Record<string, unknown>, successMsg: string) {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) {
        setNotice({ type: 'error', text: data.error || 'Failed to save configuration.' });
        return false;
      }
      setNotice({ type: 'success', text: successMsg });
      return true;
    } catch (err: unknown) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Network error' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTargets() {
    await saveSettingsPatch(
      {
        autonomy_level: autonomyLevel,
        daily_discovery_limit: dailyLimit,
        active_market_country: activeMarket,
        auto_pilot_enabled: autoPilot,
        auto_send_first_cold: autoFirstCold,
        notify_every_event: notifyEveryEvent,
        next_permission_founder_only: nextPermFounderOnly,
      },
      'Autopilot permissions & iPhone PWA preferences saved to Supabase system_settings.'
    );
  }

  async function toggleEmergencyStop() {
    const nextState = !emergencyStop;
    const ok = await saveSettingsPatch(
      { emergency_stop_active: nextState },
      nextState
        ? 'EMERGENCY STOP ACTIVATED: All outbound WhatsApp & automated campaigns are now blocked in DB and Ascension Cloud.'
        : 'Emergency stop deactivated. Normal autonomous operation restored.'
    );
    if (ok) {
      setEmergencyStop(nextState);
    }
  }

  async function handleTestPush() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      const data = await res.json();
      setNotice({
        type: 'success',
        text:
          data.pushedCount > 0
            ? `Test alert pushed to ${data.pushedCount} paired iPhone/PWA device(s)!`
            : 'Test notification logged in Alerts bell. Pair your iPhone Home Screen PWA using the top-right Alerts button.',
      });
    } catch {
      setNotice({ type: 'error', text: 'Could not dispatch test notification.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center justify-between ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-4 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Master Kill Switch */}
      <div
        className={`rounded-2xl border p-6 transition ${
          emergencyStop
            ? 'border-red-300 bg-red-50 text-red-900'
            : 'border-[#E4E7EC] bg-[#FFFFFF] text-[#151B2B]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-black">Master Emergency Stop Switch</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border ${
                  emergencyStop
                    ? 'bg-red-700 text-[#F5F6F8] border-red-800'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {emergencyStop ? 'ACTIVE — ALL OUTBOUND HALTED' : 'ARMED — SAFE AUTOPILOT'}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-[#525A6B] max-w-xl">
              Immediately halts all OpenWA sends and 24/7 autonomous loops via live Supabase checks.
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={toggleEmergencyStop}
            className={`rounded-xl px-5 py-2.5 text-xs font-bold transition shadow-sm ${
              emergencyStop
                ? 'bg-emerald-700 text-[#F5F6F8] hover:bg-emerald-800'
                : 'bg-red-700 text-[#F5F6F8] hover:bg-red-800'
            }`}
          >
            {emergencyStop ? 'Restore Normal Operation' : 'Activate Emergency Stop'}
          </button>
        </div>
      </div>

      {/* Autonomy Permission Levels (1, 2, 3) */}
      <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-base font-bold text-[#151B2B]">Autonomy & Founder Permission Levels</h2>
          <p className="mt-0.5 text-xs text-[#525A6B]">
            Level 3 grants hands-free discovery and autonomous 1st cold WhatsApp dispatch while keeping all replies, quotes, and deals strictly locked to your Founder permission.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              setAutonomyLevel(1);
              setAutoFirstCold(false);
            }}
            className={`text-left rounded-xl border p-4 transition ${
              autonomyLevel === 1
                ? 'border-2 border-[#FF6B35] bg-[#151B2B] text-[#F5F6F8]'
                : 'border-[#E4E7EC] bg-[#F5F6F8] text-[#151B2B] hover:border-[#FF6B35]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">LEVEL 1: Draft Only</span>
              {autonomyLevel === 1 && <span className="text-xs font-bold text-[#FF8A5B]">● Active</span>}
            </div>
            <p className={`mt-1 text-[11px] ${autonomyLevel === 1 ? 'text-[#CBD5E1]' : 'text-[#525A6B]'}`}>
              Discovery & drafting only. Every message awaits 1-tap approval before sending.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setAutonomyLevel(2)}
            className={`text-left rounded-xl border p-4 transition ${
              autonomyLevel === 2
                ? 'border-2 border-[#FF6B35] bg-[#151B2B] text-[#F5F6F8]'
                : 'border-[#E4E7EC] bg-[#F5F6F8] text-[#151B2B] hover:border-[#FF6B35]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">LEVEL 2: Supervised</span>
              {autonomyLevel === 2 && <span className="text-xs font-bold text-[#FF8A5B]">● Active</span>}
            </div>
            <p className={`mt-1 text-[11px] ${autonomyLevel === 2 ? 'text-[#CBD5E1]' : 'text-[#525A6B]'}`}>
              Continuous discovery + pre-authorised workflow alerts within daily safety caps.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setAutonomyLevel(3);
              setAutoPilot(true);
              setAutoFirstCold(true);
              setNotifyEveryEvent(true);
              setNextPermFounderOnly(true);
            }}
            className={`text-left rounded-xl border p-4 transition ${
              autonomyLevel === 3
                ? 'border-2 border-[#FF6B35] bg-[#151B2B] text-[#F5F6F8]'
                : 'border-[#E4E7EC] bg-[#F5F6F8] text-[#151B2B] hover:border-[#FF6B35]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">LEVEL 3: Full Autopilot</span>
              {autonomyLevel === 3 && <span className="text-xs font-bold text-[#FF8A5B]">● Active</span>}
            </div>
            <p className={`mt-1 text-[11px] ${autonomyLevel === 3 ? 'text-[#CBD5E1]' : 'text-[#525A6B]'}`}>
              Auto-discovers & sends 1st cold WhatsApp automatically. Alerts iPhone PWA for next permission.
            </p>
          </button>
        </div>

        {/* Fine-Grained Permission Switches */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <label className="flex items-center justify-between rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] px-4 py-3 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-[#151B2B]">24/7 Hands-Free Discovery</div>
              <div className="text-[11px] text-[#525A6B]">Auto-sweep continents every 2 hours (no clicks)</div>
            </div>
            <input
              type="checkbox"
              checked={autoPilot}
              onChange={(e) => setAutoPilot(e.target.checked)}
              className="h-4 w-4 accent-[#FF6B35]"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] px-4 py-3 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-[#151B2B]">Auto-Send 1st Cold WhatsApp</div>
              <div className="text-[11px] text-[#525A6B]">Send 1st outreach autonomously when phone verified</div>
            </div>
            <input
              type="checkbox"
              checked={autoFirstCold}
              onChange={(e) => setAutoFirstCold(e.target.checked)}
              className="h-4 w-4 accent-[#FF6B35]"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] px-4 py-3 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-[#151B2B]">Notify Every Event to iPhone PWA</div>
              <div className="text-[11px] text-[#525A6B]">Push discoveries, cold sends, replies & alerts live</div>
            </div>
            <input
              type="checkbox"
              checked={notifyEveryEvent}
              onChange={(e) => setNotifyEveryEvent(e.target.checked)}
              className="h-4 w-4 accent-[#FF6B35]"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] px-4 py-3 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-[#151B2B]">Next Permission: Founder Access</div>
              <div className="text-[11px] text-[#525A6B]">Hold replies, pricing & follow-ups for your 1-tap approval</div>
            </div>
            <input
              type="checkbox"
              checked={nextPermFounderOnly}
              onChange={(e) => setNextPermFounderOnly(e.target.checked)}
              className="h-4 w-4 accent-[#FF6B35]"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#ECEFF3]">
          <div>
            <label className="text-xs font-bold text-[#151B2B]">Daily Discovery Cap (Leads/Day)</label>
            <input
              type="number"
              min={10}
              max={500}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(parseInt(e.target.value, 10) || 100)}
              className="mt-1.5 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2 text-xs text-[#151B2B]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#151B2B]">Primary Operational Market</label>
            <input
              type="text"
              value={activeMarket}
              onChange={(e) => setActiveMarket(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2 text-xs text-[#151B2B]"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveTargets}
            className="rounded-xl bg-[#FF6B35] px-5 py-2.5 text-xs font-bold text-[#FFFFFF] hover:bg-[#E05220] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings to Database'}
          </button>
        </div>
      </div>

      {/* iPhone PWA Notification Setup & Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#151B2B]">iPhone PWA Push Alerts</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                initialSettings.vapidConfigured && initialSettings.pairedDevicesCount > 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {initialSettings.pairedDevicesCount} Paired Device(s)
            </span>
          </div>
          <p className="text-xs text-[#525A6B]">
            On iPhone Safari: Share → Add to Home Screen → open REOZ → tap Alerts bell at top right to enable lock-screen notifications.
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={handleTestPush}
            className="w-full rounded-lg bg-[#151B2B] hover:bg-[#2B313C] px-3 py-2 text-xs font-bold text-[#F5F6F8]"
          >
            Send Test Notification
          </button>
        </div>

        <Link
          href="/dashboard/products"
          className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 hover:border-[#FF6B35] transition block space-y-1.5"
        >
          <span className="text-xs font-bold text-[#FF6B35] uppercase">Approved Pricing</span>
          <div className="text-sm font-black text-[#151B2B]">Product Catalogue & Floors &rarr;</div>
          <p className="text-xs text-[#525A6B]">Manage live service tiers & approved pricing</p>
        </Link>

        <Link
          href="/dashboard/audit"
          className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 hover:border-[#FF6B35] transition block space-y-1.5"
        >
          <span className="text-xs font-bold text-[#FF6B35] uppercase">Compliance</span>
          <div className="text-sm font-black text-[#151B2B]">Full Security Audit Log &rarr;</div>
          <p className="text-xs text-[#525A6B]">Inspect every autonomous & founder action</p>
        </Link>
      </div>
    </div>
  );
}
