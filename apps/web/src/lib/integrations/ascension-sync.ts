import crypto from 'crypto';
import { computeDraftHash } from '@/lib/crm/pricing-and-hash';
import { createAdminClient } from '@/lib/supabase/server';
import {
  OpenWAClient,
  formatWhatsAppChatId,
  getOpenWAConfig,
} from '@/lib/integrations/openwa-client';
import { notifyFounder } from '@/lib/integrations/web-push';

export interface PipelineQualifiedLead {
  organisation_name?: string;
  category?: string;
  city?: string;
  source_ref?: string;
  website_url?: string | null;
  website_status?: string;
  public_phone?: string | null;
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
    first_cold_status?: 'auto_sent' | 'queued_for_founder';
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
      firstColdAutoSentCount: 0,
      skippedDuplicates: 0,
      leads: summaryLeads,
    };
  }

  try {
    const supabase = createAdminClient();
    const [{ data: settingsRow }, { data: flagFact }] = await Promise.all([
      supabase
        .from('system_settings')
        .select('*')
        .eq('id', 'zenlyft-global-settings')
        .maybeSingle(),
      supabase
        .from('ascension_memory_facts')
        .select('metadata')
        .eq('fact_id', 'reoz_autopilot_flags')
        .maybeSingle(),
    ]);

    const s = (settingsRow || {}) as {
      autonomy_level?: number;
      emergency_stop_active?: boolean;
      evolution_api_auto_send?: boolean;
      auto_send_first_cold?: boolean;
    };
    const flags = (flagFact?.metadata || {}) as {
      auto_send_first_cold?: boolean;
    };

    const emergencyStopped = Boolean(s.emergency_stop_active);
    const canAutoSendFirstCold =
      !emergencyStopped &&
      (s.auto_send_first_cold ??
        flags.auto_send_first_cold ??
        ((s.autonomy_level ?? 3) >= 3 || Boolean(s.evolution_api_auto_send)));

    const { data: existingRows } = await supabase.from('leads').select('normalised_name');
    const existingSet = new Set(
      ((existingRows as Array<{ normalised_name?: string }> | null) || [])
        .map((r) => r.normalised_name)
        .filter(Boolean)
    );

    const openWaConfig = getOpenWAConfig();
    const openWaClient = new OpenWAClient();

    let savedLeadsCount = 0;
    let queuedApprovalsCount = 0;
    let firstColdAutoSentCount = 0;
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
          next_action: 'Autonomous 1st Cold Outreach Check',
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
        observed_fact: `Discovered worldwide (${city}) via OpenStreetMap / REOZ Autopilot.`,
        confidence: 'high',
      });

      const draftObj = draftMap.get(orgName);
      const cleanPhone = String(lead.public_phone || '').trim();
      const phoneDigits = cleanPhone.replace(/\D/g, '');
      const hasValidPhone = phoneDigits.length >= 8;

      if (cleanPhone) {
        await supabase.from('contact_channels').insert({
          lead_id: insertedLead.id,
          channel_type: 'phone',
          public_value: cleanPhone,
        });
      }

      if (draftObj?.draft_message) {
        const draftMessage = draftObj.draft_message;
        const recipient = cleanPhone || 'Pending Verified Contact';
        const hash = computeDraftHash(draftMessage, recipient);

        let sentAutonomously = false;
        let dispatchMessageId: string | undefined;
        let fallbackReason = !hasValidPhone
          ? 'Public phone unavailable in OpenStreetMap — verify contact to send.'
          : 'OpenWA gateway offline or unlinked.';

        // Founder-granted Level 3 Autopilot: auto-send ONLY 1st cold outreach when valid phone exists
        if (canAutoSendFirstCold && hasValidPhone && firstColdAutoSentCount < 5) {
          const chatId = formatWhatsAppChatId(phoneDigits);
          const idempotencyKey = crypto
            .createHash('sha256')
            .update(`first_cold::${insertedLead.id}::${phoneDigits}`)
            .digest('hex');

          try {
            const sendRes = await openWaClient.sendTextMessage({
              chatId,
              text: draftMessage,
              idempotencyKey,
            });
            if (sendRes.success) {
              sentAutonomously = true;
              dispatchMessageId = sendRes.messageId;
            } else if (sendRes.error) {
              fallbackReason = sendRes.error;
            }
          } catch {
            // Keep queued for founder review
          }
        }

        const now = new Date().toISOString();

        if (sentAutonomously) {
          const { data: sentDraft } = await supabase
            .from('outreach_drafts')
            .insert({
              lead_id: insertedLead.id,
              channel: draftObj.channel || 'whatsapp',
              draft: draftMessage,
              approval_status: 'sent',
              approved_content_hash: hash,
              approved_recipient: recipient,
              approved_at: now,
              sent_at: now,
              expires_at: expiresAt,
            })
            .select('id')
            .single();

          if (sentDraft?.id) {
            const { data: appRow } = await supabase
              .from('approvals')
              .insert({
                action_type: 'autonomous_first_cold_whatsapp',
                target_table: 'outreach_drafts',
                target_id: sentDraft.id,
                proposed_by: 'system',
                payload_hash: hash,
                recipient,
                reason: `Auto-sent 1st cold WhatsApp (${city}) — ${orgName} (${score}/100)`,
                evidence: [{ source_url: sourceRef, city }],
                cost_risk: 'zero_rupee_free_tier',
                status: 'sent',
                decided_at: now,
                expires_at: expiresAt,
              })
              .select('id')
              .single();

            await supabase.from('whatsapp_messages').insert({
              session_id: openWaConfig.sessionId,
              lead_id: insertedLead.id,
              chat_id: formatWhatsAppChatId(phoneDigits),
              sender_number: openWaConfig.businessPhone.replace(/\D/g, ''),
              recipient_number: phoneDigits,
              direction: 'outbound',
              body: draftMessage,
              status: 'submitted',
              external_message_id: dispatchMessageId || null,
              approval_id: appRow?.id || null,
              approval_hash: hash,
              sent_at: now,
            });
          }

          await supabase
            .from('leads')
            .update({
              pipeline_stage: 'contacted',
              next_action: '1st Cold WhatsApp auto-sent. Follow-ups require Founder access.',
              updated_at: now,
            })
            .eq('id', insertedLead.id);

          // Schedule Day 3 follow-up strictly gated behind Founder permission
          await supabase.from('whatsapp_followups').insert({
            lead_id: insertedLead.id,
            session_id: openWaConfig.sessionId,
            stage: 'day_3',
            status: 'awaiting_approval',
            scheduled_for: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            notes: 'Next permission requires Founder approval in REOZ PWA.',
          });

          firstColdAutoSentCount++;
          summaryLeads[i] = { ...summaryLeads[i], first_cold_status: 'auto_sent' };

          await notifyFounder({
            category: 'first_cold_sent',
            title: `1st Cold WhatsApp Auto-Sent: ${orgName}`,
            body: `Sent autonomously to ${recipient} (${city}). Any reply will ask your permission next.`,
            url: '/dashboard/whatsapp',
            leadId: insertedLead.id,
          });
        } else {
          const { data: insertedDraft } = await supabase
            .from('outreach_drafts')
            .insert({
              lead_id: insertedLead.id,
              channel: draftObj.channel || 'whatsapp',
              draft: draftMessage,
              approval_status: 'draft',
              approved_content_hash: hash,
              approved_recipient: recipient,
              expires_at: expiresAt,
            })
            .select('id')
            .single();

          if (insertedDraft?.id) {
            const { data: insertedApp, error: appErr } = await supabase
              .from('approvals')
              .insert({
                action_type: 'send_whatsapp_outreach',
                target_table: 'outreach_drafts',
                target_id: insertedDraft.id,
                proposed_by: 'agent',
                payload_hash: hash,
                recipient,
                reason: `Prospect scored ${score}/100 (${city}) — ${fallbackReason}`,
                evidence: [{ source_url: sourceRef, city }],
                cost_risk: 'zero_rupee_free_tier',
                status: 'pending',
                expires_at: expiresAt,
              })
              .select('id')
              .single();

            if (!appErr) {
              queuedApprovalsCount++;
              summaryLeads[i] = { ...summaryLeads[i], first_cold_status: 'queued_for_founder' };

              await notifyFounder({
                category: 'permission_required',
                title: `Action Required: ${orgName}`,
                body: hasValidPhone
                  ? `${city} • ${fallbackReason}`
                  : `${city} • Scored ${score}/100 — verify contact to dispatch.`,
                url: '/dashboard/approvals',
                leadId: insertedLead.id,
                approvalId: insertedApp?.id || null,
              });
            }
          }
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
          first_cold_auto_sent: firstColdAutoSentCount,
          queued_approvals: queuedApprovalsCount,
          skipped_duplicates: skippedDuplicates,
        },
      });
    }

    return {
      synced: true,
      savedLeadsCount,
      queuedApprovalsCount,
      firstColdAutoSentCount,
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
