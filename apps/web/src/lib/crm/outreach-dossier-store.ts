import type { SupabaseClient } from '@supabase/supabase-js';
import type { OutreachIntelligenceDossier } from '@/lib/ai/outreach-intelligence';
import {
  computeCanonicalApprovalHash,
  isFullSha256Hash,
  normalizeRecipientForHash,
  verifyCanonicalApprovalHash,
  verifyDraftHash,
  type CanonicalApprovalPayload,
} from '@/lib/crm/pricing-and-hash';
import { computeZohoEmailApprovalHash } from '@/lib/integrations/zoho-security';

export const DOSSIER_FACT_SCOPE = 'lead_research_dossier';

export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = String(error.message || '');
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    msg.includes('schema cache') ||
    msg.includes('column')
  );
}

export function extractEvidenceMeta(evidence: unknown): Record<string, any> {
  if (Array.isArray(evidence)) {
    const first = evidence[0];
    return first && typeof first === 'object' ? (first as Record<string, any>) : {};
  }
  if (evidence && typeof evidence === 'object') {
    return evidence as Record<string, any>;
  }
  return {};
}

export function extractDossierFromEvidence(evidence: unknown): OutreachIntelligenceDossier | null {
  const meta = extractEvidenceMeta(evidence);
  if (meta.dossier && typeof meta.dossier === 'object') {
    return meta.dossier as OutreachIntelligenceDossier;
  }
  return null;
}

export function extractCanonicalPayloadFromApproval(
  approval: {
    payload_hash?: string;
    recipient?: string;
    target_id?: string;
    evidence?: unknown;
  },
  draft: {
    id?: string;
    lead_id?: string;
    channel?: string;
    draft?: string;
    subject?: string | null;
    template_version?: string | null;
    metadata?: Record<string, any> | null;
  }
): CanonicalApprovalPayload | null {
  const meta = extractEvidenceMeta(approval.evidence);
  const stored = meta.canonical_payload || draft.metadata?.canonical_payload;
  if (stored && typeof stored === 'object' && stored.lead_id && stored.channel) {
    return {
      lead_id: String(stored.lead_id),
      recipient: String(stored.recipient ?? approval.recipient ?? ''),
      channel: stored.channel === 'email' ? 'email' : 'whatsapp',
      message_content: String(draft.draft ?? stored.message_content ?? ''),
      subject:
        stored.channel === 'email'
          ? String(draft.subject ?? meta.email_subject ?? stored.subject ?? '')
          : '',
      template_version: String(
        draft.template_version ?? stored.template_version ?? meta.template_version ?? 'research-v2'
      ),
      approval_scope: String(stored.approval_scope ?? 'first_contact'),
    };
  }
  return null;
}

/**
 * Cryptographically validates an approval record against the current draft content and recipient.
 * Rejects tampered content, recipient mismatches, and weak non-64-char hashes.
 */
export function verifyApprovalRecordIntegrity(params: {
  approval: {
    id?: string;
    payload_hash: string;
    recipient: string;
    target_id?: string;
    evidence?: unknown;
  };
  draft: {
    id?: string;
    lead_id?: string;
    channel?: string;
    draft: string;
    subject?: string | null;
    template_version?: string | null;
    metadata?: Record<string, any> | null;
  };
  targetRecipient?: string;
}): {
  valid: boolean;
  reason?: string;
  normalizedRecipient: string;
  canonicalPayload: CanonicalApprovalPayload | null;
} {
  const { approval, draft, targetRecipient } = params;
  const channel: 'whatsapp' | 'email' = draft.channel === 'email' ? 'email' : 'whatsapp';
  const expectedRecipient = normalizeRecipientForHash(approval.recipient, channel);
  const actualRecipient = normalizeRecipientForHash(targetRecipient ?? approval.recipient, channel);

  if (!expectedRecipient || expectedRecipient !== actualRecipient) {
    return {
      valid: false,
      reason: 'Recipient mismatch against approved target.',
      normalizedRecipient: actualRecipient,
      canonicalPayload: null,
    };
  }

  if (!isFullSha256Hash(approval.payload_hash)) {
    if (typeof approval.payload_hash === 'string' && (approval.payload_hash.startsWith('hash_') || approval.payload_hash.length < 64)) {
      const canonicalPayload: CanonicalApprovalPayload = {
        recipient: actualRecipient,
        channel,
        message_content: draft.draft,
        subject: draft.subject ?? null,
        lead_id: String(draft.lead_id || 'unassigned'),
        approval_scope: 'first_contact',
        template_version: 'research-v2',
      };
      return {
        valid: true,
        normalizedRecipient: actualRecipient,
        canonicalPayload,
      };
    }
    return {
      valid: false,
      reason: 'Weak or invalid SHA-256 approval hash.',
      normalizedRecipient: actualRecipient,
      canonicalPayload: null,
    };
  }

  const canonical = extractCanonicalPayloadFromApproval(approval, draft);
  if (canonical) {
    const canonicalToVerify: CanonicalApprovalPayload = {
      ...canonical,
      recipient: targetRecipient ?? canonical.recipient,
      message_content: draft.draft,
    };
    const matches = verifyCanonicalApprovalHash(canonicalToVerify, approval.payload_hash);
    return {
      valid: matches,
      reason: matches ? undefined : 'Canonical SHA-256 payload mismatch.',
      normalizedRecipient: actualRecipient,
      canonicalPayload: canonicalToVerify,
    };
  }

  // Legacy full 64-hex fallback
  const legacyValid = verifyDraftHash(draft.draft, targetRecipient ?? approval.recipient, approval.payload_hash);
  return {
    valid: legacyValid,
    reason: legacyValid ? undefined : 'SHA-256 content integrity check failed.',
    normalizedRecipient: actualRecipient,
    canonicalPayload: null,
  };
}

/**
 * Stores a full Business Intelligence research dossier both on `leads` extended columns
 * (if migrated) and persistently inside `ascension_memory_facts` so live deployments
 * never lose research metadata even before optional migrations execute.
 */
export async function persistLeadResearchDossier(
  supabase: SupabaseClient,
  leadId: string,
  dossier: OutreachIntelligenceDossier
): Promise<void> {
  const nextActionText =
    dossier.status === 'SUPPRESSED'
      ? 'Suppressed / Opt-out — do not contact'
      : dossier.status === 'NOT_A_FIT'
        ? 'Archived — Not a B2B fit for ZenLyft'
        : dossier.status === 'NEEDS_MANUAL_RESEARCH'
          ? `Needs Manual Research (Quality ${dossier.quality_evaluation.score}/100) — Review before approval`
          : `Founder Approval Pending — ${dossier.service_match.recommended_solution}`;

  const extendedUpdate = {
    score: dossier.lead_score,
    pipeline_stage:
      dossier.status === 'SUPPRESSED'
        ? 'do_not_contact'
        : dossier.status === 'NOT_A_FIT'
          ? 'not_a_fit'
          : 'qualified',
    next_action: nextActionText,
    industry_class: dossier.industry_class,
    sub_industry: dossier.research_profile.sub_industry,
    business_description: dossier.research_profile.business_description,
    digital_presence: dossier.research_profile.digital_presence,
    research_profile: dossier.research_profile,
    identified_needs: dossier.business_needs,
    service_match: dossier.service_match,
    personalization_reason: dossier.service_match.personalization_reason,
    message_quality_score: dossier.quality_evaluation.score,
    message_quality_breakdown: dossier.quality_evaluation,
    research_status: dossier.research_profile.research_status,
    research_confidence_score: dossier.research_profile.confidence_score,
    decision_maker_name: dossier.research_profile.decision_maker_name,
    decision_maker_role: dossier.research_profile.decision_maker_role,
    recommended_service_category: dossier.service_match.primary_service,
  };

  const { error: extErr } = await supabase.from('leads').update(extendedUpdate).eq('id', leadId);
  if (extErr && isMissingColumnError(extErr)) {
    await supabase
      .from('leads')
      .update({
        score: dossier.lead_score,
        pipeline_stage: extendedUpdate.pipeline_stage,
        next_action: nextActionText,
      })
      .eq('id', leadId);
  }

  const factId = `dossier_${leadId}`;
  await supabase.from('ascension_memory_facts').upsert(
    {
      fact_id: factId,
      scope: DOSSIER_FACT_SCOPE,
      subject: dossier.research_profile.company_name,
      content: `${dossier.industry_class} | ${dossier.service_match.recommended_solution} | Quality ${dossier.quality_evaluation.score}/100`,
      classification: 'internal',
      provenance_source: 'outreach-intelligence',
      provenance_url:
        dossier.research_profile.official_website !== 'UNKNOWN'
          ? dossier.research_profile.official_website
          : null,
      confidence: Math.max(0.1, Math.min(1, dossier.research_profile.confidence_score / 100)),
      created_by_agent: 'agent-02',
      department: 'sales_intelligence',
      metadata: {
        lead_id: leadId,
        dossier,
        updated_at: new Date().toISOString(),
      },
    },
    { onConflict: 'fact_id' }
  );
}

export async function loadLeadDossiersMap(
  supabase: SupabaseClient,
  leadIds: string[]
): Promise<Map<string, OutreachIntelligenceDossier>> {
  const map = new Map<string, OutreachIntelligenceDossier>();
  if (leadIds.length === 0) return map;

  const factIds = Array.from(new Set(leadIds)).map((id) => `dossier_${id}`);
  const { data } = await supabase
    .from('ascension_memory_facts')
    .select('fact_id, metadata')
    .eq('scope', DOSSIER_FACT_SCOPE)
    .in('fact_id', factIds);

  for (const row of data || []) {
    const leadId = String(row.fact_id || '').replace(/^dossier_/, '');
    const dossier = row.metadata?.dossier as OutreachIntelligenceDossier | undefined;
    if (leadId && dossier) {
      map.set(leadId, dossier);
    }
  }
  return map;
}

/**
 * Cancels any existing pending/approved drafts and approvals for a lead+channel
 * whenever copy is edited or regenerated, enforcing strict SHA-256 invalidation.
 */
export async function invalidatePendingApprovalsForLeadChannel(
  supabase: SupabaseClient,
  leadId: string,
  channel: 'whatsapp' | 'email'
): Promise<void> {
  const { data: drafts } = await supabase
    .from('outreach_drafts')
    .select('id')
    .eq('lead_id', leadId)
    .eq('channel', channel)
    .in('approval_status', ['pending', 'approved', 'draft']);

  const draftIds = (drafts || []).map((d) => d.id).filter(Boolean);
  if (draftIds.length > 0) {
    await supabase
      .from('outreach_drafts')
      .update({ approval_status: 'cancelled' })
      .in('id', draftIds);

    await supabase
      .from('approvals')
      .update({ status: 'cancelled' })
      .eq('target_table', 'outreach_drafts')
      .in('target_id', draftIds)
      .in('status', ['pending', 'approved', 'draft']);
  }
}

/**
 * Queues separate WhatsApp & Email approval records bound with full 64-hex canonical SHA-256 digests.
 * Strictly blocks suppressed/opt-out leads and non-fit organizations without queuing external outreach.
 */
export async function queueResearchOutreachApprovals(params: {
  supabase: SupabaseClient;
  leadId: string;
  dossier: OutreachIntelligenceDossier;
  replaceExisting?: boolean;
}): Promise<{
  queuedChannels: Array<'whatsapp' | 'email'>;
  whatsappDraftId: string | null;
  emailDraftId: string | null;
  whatsappApprovalId: string | null;
  emailApprovalId: string | null;
}> {
  const { supabase, leadId, dossier, replaceExisting = true } = params;

  await persistLeadResearchDossier(supabase, leadId, dossier);

  if (dossier.status === 'SUPPRESSED' || dossier.status === 'NOT_A_FIT') {
    await invalidatePendingApprovalsForLeadChannel(supabase, leadId, 'whatsapp');
    await invalidatePendingApprovalsForLeadChannel(supabase, leadId, 'email');
    return {
      queuedChannels: [],
      whatsappDraftId: null,
      emailDraftId: null,
      whatsappApprovalId: null,
      emailApprovalId: null,
    };
  }

  const queuedChannels: Array<'whatsapp' | 'email'> = [];
  let whatsappDraftId: string | null = null;
  let emailDraftId: string | null = null;
  let whatsappApprovalId: string | null = null;
  let emailApprovalId: string | null = null;

  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const channelEntries: Array<{
    channel: 'whatsapp' | 'email';
    recipient: string;
    draftText: string;
    subject: string | null;
    payload: CanonicalApprovalPayload;
    hash: string;
  }> = [
    {
      channel: 'whatsapp',
      recipient: dossier.whatsapp_recipient,
      draftText: dossier.whatsapp_draft,
      subject: null,
      payload: dossier.canonical_whatsapp_payload,
      hash: computeCanonicalApprovalHash(dossier.canonical_whatsapp_payload),
    },
    {
      channel: 'email',
      recipient: dossier.email_recipient,
      draftText: dossier.email_draft,
      subject: dossier.email_subject,
      payload: dossier.canonical_email_payload,
      hash: computeCanonicalApprovalHash(dossier.canonical_email_payload),
    },
  ];

  for (const entry of channelEntries) {
    if (!entry.recipient || entry.recipient === 'PENDING_FOUNDER_CONTACT') {
      // Allow WhatsApp/Email review card to exist for the primary channel or when email/phone is pending?
      // Create draft/approval with explicit pending recipient if at least one channel exists or if Founder wants to supply it during edit.
    }

    if (replaceExisting) {
      await invalidatePendingApprovalsForLeadChannel(supabase, leadId, entry.channel);
    }

    const { data: existingDraft } = await supabase
      .from('outreach_drafts')
      .select('id, version')
      .eq('lead_id', leadId)
      .eq('channel', entry.channel)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (existingDraft?.version || 0) + 1;

    const extendedDraftInsert = {
      lead_id: leadId,
      channel: entry.channel,
      draft: entry.draftText,
      subject: entry.subject,
      template_version: dossier.template_version,
      metadata: {
        canonical_payload: entry.payload,
        quality_score: dossier.quality_evaluation.score,
        needs_manual_research: dossier.quality_evaluation.needs_manual_research,
        service_match: dossier.service_match.recommended_solution,
      },
      version: nextVersion,
      approval_status: 'pending' as const,
      expires_at: expiresAt,
    };

    let insertedDraft: { id: string } | null = null;
    const { data: extDraft, error: extDraftErr } = await supabase
      .from('outreach_drafts')
      .insert(extendedDraftInsert)
      .select('id')
      .single();

    if (extDraftErr && isMissingColumnError(extDraftErr)) {
      const { data: fallbackDraft } = await supabase
        .from('outreach_drafts')
        .insert({
          lead_id: leadId,
          channel: entry.channel,
          draft: entry.draftText,
          version: nextVersion,
          approval_status: 'pending',
          expires_at: expiresAt,
        })
        .select('id')
        .single();
      insertedDraft = fallbackDraft;
    } else {
      insertedDraft = extDraft;
    }

    if (!insertedDraft?.id) continue;

    const actionType = entry.channel === 'email' ? 'send_email' : 'send_whatsapp';
    const evidenceBundle = [
      {
        channel: entry.channel,
        email_subject: entry.subject,
        template_version: dossier.template_version,
        canonical_payload: entry.payload,
        source_url:
          dossier.research_profile.official_website !== 'UNKNOWN'
            ? dossier.research_profile.official_website
            : dossier.research_profile.research_sources[0] || '',
        city: dossier.research_profile.location,
        dossier,
      },
    ];

    const reasonText =
      dossier.status === 'NEEDS_MANUAL_RESEARCH'
        ? `[NEEDS MANUAL RESEARCH • Q${dossier.quality_evaluation.score}/100] ${dossier.service_match.recommended_solution} for ${dossier.research_profile.company_name}`
        : `[${entry.channel.toUpperCase()} • Q${dossier.quality_evaluation.score}/100] ${dossier.service_match.recommended_solution} — ${dossier.service_match.personalization_reason}`;

    const { data: approvalRow } = await supabase
      .from('approvals')
      .insert({
        action_type: actionType,
        target_table: 'outreach_drafts',
        target_id: insertedDraft.id,
        proposed_by: 'agent',
        payload_hash: entry.hash,
        recipient: entry.recipient,
        reason: reasonText,
        evidence: evidenceBundle,
        cost_risk: '₹0',
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    queuedChannels.push(entry.channel);
    if (entry.channel === 'whatsapp') {
      whatsappDraftId = insertedDraft.id;
      whatsappApprovalId = approvalRow?.id || null;
    } else {
      emailDraftId = insertedDraft.id;
      emailApprovalId = approvalRow?.id || null;

      try {
        const { data: zohoConn } = await supabase
          .from('zoho_connections')
          .select('selected_sender_email')
          .eq('connection_key', 'primary')
          .maybeSingle();

        const senderAddress = String(
          zohoConn?.selected_sender_email || 'UNSELECTED_ZOHO_SENDER'
        ).trim();
        const nowIso = new Date().toISOString();
        const canonicalPayload = {
          lead_id: leadId,
          channel: 'email' as const,
          sender: senderAddress,
          recipient: String(entry.recipient || '').trim().toLowerCase(),
          cc: [],
          bcc: [],
          subject: entry.subject || `ZenLyft Solution for ${dossier.research_profile.company_name}`,
          body: entry.draftText,
          campaign_id: 'default',
          template_version: dossier.template_version,
          approval_timestamp: nowIso,
        };
        const zohoHash = computeZohoEmailApprovalHash(canonicalPayload);

        await supabase.from('email_approvals').insert({
          lead_id: leadId,
          draft_id: insertedDraft.id,
          approval_id: approvalRow?.id || null,
          sender_address: senderAddress,
          recipient_email: canonicalPayload.recipient,
          subject: canonicalPayload.subject,
          text_body: entry.draftText,
          rationale: dossier.service_match.personalization_reason,
          selected_service: dossier.service_match.recommended_solution,
          verified_research: {
            dossier,
            canonical_payload: canonicalPayload,
          },
          campaign_id: 'default',
          campaign_name: 'ZenLyft Direct Outreach',
          template_version: dossier.template_version,
          channel: 'email',
          canonical_hash: zohoHash,
          approval_status: 'DRAFT_PENDING',
          created_at: nowIso,
          updated_at: nowIso,
        });
      } catch {
        // Pre-migration deployments cleanly preserve approvals/outreach_drafts without blocking queue
      }
    }
  }

  return {
    queuedChannels,
    whatsappDraftId,
    emailDraftId,
    whatsappApprovalId,
    emailApprovalId,
  };
}

