import { NextRequest, NextResponse } from 'next/server';
import { createOrUpdateEmailApprovalDraft } from '@/lib/integrations/zoho-store';
import { requireFounderSession } from '@/lib/integrations/zoho-api-guard';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const gate = await requireFounderSession(req, { requireFounderRole: true });
  if (!gate.ok) return gate.response;

  const { id } = context.params;
  try {
    const body = await req.json();
    const { data: existing } = await gate.admin
      .from('email_approvals')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Email draft not found.' }, { status: 404 });
    }

    const updated = await createOrUpdateEmailApprovalDraft(gate.admin, {
      id,
      leadId: existing.lead_id,
      recipientEmail: String(body?.recipientEmail ?? existing.recipient_email),
      senderAddress: String(body?.senderAddress ?? existing.sender_address),
      ccAddresses: Array.isArray(body?.ccAddresses) ? body.ccAddresses : existing.cc_addresses,
      bccAddresses: Array.isArray(body?.bccAddresses) ? body.bccAddresses : existing.bcc_addresses,
      replyTo: body?.replyTo ?? existing.reply_to,
      subject: String(body?.subject ?? existing.subject),
      textBody: String(body?.textBody ?? existing.text_body),
      htmlBody: body?.htmlBody !== undefined ? body.htmlBody : existing.html_body,
      rationale: body?.rationale ?? existing.rationale,
      selectedService: body?.selectedService ?? existing.selected_service,
      verifiedResearch: existing.verified_research || {},
      campaignId: existing.campaign_id,
      campaignName: existing.campaign_name,
      templateVersion: existing.template_version,
    });

    return NextResponse.json({ success: true, draft: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to update email draft.' },
      { status: 400 }
    );
  }
}

