import { NextRequest, NextResponse } from 'next/server';
import { rejectEmailApprovalDraft } from '@/lib/integrations/zoho-store';
import { requireFounderSession } from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const gate = await requireFounderSession(req, { requireFounderRole: true });
  if (!gate.ok) return gate.response;

  try {
    const body = await req.json().catch(() => ({}));
    const updated = await rejectEmailApprovalDraft(gate.admin, {
      draftId: context.params.id,
      userId: gate.userId,
      reason: String(body?.reason || 'Rejected by Founder'),
    });
    return NextResponse.json({ success: true, draft: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to reject email draft.' },
      { status: 400 }
    );
  }
}

