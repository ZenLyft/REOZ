import { computeDraftHash } from '@/lib/crm/pricing-and-hash';
import { createAdminClient } from '@/lib/supabase/server';

export interface PipelineQualifiedLead {
  organisation_name?: string;
  category?: string;
  city?: string;
  source_ref?: string;
  website_url?: string | null;
  website_status?: string;
  homs_score?: number;
  priority?: string;
  recommended_product?: string;
}

export interface PipelineOutreachDraft {
  organisation_name?: string;
  channel?: string;
  draft_message?: string;
  approval_hash?: string;
}

export interface CrmSyncSummary {
  synced: boolean;
  savedLeadsCount: number;
  queuedApprovalsCount: number;
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
    homs_score: Number(lead.homs_score || 0),
    priority: String(lead.priority || 'QUALIFIED'),
    recommended_product: String(lead.recommended_product || 'ZenLyft HOMS (₹35,000)'),
    source_ref: String(lead.source_ref || ''),
    draft_message: draftMap.get(String(lead.organisation_name || ''))?.draft_message,
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
      skippedDuplicates: 0,
      leads: summaryLeads,
    };
  }

  try {
    const supabase = createAdminClient();
    const { data: existingRows } = await supabase.from('leads').select('normalised_name');
    const existingSet = new Set(
      ((existingRows as Array<{ normalised_name?: string }> | null) || [])
        .map((r) => r.normalised_name)
        .filter(Boolean)
    );

    let savedLeadsCount = 0;
    let queuedApprovalsCount = 0;
    let skippedDuplicates = 0;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    for (let i = 0; i < qualified.length; i++) {
      const lead = qualified[i];
      const orgName = String(lead.organisation_name || '').trim();
      const normName = normalizeName(orgName);
      if (!normName || existingSet.has(normName)) {
        skippedDuplicates++;
        continue;
      }

      const city = String(lead.city || regionLabel || 'Global');
      const score = Math.min(100, Math.max(0, Number(lead.homs_score || 70)));
      const sourceRef = String(lead.source_ref || 'https://www.openstreetmap.org');

      const { data: insertedLead, error: leadErr } = await supabase
        .from('leads')
        .insert({
          organisation_name: orgName,
          normalised_name: normName,
          organisation_type: 'institution',
          category: String(lead.category || 'college'),
          location: city,
          website_url: lead.website_url || null,
          website_status: lead.website_url ? 'verified' : 'not_found_in_checked_sources',
          service_interest: 'hostel_management',
          score,
          pipeline_stage: score >= 60 ? 'qualified' : 'discovered',
          next_action: 'Review Outreach in Approvals',
          contact_restriction: 'none',
        })
        .select('id')
        .single();

      if (leadErr || !insertedLead?.id) {
        continue;
      }

      existingSet.add(normName);
      savedLeadsCount++;
      summaryLeads[i] = { ...summaryLeads[i], id: insertedLead.id, is_new: true };

      await supabase.from('sources').insert({
        lead_id: insertedLead.id,
        source_url: sourceRef,
        source_type: 'openstreetmap',
        observed_fact: `Discovered worldwide (${city}) via OpenStreetMap / Ascension global sweep.`,
        confidence: 'high',
      });

      const draftObj = draftMap.get(orgName);
      if (draftObj?.draft_message) {
        const recipient = 'Pending Verified Contact';
        const { data: insertedDraft } = await supabase
          .from('outreach_drafts')
          .insert({
            lead_id: insertedLead.id,
            channel: draftObj.channel || 'whatsapp',
            draft: draftObj.draft_message,
            approval_status: 'pending',
            approved_content_hash: computeDraftHash(draftObj.draft_message, recipient),
            expires_at: expiresAt,
          })
          .select('id')
          .single();

        if (insertedDraft?.id) {
          const { error: appErr } = await supabase.from('approvals').insert({
            action_type: 'send_whatsapp_outreach',
            target_table: 'outreach_drafts',
            target_id: insertedDraft.id,
            proposed_by: 'agent',
            payload_hash: computeDraftHash(draftObj.draft_message, recipient),
            recipient,
            reason: `Global sweep (${city}) — ${orgName} scored ${score}/100`,
            evidence: [{ source_url: sourceRef, city }],
            cost_risk: 'zero_rupee_free_tier',
            status: 'pending',
            expires_at: expiresAt,
          });
          if (!appErr) queuedApprovalsCount++;
        }
      }
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
          queued_approvals: queuedApprovalsCount,
          skipped_duplicates: skippedDuplicates,
        },
      });
    }

    return {
      synced: true,
      savedLeadsCount,
      queuedApprovalsCount,
      skippedDuplicates,
      leads: summaryLeads,
    };
  } catch {
    return {
      synced: false,
      savedLeadsCount: 0,
      queuedApprovalsCount: 0,
      skippedDuplicates: 0,
      leads: summaryLeads,
    };
  }
}

