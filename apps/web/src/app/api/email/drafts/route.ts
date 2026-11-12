import { NextRequest, NextResponse } from 'next/server';
import { createOrUpdateEmailApprovalDraft } from '@/lib/integrations/zoho-store';
import { requireFounderSession } from '@/lib/integrations/zoho-api-guard';
import { researchAndPrepareOutreach } from '@/lib/ai/outreach-intelligence';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await requireFounderSession(req);
  if (!gate.ok) return gate.response;

  const statusFilter = req.nextUrl.searchParams.get('status');
  const leadId = req.nextUrl.searchParams.get('leadId');

  let query = gate.admin
    .from('email_approvals')
    .select('*, leads(id, organisation_name, category, location, contact_restriction)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (statusFilter) query = query.eq('approval_status', statusFilter);
  if (leadId) query = query.eq('lead_id', leadId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, drafts: data || [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireFounderSession(req, { requireFounderRole: true });
  if (!gate.ok) return gate.response;

  try {
    const body = await req.json();
    const leadId = String(body?.leadId || '').trim();
    if (!leadId) {
      return NextResponse.json({ success: false, error: 'leadId is required.' }, { status: 400 });
    }

    const [{ data: lead }, { data: sources }, { data: channels }] = await Promise.all([
      gate.admin.from('leads').select('*').eq('id', leadId).maybeSingle(),
      gate.admin.from('sources').select('*').eq('lead_id', leadId),
      gate.admin.from('contact_channels').select('*').eq('lead_id', leadId),
    ]);

    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found.' }, { status: 404 });
    }

    if (lead.contact_restriction === 'opt_out' || lead.contact_restriction === 'do_not_contact') {
      return NextResponse.json(
        { success: false, error: 'PROSPECT_SUPPRESSED: Lead has opted out or is Do-Not-Contact.' },
        { status: 403 }
      );
    }

    const emailChannel = (channels || []).find((c: any) => c.channel_type === 'email');
    const recipientEmail = String(body?.recipientEmail || emailChannel?.public_value || '').trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'A verified prospect email address is required.' },
        { status: 400 }
      );
    }

    let subject = String(body?.subject || '').trim();
    let textBody = String(body?.textBody || '').trim();
    let rationale = String(body?.rationale || '').trim();
    let selectedService = String(body?.selectedService || '').trim();
    let verifiedResearch: Record<string, unknown> = {};

    if (!subject || !textBody || body?.generateWithAi) {
      const dossier = await researchAndPrepareOutreach(
        {
          lead_id: leadId,
          company_name: lead.organisation_name,
          industry: lead.category,
          category: lead.category,
          location: lead.location,
          website_url: lead.website_url,
          public_email: recipientEmail,
          research_sources: [
            ...(sources || []).map((s: any) => s.source_url).filter(Boolean),
            ...(lead.website_url ? [lead.website_url] : []),
          ],
          observed_facts: (sources || []).map((s: any) => s.observed_fact).filter(Boolean),
          contact_restriction: lead.contact_restriction,
        },
        { inspectWebsite: Boolean(lead.website_url) }
      );

      subject = subject || dossier.email_subject;
      textBody = textBody || dossier.email_draft;
      rationale = rationale || dossier.service_match.personalization_reason;
      selectedService = selectedService || dossier.service_match.recommended_solution;
      verifiedResearch = {
        industry_class: dossier.industry_class,
        confidence_score: dossier.research_profile.confidence_score,
        research_status: dossier.research_profile.research_status,
        public_business_observations: dossier.research_profile.public_business_observations,
        identified_needs: dossier.business_needs,
      };
    }

    const created = await createOrUpdateEmailApprovalDraft(gate.admin, {
      leadId,
      recipientEmail,
      senderAddress: body?.senderAddress || null,
      ccAddresses: Array.isArray(body?.ccAddresses) ? body.ccAddresses : [],
      bccAddresses: Array.isArray(body?.bccAddresses) ? body.bccAddresses : [],
      replyTo: body?.replyTo || null,
      subject,
      textBody,
      htmlBody: body?.htmlBody || null,
      rationale,
      selectedService,
      verifiedResearch,
      campaignId: body?.campaignId || 'default',
      campaignName: body?.campaignName || 'ZenLyft Direct Outreach',
      conversationId: body?.conversationId || null,
    });

    return NextResponse.json({ success: true, draft: created });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to create email draft.' },
      { status: 500 }
    );
  }
}

