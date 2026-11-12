'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SettingsInitial {
  autonomy_level: number;
  emergency_stop_active: boolean;
  daily_discovery_limit: number;
  active_market_country: string;
  groqConfigured: boolean;
  ascensionConfigured: boolean;
  whatsappPhone: string;
}

export function SettingsClient({ initialSettings }: { initialSettings: SettingsInitial }) {
  const [autonomyLevel, setAutonomyLevel] = useState<number>(initialSettings.autonomy_level);
  const [emergencyStop, setEmergencyStop] = useState<boolean>(initialSettings.emergency_stop_active);
  const [dailyLimit, setDailyLimit] = useState<number>(initialSettings.daily_discovery_limit);
  const [activeMarket, setActiveMarket] = useState<string>(initialSettings.active_market_country);
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
      const data = await res.json();
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
      },
      'Autonomy level & target market saved to Supabase system_settings.'
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
            : 'border-[#E5DDD0] bg-[#FFFDF9] text-[#11100E]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-black">Master Emergency Stop Switch</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border ${
                  emergencyStop
                    ? 'bg-red-700 text-[#FAF6EE] border-red-800'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {emergencyStop ? 'ACTIVE — ALL OUTBOUND HALTED' : 'ARMED — SAFE OPERATION'}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-[#5A554C] max-w-xl">
              Immediately halts all OpenWA sends and Ascension cloud automation via live database & API checks.
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={toggleEmergencyStop}
            className={`rounded-xl px-5 py-2.5 text-xs font-bold transition shadow-sm ${
              emergencyStop
                ? 'bg-emerald-700 text-[#FAF6EE] hover:bg-emerald-800'
                : 'bg-red-700 text-[#FAF6EE] hover:bg-red-800'
            }`}
          >
            {emergencyStop ? 'Restore Normal Operation' : 'Activate Emergency Stop'}
          </button>
        </div>
      </div>

      {/* Autonomy Permission Levels */}
      <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-[#11100E]">Autonomy Permission Levels</h2>
          <p className="mt-0.5 text-xs text-[#5A554C]">
            Select Level 1 or Level 2 operation. Custom pricing and contracts (Levels 3–4) always require founder sign-off.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => setAutonomyLevel(1)}
            className={`text-left rounded-xl border p-4 transition ${
              autonomyLevel === 1
                ? 'border-[#11100E] bg-[#11100E] text-[#FAF6EE]'
                : 'border-[#E5DDD0] bg-[#FAF6EE] text-[#11100E] hover:border-[#CBBDA7]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">LEVEL 1: Full Internal Autonomy</span>
              {autonomyLevel === 1 && <span className="text-xs font-bold">● Active</span>}
            </div>
            <p
              className={`mt-1 text-[11px] ${
                autonomyLevel === 1 ? 'text-[#D6CCB9]' : 'text-[#5A554C]'
              }`}
            >
              Autonomous discovery, scoring, and outreach draft generation. Zero outbound messages leave without founder approval.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setAutonomyLevel(2)}
            className={`text-left rounded-xl border p-4 transition ${
              autonomyLevel === 2
                ? 'border-[#11100E] bg-[#11100E] text-[#FAF6EE]'
                : 'border-[#E5DDD0] bg-[#FAF6EE] text-[#11100E] hover:border-[#CBBDA7]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">LEVEL 2: Pre-Authorised Follow-Ups</span>
              {autonomyLevel === 2 && <span className="text-xs font-bold">● Active</span>}
            </div>
            <p
              className={`mt-1 text-[11px] ${
                autonomyLevel === 2 ? 'text-[#D6CCB9]' : 'text-[#5A554C]'
              }`}
            >
              Permits routine follow-ups and approved catalog packages within daily discovery & safety caps.
            </p>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#EFE7DA]">
          <div>
            <label className="text-xs font-bold text-[#11100E]">Daily Discovery Cap (Leads/Day)</label>
            <input
              type="number"
              min={10}
              max={500}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(parseInt(e.target.value, 10) || 100)}
              className="mt-1.5 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3.5 py-2 text-xs text-[#11100E]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#11100E]">Primary Operational Market</label>
            <input
              type="text"
              value={activeMarket}
              onChange={(e) => setActiveMarket(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3.5 py-2 text-xs text-[#11100E]"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveTargets}
            className="rounded-xl bg-[#11100E] px-5 py-2.5 text-xs font-bold text-[#FAF6EE] hover:bg-[#272420] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings to Database'}
          </button>
        </div>
      </div>

      {/* Live Infrastructure & Quick Governance Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#11100E]">Cloud & AI Engine</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                initialSettings.ascensionConfigured
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {initialSettings.ascensionConfigured ? 'Connected' : 'Not Configured'}
            </span>
          </div>
          <p className="text-xs text-[#5A554C]">
            Render Ascension 59-HQ + Groq LLM ({initialSettings.groqConfigured ? 'Key Loaded' : 'Missing Key'})
          </p>
        </div>

        <Link
          href="/dashboard/products"
          className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 hover:border-[#11100E] transition block space-y-1.5"
        >
          <span className="text-xs font-bold text-[#8C6A3B] uppercase">Approved Pricing</span>
          <div className="text-sm font-black text-[#11100E]">Product Catalogue & Floors &rarr;</div>
          <p className="text-xs text-[#5A554C]">Manage live service tiers & approved pricing</p>
        </Link>

        <Link
          href="/dashboard/audit"
          className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 hover:border-[#11100E] transition block space-y-1.5"
        >
          <span className="text-xs font-bold text-[#8C6A3B] uppercase">Compliance</span>
          <div className="text-sm font-black text-[#11100E]">Full Security Audit Log &rarr;</div>
          <p className="text-xs text-[#5A554C]">Inspect every database write & agent event</p>
        </Link>
      </div>
    </div>
  );
}
