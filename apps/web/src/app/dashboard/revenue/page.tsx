import { RevenueClient } from './RevenueClient';

export const dynamic = 'force-dynamic';

export default function RevenuePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Revenue Operations & Financial Intelligence
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Real-time financial accounting separating pipeline potential, quoted proposals, invoiced amounts, and verified collected cash.
          Only verified bank and UPI references are counted toward collected revenue.
        </p>
      </div>

      <RevenueClient />
    </div>
  );
}
