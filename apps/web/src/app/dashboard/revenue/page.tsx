import { createClient } from '@/lib/supabase/server';
import { RevenueClient } from './RevenueClient';

export const dynamic = 'force-dynamic';

export default async function RevenuePage() {
  const supabase = createClient();

  const [{ data: invoices }, { data: projects }, { count: qualifiedLeadCount }] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, clients(organisation_name), projects(name, service_line), payments(*)')
      .order('issued_at', { ascending: false }),
    supabase
      .from('projects')
      .select('id, name, service_line, contracted_value_inr, clients(organisation_name)')
      .order('created_at', { ascending: false }),
    supabase.from('leads').select('*', { count: 'exact', head: true }).gte('score', 60),
  ]);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4E7EC] pb-5">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#151B2B]">
          Revenue & Verified Cash Accounting
        </h1>
        <p className="mt-1 text-sm text-[#525A6B]">
          Real-time invoices, contracted project value, and bank/UPI verified payments from Supabase. Zero estimated inflation.
        </p>
      </div>

      <RevenueClient
        initialInvoices={(invoices as any[]) || []}
        projects={(projects as any[]) || []}
        qualifiedLeadCount={qualifiedLeadCount || 0}
      />
    </div>
  );
}
