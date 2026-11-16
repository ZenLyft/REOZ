import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ProposalsClient } from './ProposalsClient';

export const metadata: Metadata = {
  title: 'Proposals & Quotations | REOZ ZenLyft',
  description: 'Generate commercial proposals, scope of work contracts, and payment invoices.',
};

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
  const supabase = createClient();

  const { data: leads } = await supabase
    .from('leads')
    .select('id, organisation_name, category, location, contact_channels(public_value)')
    .order('created_at', { ascending: false })
    .limit(100);

  const formattedLeads = (leads || []).map((l) => {
    const phoneChannel = (l.contact_channels as any[])?.find((c: any) => c.public_value);
    return {
      id: l.id,
      organisation_name: l.organisation_name,
      category: l.category || 'Local Business',
      location: l.location || 'Coimbatore',
      public_phone: phoneChannel?.public_value || null,
    };
  });

  return <ProposalsClient initialLeads={formattedLeads} />;
}
