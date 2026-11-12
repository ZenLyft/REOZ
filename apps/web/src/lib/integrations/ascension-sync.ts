import { createAdminClient } from '@/lib/supabase/server';
import { notifyFounder } from '@/lib/integrations/web-push';
import {
  researchAndPrepareOutreach,
  type OutreachIntelligenceDossier,
} from '@/lib/ai/outreach-intelligence';
import { queueResearchOutreachApprovals } from '@/lib/crm/outreach-dossier-store';

export interface PipelineQualifiedLead {
  organisation_name?: string;
  category?: string;
  city?: string;
  source_ref?: string;
  website_url?: string | null;
  website_status?: string;
  public_phone?: string | null;
  public_email?: string | null;
  homs_score?: number;
  priority?: string;
  recommended_product?: string;
  dossier?: OutreachIntelligenceDossier;
}

export interface PipelineOutreachDraft {
  organisation_name?: string;
  channel?: string;
  draft_message?: string;
  subject?: string;
  email_draft?: string;
  approval_hash?: string;
}

export interface CrmSyncSummary {
  synced: boolean;
  savedLeadsCount: number;
  queuedApprovalsCount: number;
  firstColdAutoSentCount: number;
  skippedDuplicates: number;
  leads: Array<{
    id?: string;
    organisation_name: string;
    city: string;
    category: string;
    homs_score: number;
    priority: string;
    recommended_product: string;
    source_ref: string;
    draft_message?: string;
    is_new?: boolean;
    first_cold_status?: 'queued_for_founder';
  }>;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

export async function syncPipelineResultsToCrm(
  pipelineOutput: Record<string, unknown> | undefined,
  regionLabel: string
): Promise<CrmSyncSummary> {
  const qualified = ((pipelineOutput?.qualified_leads as PipelineQualifiedLead[]) || []).filter(
    (l) => l.organisation_name && l.source_ref
  );
  const drafts = (pipelineOutput?.pending_outreach_drafts as PipelineOutreachDraft[]) || [];
  const draftMap = new Map(drafts.map((d) => [d.organisation_name || '', d]));

  const summaryLeads: CrmSyncSummary['leads'] = qualified.map((lead) => ({
    organisation_name: String(lead.organisation_name || ''),
    city: String(lead.city || regionLabel || 'Global'),
    category: String(lead.category || 'institution'),
    homs_score: Number(lead.dossier?.lead_score || lead.homs_score || 0),
    priority: String(lead.priority || 'QUALIFIED'),
    recommended_product: String(
      lead.dossier?.service_match.recommended_solution ||
        lead.recommended_product ||
        'ZenLyft Custom Technology Solution'
    ),
    source_ref: String(lead.source_ref || ''),
    draft_message:
      lead.dossier?.whatsapp_draft ||
      draftMap.get(String(lead.organisation_name || ''))?.draft_message,
  }));

  if (
    !qualified.length ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return {
      synced: false,
      savedLeadsCount: 0,
      queuedApprovalsCount: 0,
      firstColdAutoSentCount: 0,
      skippedDuplicates: 0,
      leads: summaryLeads,
    };
  }

  try {
    const supabase = createAdminClient();
    const { data: existingRows } = await supabase
      .from('leads')
      .select('normalised_name');
    const existingSet = new Set(
      ((existingRows as Array<{ normalised_name?: string }> | null) || [])
        .map((r) => r.normalised_name)
        .filter(Boolean)
    );

    let savedLeadsCount = 0;
    let queuedApprovalsCount = 0;
    let skippedDuplicates = 0;

    for (let i = 0; i < qualified.length; i++) {
      const lead = qualified[i];
      const orgName = String(lead.organisation_name || '').trim();
      const normName = normalizeName(orgName);
      if (!normName || existingSet.has(normName)) {
        skippedDuplicates++;
        continue;
      }

      const city = String(lead.city || regionLabel || 'Global');
      const sourceRef = String(lead.source_ref || 'https://www.openstreetmap.org');
      const cleanPhone = String(lead.public_phone || '').trim();
      const cleanEmail = String(lead.public_email || '').trim();

      const draftObj = draftMap.get(orgName);
      const dossier =
        lead.dossier ||
        (await researchAndPrepareOutreach(
          {
            company_name: orgName,
            industry: lead.category,
            category: lead.category,
            location: city,
            website_url: lead.website_url || null,
            website_status: lead.website_status || null,
            public_phone: cleanPhone || null,
            public_email: cleanEmail || null,
            research_sources: [sourceRef, ...(lead.website_url ? [lead.website_url] : [])],
            observed_facts: [
              `Verified ${lead.category || 'organization'} listing in ${city} from ${sourceRef}.`,
            ],
          },
          { inspectWebsite: Boolean(lead.website_url) }
        ));

      if (dossier.status === 'NOT_A_FIT' || dossier.status === 'SUPPRESSED') {
        continue;
      }

      const score = Math.min(100, Math.max(0, Number(dossier.lead_score || lead.homs_score || 70)));
      const orgType =
        dossier.industry_class === 'EDUCATION_HOSTEL' ||
        dossier.industry_class === 'EDUCATION_INSTITUTION' ||
        dossier.industry_class === 'HEALTHCARE'
          ? 'institution'
          : 'local_business';

      const { data: insertedLead, error: leadErr } = await supabase
        .from('leads')
        .insert({
          organisation_name: orgName,
          normalised_name: normName,
          organisation_type: orgType,
          category: dossier.research_profile.sub_industry || String(lead.category || 'business'),
          location: city,
          website_url: lead.website_url || null,
          website_status: lead.website_url ? 'verified' : 'not_found_in_checked_sources',
          service_interest: dossier.service_match.recommended_solution,
          score,
          pipeline_stage: score >= 60 ? 'qualified' : 'discovered',
          next_action: `Founder Approval Pending — ${dossier.service_match.recommended_solution}`,
          contact_restriction: 'none',
        })
        .select('id')
        .single();

      if (leadErr || !insertedLead?.id) {
        continue;
      }

      existingSet.add(normName);
      savedLeadsCount++;
      summaryLeads[i] = {
        ...summaryLeads[i],
        id: insertedLead.id,
        is_new: true,
        recommended_product: dossier.service_match.recommended_solution,
        draft_message: dossier.whatsapp_draft || draftObj?.draft_message,
      };

      await supabase.from('sources').insert({
        lead_id: insertedLead.id,
        source_url: sourceRef,
        source_type: 'openstreetmap',
        observed_fact: `Discovered (${city}) and analyzed by Business Intelligence Agent (${dossier.industry_class}).`,
        confidence: 'high',
      });

      if (cleanPhone) {
        await supabase.from('contact_channels').insert({
          lead_id: insertedLead.id,
          channel_type: 'phone',
          public_value: cleanPhone,
        });
      }
      if (cleanEmail) {
        await supabase.from('contact_channels').insert({
          lead_id: insertedLead.id,
          channel_type: 'email',
          public_value: cleanEmail,
        });
      }

      // Bind Lead ID cleanly into canonical approval payload before hashing & storing
      const boundDossier: OutreachIntelligenceDossier = await researchAndPrepareOutreach(
        {
          lead_id: insertedLead.id,
          company_name: orgName,
          industry: lead.category,
          category: lead.category,
          location: city,
          website_url: lead.website_url || null,
          website_status: lead.website_status || null,
          public_phone: cleanPhone || null,
          public_email: cleanEmail || null,
          research_sources: dossier.research_profile.research_sources,
          observed_facts: dossier.research_profile.public_business_observations,
          business_description: dossier.research_profile.business_description,
          services_offered: dossier.research_profile.services_offered,
        },
        { inspectWebsite: false }
      );

      // Strictly queue for human approval — never auto-send without explicit Founder approval
      const queued = await queueResearchOutreachApprovals({
        supabase,
        leadId: insertedLead.id,
        dossier: boundDossier,
      });

      queuedApprovalsCount += queued.queuedChannels.length;
      if (queued.queuedChannels.length > 0) {
        summaryLeads[i] = { ...summaryLeads[i], first_cold_status: 'queued_for_founder' };
      }

      await notifyFounder({
        category: 'permission_required',
        title: `Research & Draft Ready: ${orgName}`,
        body: `${dossier.industry_class} (${city}) • ${dossier.service_match.recommended_solution} • Quality ${dossier.quality_evaluation.score}/100`,
        url: '/dashboard/approvals',
        leadId: insertedLead.id,
        approvalId: queued.whatsappApprovalId || queued.emailApprovalId || null,
      });
    }

    if (savedLeadsCount > 0) {
      await supabase.from('audit_log').insert({
        actor_type: 'agent',
        actor_id: 'ascension-global',
        action: 'ascension.global_sweep',
        object_type: 'leads',
        object_id: regionLabel || 'Global',
        result: 'success',
        metadata_without_secrets: {
          region: regionLabel,
          saved_leads: savedLeadsCount,
          first_cold_auto_sent: 0,
          queued_approvals: queuedApprovalsCount,
          skipped_duplicates: skippedDuplicates,
        },
      });
    }

    return {
      synced: true,
      savedLeadsCount,
      queuedApprovalsCount,
      firstColdAutoSentCount: 0,
      skippedDuplicates,
      leads: summaryLeads,
    };
  } catch {
    return {
      synced: false,
      savedLeadsCount: 0,
      queuedApprovalsCount: 0,
      firstColdAutoSentCount: 0,
      skippedDuplicates: 0,
      leads: summaryLeads,
    };
  }
}
