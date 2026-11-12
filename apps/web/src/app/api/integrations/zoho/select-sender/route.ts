import { NextRequest, NextResponse } from 'next/server';
import { selectAuthorizedZohoSender } from '@/lib/integrations/zoho-store';
import { requireFounderSession } from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = await requireFounderSession(req, { requireFounderRole: true });
  if (!gate.ok) return gate.response;

  try {
    const body = await req.json();
    const accountId = String(body?.accountId || '').trim();
    const senderEmail = String(body?.senderEmail || '').trim();

    if (!accountId || !senderEmail) {
      return NextResponse.json(
        { success: false, error: 'accountId and senderEmail are required.' },
        { status: 400 }
      );
    }

    const result = await selectAuthorizedZohoSender(gate.admin, {
      accountId,
      senderEmail,
      userId: gate.userId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Could not select sender address.' },
      { status: 400 }
    );
  }
}

