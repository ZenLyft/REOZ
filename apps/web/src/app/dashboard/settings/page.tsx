import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Autonomy, Governance & Safety Controls
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Configure AI autonomy permission levels (Levels 1–4), enforce mandatory weekly acquisition targets, and manage the master emergency stop switch.
        </p>
      </div>

      <SettingsClient />
    </div>
  );
}

