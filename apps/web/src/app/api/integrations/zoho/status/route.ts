import { NextRequest, NextResponse } from 'next/server';
import { getZohoPublicStatus } from '@/lib/integrations/zoho-store';
import { requireFounderSession } from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await requireFounderSession(req);
  if (!gate.ok) return gate.response;

  try {
    const status = await getZohoPublicStatus(gate.admin);
    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load Zoho status.' },
      { status: 500 }
    );
  }
}

