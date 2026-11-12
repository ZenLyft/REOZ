import { NextRequest, NextResponse } from 'next/server';
import { dispatchApprovedEmailDraft } from '@/lib/integrations/zoho-store';
import {
  proxyAscensionZohoIfLocalUnconfigured,
  requireFounderSession,
} from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const gate = await requireFounderSession(req, { requireFounderRole: true, maxRequests: 15 });
  if (!gate.ok) return gate.response;

  const proxied = await proxyAscensionZohoIfLocalUnconfigured({
    path: `/api/email/drafts/${encodeURIComponent(context.params.id)}/send`,
    method: 'POST',
    body: { userId: gate.userId },
  });
  if (proxied.proxied) {
    return NextResponse.json(proxied.json, { status: proxied.status || 200 });
  }

  try {
    const result = await dispatchApprovedEmailDraft(gate.admin, {
      draftId: context.params.id,
      userId: gate.userId,
    });
    return NextResponse.json({
      success: result.deliveryStatus === 'SENT' || result.deliveryStatus === 'ACCEPTED',
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        code: err?.code || 'EMAIL_DISPATCH_ERROR',
        error: err instanceof Error ? err.message : 'Failed to send approved email.',
      },
      { status: err?.status || 500 }
    );
  }
}

