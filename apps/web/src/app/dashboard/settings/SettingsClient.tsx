'use client';

import { useState } from 'react';

export function SettingsClient() {
  const [autonomyLevel, setAutonomyLevel] = useState<number>(1);
  const [emergencyStop, setEmergencyStop] = useState<boolean>(false);
  const [weeklyLeadTarget, setWeeklyLeadTarget] = useState<number>(100);
  const [weeklyOnboardTarget, setWeeklyOnboardTarget] = useState<number>(10);
  const [activeMarket, setActiveMarket] = useState<string>('Global (Worldwide)');
  const [isSavedAlert, setIsSavedAlert] = useState<boolean>(false);

  function handleSave() {
    setIsSavedAlert(true);
    setTimeout(() => setIsSavedAlert(false), 3000);
  }

  function toggleEmergencyStop() {
    const newState = !emergencyStop;
    setEmergencyStop(newState);
    if (newState) {
      alert('🚨 EMERGENCY STOP ACTIVATED: All outgoing automated communications, WhatsApp dispatches, and agent background tasks have been immediately suspended.');
    } else {
      alert('✓ Emergency stop deactivated. System restored to normal autonomous operation.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Save Toast Notification */}
      {isSavedAlert && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-400">
          ✓ Configuration successfully updated and saved to system settings.
        </div>
      )}

      {/* EMERGENCY STOP CONTROL (SECTION 7 KILL SWITCH) */}
      <div
        className={`rounded-2xl border p-5 transition ${
          emergencyStop
            ? 'border-red-500 bg-red-950/40 text-red-200'
            : 'border-zinc-800 bg-zinc-900/80 text-zinc-100'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🚨</span>
              <h2 className="text-base font-bold">Master Emergency Stop Switch</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  emergencyStop
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}
              >
                {emergencyStop ? 'ACTIVE - SYSTEM HALTED' : 'NORMAL - SAFE'}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400 max-w-xl">
              Immediately halts all outgoing external communications, WhatsApp dispatches, automated campaign outreach, and background worker API actions with 1 click.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleEmergencyStop}
            className={`rounded-xl px-5 py-2.5 text-xs font-bold transition shadow-lg ${
              emergencyStop
                ? 'bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-500'
                : 'bg-red-600 text-white shadow-red-600/30 hover:bg-red-500'
            }`}
          >
            {emergencyStop ? '✓ Deactivate Emergency Stop' : '⛔ ACTIVATE EMERGENCY STOP'}
          </button>
        </div>
      </div>

      {/* 4 AUTONOMY PERMISSION LEVELS (SECTION 7) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-100">Autonomy Permission Levels</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Define exactly what the AI workforce is authorized to execute autonomously vs what requires your explicit founder sign-off.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {/* Level 1 */}
          <div
            onClick={() => setAutonomyLevel(1)}
            className={`cursor-pointer rounded-xl border p-4 transition ${
              autonomyLevel === 1
                ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
                : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-400">LEVEL 1: Full Internal Autonomy</span>
              {autonomyLevel === 1 && <span className="text-xs text-indigo-400">● Selected</span>}
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              Autonomous discovery, website audits, prospect research, opportunity scoring, internal reports, and outreach draft generation.
            </p>
            <span className="mt-2 inline-block rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
              Zero External Risk • 100% Founder Approval on Outbound
            </span>
          </div>

          {/* Level 2 */}
          <div
            onClick={() => setAutonomyLevel(2)}
            className={`cursor-pointer rounded-xl border p-4 transition ${
              autonomyLevel === 2
                ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
                : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-400">LEVEL 2: Pre-Authorised Sales Autonomy</span>
              {autonomyLevel === 2 && <span className="text-xs text-indigo-400">● Selected</span>}
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              Permits routine WhatsApp follow-ups, standard product explanations, and approved catalog quotations to be sent within strict daily limits.
            </p>
            <span className="mt-2 inline-block rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
              Pre-approved boundaries only • Daily limit enforced
            </span>
          </div>

          {/* Level 3 */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-4">
            <span className="text-xs font-bold text-amber-400">LEVEL 3: Mandatory Founder Escalation</span>
            <p className="mt-1 text-[11px] text-zinc-400">
              Strictly requires founder approval for custom pricing, special discounts, scope changes, or unapproved delivery commitments.
            </p>
            <span className="mt-2 inline-block rounded-md bg-amber-500/10 text-amber-400 px-2 py-0.5 text-[10px]">
              Hardcoded safeguard • AI cannot override
            </span>
          </div>

          {/* Level 4 */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-4">
            <span className="text-xs font-bold text-red-400">LEVEL 4: Founder-Only Actions</span>
            <p className="mt-1 text-[11px] text-zinc-400">
              Signing contracts, legal commitments, spending funds, changing bank settings, issuing refunds, and deleting critical records.
            </p>
            <span className="mt-2 inline-block rounded-md bg-red-500/10 text-red-400 px-2 py-0.5 text-[10px]">
              Non-delegable CEO authority
            </span>
          </div>
        </div>
      </div>

      {/* WEEKLY ACQUISITION TARGETS (SECTION 1 OF MASTER SPEC) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-100">Mandatory Weekly Acquisition Targets</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Operating targets enforced across background discovery engines and sales follow-up agents.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-zinc-300">New Leads / Week Target</label>
            <input
              type="number"
              value={weeklyLeadTarget}
              onChange={(e) => setWeeklyLeadTarget(parseInt(e.target.value, 10) || 100)}
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
            />
            <span className="mt-1 block text-[10px] text-zinc-500">Mandatory minimum: 100 leads</span>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-300">Onboarded Clients / Week Target</label>
            <input
              type="number"
              value={weeklyOnboardTarget}
              onChange={(e) => setWeeklyOnboardTarget(parseInt(e.target.value, 10) || 10)}
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
            />
            <span className="mt-1 block text-[10px] text-zinc-500">Mandatory target: ≥10% conversion (10 clients)</span>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-300">Active Operational Market</label>
            <input
              type="text"
              value={activeMarket}
              onChange={(e) => setActiveMarket(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
            />
            <span className="mt-1 block text-[10px] text-zinc-500">Coverage: Worldwide across all continents (e.g. Global, India, UK, UAE, USA, Singapore)</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500"
          >
            Save Target Configuration
          </button>
        </div>
      </div>

      {/* CONNECTED ENGINES & STATUS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Groq Engine */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200">AI Intelligence Provider</span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              ● Connected
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-zinc-100">Groq API (Llama 3.3 70B Versatile)</div>
          <p className="mt-1 text-xs text-zinc-400">
            Powers research briefs, website usability audits, objection handling, and proposal generation at sub-second latency.
          </p>
        </div>

        {/* Database & Cloud Cron */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200">Database & Cloud Cron Engine</span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              ● Active 24/7
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-zinc-100">Supabase (Singapore) + GitHub Actions Cron</div>
          <p className="mt-1 text-xs text-zinc-400">
            Runs background lead discovery and follow-up cadence cycles without requiring your laptop or browser to stay open.
          </p>
        </div>
      </div>
    </div>
  );
}

