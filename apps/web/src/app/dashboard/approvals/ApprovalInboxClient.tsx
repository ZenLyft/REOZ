'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { OutreachIntelligenceDossier } from '@/lib/ai/outreach-intelligence';
import {
  approveDraftAction,
  rejectDraftAction,
  editDraftMessageAction,
  regenerateLeadOutreachAction,
  getOpenWaStatusAction,
  dispatchApprovedDraftViaOpenWAAction,
  dispatchApprovedEmailAction,
  markManualDispatchSentAction,
  type OpenWaGatewayStatus,
} from './actions';

export interface EnrichedApprovalItem {
  id: string;
  target_id: string;
  lead_id?: string | null;
  action_type: string;
  recipient: string;
  reason: string;
  payload_hash: string;
  status: string;
  draft_content: string;
  email_subject?: string | null;
  organisation_name: string;
  location?: string;
  category?: string;
  website_url?: string | null;
  contact_restriction?: string;
  channel: 'whatsapp' | 'email';
  dossier?: OutreachIntelligenceDossier | null;
}

export interface UnmatchedInboundEmail {
  id: string;
  from_address: string;
  subject: string;
  clean_snippet?: string | null;
  reply_classification?: string | null;
  has_prompt_injection?: boolean;
  security_flags?: string[];
  received_or_sent_at: string;
}

export interface ZohoInboxContext {
  connected: boolean;
  status: string;
  selectedSenderEmail: string | null;
  sendEnabled: boolean;
}

interface ApprovalInboxClientProps {
  initialApprovals: EnrichedApprovalItem[];
  zohoContext?: ZohoInboxContext;
  unmatchedInbound?: UnmatchedInboundEmail[];
}

interface ProspectGroup {
  groupKey: string;
  leadId: string | null;
  organisationName: string;
  location: string;
  category: string;
  websiteUrl: string | null;
  contactRestriction: string;
  dossier: OutreachIntelligenceDossier | null;
  whatsapp?: EnrichedApprovalItem;
  email?: EnrichedApprovalItem;
  extras: EnrichedApprovalItem[];
}

export function ApprovalInboxClient({
  initialApprovals,
  zohoContext,
  unmatchedInbound = [],
}: ApprovalInboxClientProps) {
  const [approvals, setApprovals] = useState<EnrichedApprovalItem[]>(initialApprovals);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<OpenWaGatewayStatus | null>(null);
  const [checkingGateway, setCheckingGateway] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedResearch, setExpandedResearch] = useState<Record<string, boolean>>({});
  const [previewEmailIds, setPreviewEmailIds] = useState<Record<string, boolean>>({});
  const [unknownDeliveryIds, setUnknownDeliveryIds] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'sent'>('all');

  // Inline editor state keyed by approvalId
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editRecipient, setEditRecipient] = useState('');

  useEffect(() => {
    checkGateway();
  }, []);

  async function checkGateway() {
    setCheckingGateway(true);
    try {
      setGatewayStatus(await getOpenWaStatusAction());
    } finally {
      setCheckingGateway(false);
    }
  }

  const groups: ProspectGroup[] = useMemo(() => {
    const filtered = approvals.filter((item) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'sent') return item.status === 'sent' || item.status === 'dispatched';
      return item.status === statusFilter;
    });

    const map = new Map<string, ProspectGroup>();
    for (const item of filtered) {
      const key = item.lead_id || item.id;
      let group = map.get(key);
      if (!group) {
        group = {
          groupKey: key,
          leadId: item.lead_id || null,
          organisationName: item.organisation_name,
          location: item.location || '',
          category: item.category || 'Business',
          websiteUrl: item.website_url || null,
          contactRestriction: item.contact_restriction || 'none',
          dossier: item.dossier || null,
          extras: [],
        };
        map.set(key, group);
      }
      if (!group.dossier && item.dossier) group.dossier = item.dossier;

      if (item.channel === 'whatsapp' && !group.whatsapp) {
        group.whatsapp = item;
      } else if (item.channel === 'email' && !group.email) {
        group.email = item;
      } else {
        group.extras.push(item);
      }
    }
    return Array.from(map.values());
  }, [approvals, statusFilter]);

  function startEditing(item: EnrichedApprovalItem) {
    setEditingId(item.id);
    setEditDraft(item.draft_content);
    setEditSubject(item.email_subject || '');
    setEditRecipient(item.recipient);
    setNotice(null);
  }

  async function handleSaveEdit(item: EnrichedApprovalItem) {
    setProcessingKey(`edit:${item.id}`);
    setNotice(null);
    const res = await editDraftMessageAction({
      approvalId: item.id,
      draftId: item.target_id,
      newContent: editDraft,
      newSubject: item.channel === 'email' ? editSubject : null,
      newRecipient: editRecipient,
    });
    setProcessingKey(null);

    if (res.success && res.newHash) {
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === item.id
            ? {
                ...a,
                draft_content: editDraft.trim(),
                email_subject: item.channel === 'email' ? editSubject.trim() : a.email_subject,
                recipient: res.newRecipient || editRecipient.trim(),
                payload_hash: res.newHash!,
                status: 'pending',
              }
            : a
        )
      );
      setEditingId(null);
      setNotice({
        type: 'success',
        text: `Saved edits & computed fresh canonical SHA-256 digest. Re-approval is required before dispatch.`,
      });
    } else {
      setNotice({ type: 'error', text: res.error || 'Failed to save draft edit.' });
    }
  }

  async function handleApprove(item: EnrichedApprovalItem) {
    setProcessingKey(`approve:${item.id}`);
    setNotice(null);
    const res = await approveDraftAction(item.id, item.target_id, item.draft_content, item.recipient);
    setProcessingKey(null);

    if (res.success) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'approved' } : a))
      );
      setNotice({
        type: 'success',
        text: `Cryptographically approved ${item.channel.toUpperCase()} outreach for ${item.organisation_name}.`,
      });
    } else {
      setNotice({ type: 'error', text: `Approval error: ${res.error}` });
    }
  }

  async function handleReject(item: EnrichedApprovalItem) {
    const reason = window.prompt('Reason for rejecting this draft:');
    if (!reason) return;

    setProcessingKey(`reject:${item.id}`);
    setNotice(null);
    const res = await rejectDraftAction(item.id, item.target_id, reason);
    setProcessingKey(null);

    if (res.success) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'rejected' } : a))
      );
    } else {
      setNotice({ type: 'error', text: `Rejection error: ${res.error}` });
    }
  }

  async function handleRegenerate(group: ProspectGroup) {
    if (!group.leadId) return;
    setProcessingKey(`regen:${group.leadId}`);
    setNotice(null);
    const res = await regenerateLeadOutreachAction(group.leadId);
    setProcessingKey(null);

    if (res.success) {
      setNotice({
        type: 'success',
        text: `Regenerated tailored research & outreach for ${group.organisationName} (Quality ${res.qualityScore}/100). Refreshing...`,
      });
      window.location.reload();
    } else {
      setNotice({ type: 'error', text: res.error || 'Failed to regenerate outreach.' });
    }
  }

  async function handleWhatsAppDispatch(item: EnrichedApprovalItem) {
    setProcessingKey(`send:${item.id}`);
    setNotice(null);
    const res = await dispatchApprovedDraftViaOpenWAAction(
      item.id,
      item.target_id,
      item.draft_content,
      item.recipient
    );
    setProcessingKey(null);

    if (res.success) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'sent' } : a))
      );
      setNotice({
        type: 'success',
        text: `Dispatched to ${item.organisation_name} via OpenWA (Message ID: ${res.messageId || 'sent'}).`,
      });
    } else {
      setNotice({
        type: 'error',
        text: `${res.error}`,
      });
    }
  }

  async function handleEmailDispatch(item: EnrichedApprovalItem) {
    setProcessingKey(`send:${item.id}`);
    setNotice(null);
    const res = await dispatchApprovedEmailAction({
      approvalId: item.id,
      draftId: item.target_id,
      currentContent: item.draft_content,
      subject: item.email_subject || `Proposal for ${item.organisation_name}`,
      recipient: item.recipient,
      senderAddress: zohoContext?.selectedSenderEmail || undefined,
    });
    setProcessingKey(null);

    if (res.success) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'sent' } : a))
      );
      setNotice({
        type: 'success',
        text: `Email dispatched via Zoho Mail to ${item.recipient} (${res.deliveryStatus || 'SENT'}${res.messageId ? ` • ID: ${res.messageId}` : ''}).`,
      });
    } else if (res.unknownDeliveryStatus) {
      setUnknownDeliveryIds((prev) => ({ ...prev, [item.id]: true }));
      setNotice({
        type: 'error',
        text: `DELIVERY_STATUS_UNKNOWN: ${res.error}`,
      });
    } else {
      setNotice({ type: 'error', text: res.error || 'Email delivery failed.' });
    }
  }

  async function handleMarkSentManually(item: EnrichedApprovalItem) {
    setProcessingKey(`manual:${item.id}`);
    setNotice(null);
    const res = await markManualDispatchSentAction(
      item.id,
      item.target_id,
      item.draft_content,
      item.recipient
    );
    setProcessingKey(null);
    if (res.success) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'sent' } : a))
      );
      setNotice({
        type: 'success',
        text: `Recorded manual ${item.channel} dispatch for ${item.organisation_name}.`,
      });
    } else {
      setNotice({ type: 'error', text: res.error || 'Could not update dispatch status.' });
    }
  }

  function getWhatsAppDeepLink(item: EnrichedApprovalItem) {
    const digits = item.recipient.replace(/\D/g, '');
    const formatted = digits.length === 10 ? `91${digits}` : digits;
    const encodedMsg = encodeURIComponent(item.draft_content);
    return formatted
      ? `https://wa.me/${formatted}?text=${encodedMsg}`
      : `https://wa.me/?text=${encodedMsg}`;
  }

  function renderChannelCard(item: EnrichedApprovalItem) {
    const isSent = item.status === 'sent' || item.status === 'dispatched';
    const isEditing = editingId === item.id;
    const label = item.channel === 'whatsapp' ? 'WhatsApp Message' : 'Email Message';
    const copyPayload =
      item.channel === 'email' && item.email_subject
        ? `Subject: ${item.email_subject}\n\n${item.draft_content}`
        : item.draft_content;

    return (
      <div
        key={item.id}
        className="rounded-xl border border-[#E4E7EC] bg-[#F9FAFB] p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#151B2B]">
              {label}
            </span>
            <p className="text-xs text-[#525A6B] mt-0.5">
              Recipient: <strong className="text-[#151B2B]">{item.recipient}</strong>
            </p>
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
              item.status === 'approved' || isSent
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : item.status === 'rejected'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {item.status.toUpperCase()}
          </span>
        </div>

        {isEditing ? (
          <div className="space-y-2.5 rounded-lg border border-[#D0D5DD] bg-[#FFFFFF] p-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#525A6B]">
                Recipient ({item.channel === 'whatsapp' ? 'Phone / WhatsApp' : 'Email'})
              </label>
              <input
                type="text"
                value={editRecipient}
                onChange={(e) => setEditRecipient(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-1.5 text-xs text-[#151B2B]"
              />
            </div>

            {item.channel === 'email' && (
              <div>
                <label className="block text-[11px] font-bold uppercase text-[#525A6B]">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-1.5 text-xs text-[#151B2B]"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase text-[#525A6B]">
                Message Content (Editing invalidates any prior approval hash)
              </label>
              <textarea
                rows={5}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-xs text-[#151B2B] leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-lg border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-1.5 text-xs font-semibold text-[#525A6B]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingKey === `edit:${item.id}`}
                onClick={() => handleSaveEdit(item)}
                className="rounded-lg bg-[#151B2B] px-3.5 py-1.5 text-xs font-bold text-[#F5F6F8] hover:bg-[#2B313C]"
              >
                {processingKey === `edit:${item.id}` ? 'Re-hashing...' : 'Save & Recompute Hash'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {item.channel === 'email' && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E4E7EC] bg-[#FFFFFF] px-3 py-1.5 text-[11px] text-[#525A6B]">
                <span>
                  Sender:{' '}
                  <strong className="text-[#151B2B]">
                    {zohoContext?.selectedSenderEmail || 'Connect Zoho Mail in Settings'}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewEmailIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                  }
                  className="font-bold text-[#EA580C] hover:underline"
                >
                  {previewEmailIds[item.id] ? 'Plain Text View' : 'Preview Formatted Email'}
                </button>
              </div>
            )}
            {item.channel === 'email' && item.email_subject && (
              <div className="rounded-lg border border-[#E4E7EC] bg-[#FFFFFF] px-3 py-2 text-xs text-[#151B2B]">
                <span className="font-bold text-[#525A6B]">Subject: </span>
                {item.email_subject}
              </div>
            )}
            {unknownDeliveryIds[item.id] && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <strong>DELIVERY_STATUS_UNKNOWN:</strong> The previous Zoho send request timed out. Inspect your Zoho Mail Sent folder before manually re-queuing.
              </div>
            )}
            {item.channel === 'email' && previewEmailIds[item.id] ? (
              <div className="rounded-lg border border-[#D0D5DD] bg-[#FFFFFF] p-4 space-y-2.5 text-xs text-[#151B2B] shadow-inner">
                <div className="border-b border-[#ECEFF3] pb-2 text-[11px] text-[#525A6B]">
                  <div><strong>From:</strong> {zohoContext?.selectedSenderEmail || 'Unconfigured Zoho Sender'}</div>
                  <div><strong>To:</strong> {item.recipient}</div>
                  <div><strong>Subject:</strong> {item.email_subject || 'Outreach'}</div>
                </div>
                <div className="space-y-2 leading-relaxed">
                  {item.draft_content.split('\n').map((para, idx) =>
                    para.trim() ? <p key={idx}>{para}</p> : <br key={idx} />
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[#E4E7EC] bg-[#FFFFFF] p-3 text-xs text-[#151B2B] whitespace-pre-wrap leading-relaxed">
                {item.draft_content}
              </div>
            )}
            <div className="text-[10px] font-mono text-[#667085] truncate">
              SHA-256 Digest: {item.payload_hash}
            </div>
          </div>
        )}

        {/* Per-channel actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E4E7EC]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(copyPayload);
                setCopiedId(item.id);
                setTimeout(() => setCopiedId(null), 2000);
              }}
              className="rounded-lg border border-[#D0D5DD] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#151B2B] hover:bg-[#ECEFF3]"
            >
              {copiedId === item.id
                ? '✓ Copied'
                : item.channel === 'whatsapp'
                ? 'Copy WhatsApp Text'
                : 'Copy Email'}
            </button>
            {!isSent && !isEditing && (
              <button
                type="button"
                onClick={() => startEditing(item)}
                className="rounded-lg border border-[#D0D5DD] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#525A6B] hover:text-[#151B2B]"
              >
                Edit Message
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {item.status === 'pending' && (
              <>
                <button
                  type="button"
                  disabled={processingKey === `reject:${item.id}`}
                  onClick={() => handleReject(item)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={processingKey === `approve:${item.id}` || isEditing}
                  onClick={() => handleApprove(item)}
                  className="rounded-lg bg-[#EA580C] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#C2410C]"
                >
                  {processingKey === `approve:${item.id}`
                    ? 'Approving...'
                    : item.channel === 'whatsapp'
                    ? 'Approve WhatsApp'
                    : 'Approve Email'}
                </button>
                {item.channel === 'whatsapp' && (
                  <>
                    <button
                      type="button"
                      disabled={processingKey === `approve:${item.id}` || isEditing}
                      onClick={async () => {
                        const link = getWhatsAppDeepLink(item);
                        const win = window.open(link, '_blank');
                        await handleApprove(item);
                        if (win) win.focus();
                      }}
                      className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 flex items-center gap-1 shadow-sm"
                    >
                      Approve & Open WhatsApp &rarr;
                    </button>
                    {isOpenWaReady && (
                      <button
                        type="button"
                        disabled={processingKey === `send:${item.id}` || isEditing}
                        onClick={async () => {
                          await handleApprove(item);
                          await handleWhatsAppDispatch(item);
                        }}
                        className="rounded-lg bg-[#151B2B] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#2B313C]"
                      >
                        Approve & Send Silently
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            {item.status === 'approved' && (
              <>
                {item.channel === 'whatsapp' && (
                  <>
                    {isOpenWaReady && (
                      <button
                        type="button"
                        disabled={processingKey === `send:${item.id}`}
                        onClick={() => handleWhatsAppDispatch(item)}
                        className="rounded-lg bg-[#151B2B] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#2B313C]"
                      >
                        {processingKey === `send:${item.id}` ? 'Sending...' : 'Send via OpenWA'}
                      </button>
                    )}
                    <a
                      href={getWhatsAppDeepLink(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                    >
                      Open WhatsApp &rarr;
                    </a>
                  </>
                )}
                {item.channel === 'email' && (
                  <>
                    <button
                      type="button"
                      disabled={processingKey === `send:${item.id}`}
                      onClick={() => handleEmailDispatch(item)}
                      className="rounded-lg bg-[#151B2B] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#2B313C]"
                    >
                      {processingKey === `send:${item.id}`
                        ? 'Sending via Zoho...'
                        : zohoContext?.connected
                        ? 'Send via Zoho Mail'
                        : 'Send Approved Email'}
                    </button>
                    {!zohoContext?.connected && (
                      <Link
                        href="/dashboard/settings#integrations"
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
                        Connect Zoho Mail &rarr;
                      </Link>
                    )}
                  </>
                )}
                <button
                  type="button"
                  disabled={processingKey === `manual:${item.id}`}
                  onClick={() => handleMarkSentManually(item)}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  {processingKey === `manual:${item.id}` ? 'Saving...' : 'Mark Sent Manually'}
                </button>
              </>
            )}

            {isSent && (
              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                ✓ Sent to Prospect
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isOpenWaReady = gatewayStatus?.status === 'ready';

  return (
    <div className="space-y-4">
      {/* Live Outbound Status & Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-sm font-bold text-[#151B2B]">
              WhatsApp Outbound Engine ({gatewayStatus?.phone || '+91 80159 29139'})
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                gatewayStatus?.emergencyStopActive
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : isOpenWaReady
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-[#ECEFF3] text-[#525A6B] border-[#D0D5DD]'
              }`}
            >
              {gatewayStatus?.emergencyStopActive
                ? 'Emergency Stop Active'
                : isOpenWaReady
                ? 'OpenWA Auto-Dispatch Live'
                : 'Manual WhatsApp Handoff Ready'}
            </span>
            <Link
              href="/dashboard/settings#integrations"
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                zohoContext?.connected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              Zoho Mail: {zohoContext?.connected ? `${zohoContext.selectedSenderEmail || 'Connected'}` : 'Not Connected'}
            </Link>
          </div>
          <p className="text-xs text-[#525A6B] mt-1">
            Zero-Trust Gate: Inspect verified business needs &amp; quality score before approving external outreach.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'pending', 'approved', 'sent'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold capitalize transition ${
                statusFilter === tab
                  ? 'bg-[#151B2B] text-white'
                  : 'border border-[#E4E7EC] bg-[#F5F6F8] text-[#525A6B] hover:text-[#151B2B]'
              }`}
            >
              {tab}
            </button>
          ))}
          <button
            type="button"
            disabled={checkingGateway}
            onClick={checkGateway}
            className="rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-1.5 text-xs font-bold text-[#151B2B] hover:bg-[#ECEFF3] transition"
          >
            {checkingGateway ? 'Checking...' : 'Refresh Line'}
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center justify-between ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-4 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Prospect Approval Cards */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-10 text-center space-y-2">
          <p className="text-base font-bold text-[#151B2B]">No Outreach Drafts in View</p>
          <p className="text-xs text-[#525A6B]">
            Run Global Client Finder to research prospects and queue tailored outreach drafts here.
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard/ascension"
              className="inline-block rounded-xl bg-[#151B2B] px-5 py-2.5 text-xs font-bold text-[#F5F6F8] hover:bg-[#2B313C]"
            >
              Find Clients Now &rarr;
            </Link>
          </div>
        </div>
      ) : (
        groups.map((group) => {
          const dossier = group.dossier;
          const profile = dossier?.research_profile;
          const needs = dossier?.business_needs || [];
          const primaryNeed = needs[0];
          const quality = dossier?.quality_evaluation;
          const match = dossier?.service_match;
          const isResearchOpen = Boolean(expandedResearch[group.groupKey]);

          return (
            <div
              key={group.groupKey}
              className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm space-y-4"
            >
              {/* Section 10 Header Metadata */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-[#ECEFF3] pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#EA580C]">
                      {dossier?.industry_class || group.category}
                    </span>
                    {group.location && (
                      <span className="text-[11px] font-semibold text-[#525A6B]">
                        • {group.location}
                      </span>
                    )}
                    {group.contactRestriction !== 'none' && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                        SUPPRESSED ({group.contactRestriction.toUpperCase()})
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-extrabold text-[#151B2B]">
                    {group.organisationName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#525A6B]">
                    <span>
                      Decision-Maker:{' '}
                      <strong className="text-[#151B2B]">
                        {profile?.decision_maker_name
                          ? `${profile.decision_maker_name} (${profile.decision_maker_role})`
                          : profile?.decision_maker_role || 'Founder / Management Team'}
                      </strong>
                    </span>
                    {group.websiteUrl && (
                      <a
                        href={group.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#EA580C] underline font-medium"
                      >
                        {group.websiteUrl}
                      </a>
                    )}
                  </div>
                </div>

                {/* Research Confidence & Quality Score Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  {profile && (
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                        profile.confidence_label === 'HIGH'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : profile.confidence_label === 'MEDIUM'
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-red-200 bg-red-50 text-red-800'
                      }`}
                    >
                      Research Confidence: {profile.confidence_score}% ({profile.confidence_label})
                    </span>
                  )}
                  {quality && (
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                        quality.score >= 75
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-red-200 bg-red-50 text-red-800'
                      }`}
                    >
                      Quality Score: {quality.score}/100
                      {quality.needs_manual_research ? ' • NEEDS MANUAL RESEARCH' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Section 10 Business Intelligence & Personalization Summary */}
              {dossier ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-[#E4E7EC] bg-[#F9FAFB] p-3.5 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">
                      Identified Business Need &amp; Supporting Evidence
                    </p>
                    <p className="font-bold text-[#151B2B]">
                      {primaryNeed?.need || 'Operational workflow modernization'}
                      {needs.length > 1 ? ` (+${needs.length - 1} more in research view)` : ''}
                    </p>
                    <ul className="list-disc pl-4 text-[#525A6B] space-y-0.5">
                      {(primaryNeed?.evidence || profile?.public_business_observations || [])
                        .slice(0, 3)
                        .map((ev, idx) => (
                          <li key={idx}>{ev}</li>
                        ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-[#E4E7EC] bg-[#F9FAFB] p-3.5 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">
                      Recommended ZenLyft Solution &amp; Personalization Reason
                    </p>
                    <p className="font-bold text-[#151B2B]">
                      {match?.recommended_solution}{' '}
                      <span className="font-semibold text-[#EA580C]">
                        ({match?.primary_service.replace(/_/g, ' ')})
                      </span>
                    </p>
                    <p className="text-[#525A6B]">
                      <strong className="text-[#151B2B]">Expected Benefit:</strong>{' '}
                      {match?.expected_business_outcome}
                    </p>
                    <p className="text-[#525A6B]">
                      <strong className="text-[#151B2B]">Why Tailored:</strong>{' '}
                      {match?.personalization_reason}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Legacy draft without full research dossier — click &ldquo;Regenerate Message&rdquo; to build a complete Business Intelligence dossier before approving.
                </div>
              )}

              {/* Prospect Level Actions Row */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedResearch((prev) => ({
                      ...prev,
                      [group.groupKey]: !prev[group.groupKey],
                    }))
                  }
                  className="rounded-lg border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-1.5 text-xs font-bold text-[#151B2B] hover:bg-[#ECEFF3]"
                >
                  {isResearchOpen ? 'Hide Research' : 'View Research'}
                </button>
                {group.leadId && (
                  <>
                    <Link
                      href={`/dashboard/leads/${group.leadId}`}
                      className="rounded-lg border border-[#E4E7EC] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#525A6B] hover:text-[#151B2B]"
                    >
                      View Lead
                    </Link>
                    <button
                      type="button"
                      disabled={processingKey === `regen:${group.leadId}`}
                      onClick={() => handleRegenerate(group)}
                      className="rounded-lg border border-[#D0D5DD] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#151B2B] hover:bg-[#F5F6F8]"
                    >
                      {processingKey === `regen:${group.leadId}`
                        ? 'Regenerating...'
                        : 'Regenerate Message'}
                    </button>
                  </>
                )}
              </div>

              {/* Expandable Deep Research Dossier Drawer */}
              {isResearchOpen && dossier && (
                <div className="rounded-xl border border-[#D0D5DD] bg-[#FFFFFF] p-4 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECEFF3] pb-2">
                    <span className="font-bold text-[#151B2B]">
                      Structured Business Intelligence Dossier ({profile?.research_status})
                    </span>
                    <span className="text-[11px] text-[#525A6B]">
                      Sources: {profile?.research_sources.join(' | ') || 'Directory'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      ['Website', profile?.digital_presence.website_available ? 'VERIFIED' : 'UNKNOWN'],
                      ['Booking', profile?.digital_presence.booking_system || 'UNKNOWN'],
                      ['Portal', profile?.digital_presence.customer_portal || 'UNKNOWN'],
                      ['Mobile App', profile?.digital_presence.mobile_app || 'UNKNOWN'],
                      ['Payments', profile?.digital_presence.online_payments || 'UNKNOWN'],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-[#F5F6F8] p-2">
                        <div className="text-[10px] font-bold uppercase text-[#667085]">{k}</div>
                        <div className="font-bold text-[#151B2B]">{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase text-[#667085]">
                      All Identified Needs ({needs.length})
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {needs.map((n, idx) => (
                        <div key={idx} className="rounded-lg border border-[#E4E7EC] p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-[#151B2B]">{n.need}</span>
                            <span className="rounded bg-[#ECEFF3] px-1.5 py-0.5 text-[10px] font-bold text-[#525A6B]">
                              {n.confidence}
                            </span>
                          </div>
                          <p className="text-[#525A6B]">{n.recommended_solution}</p>
                          <p className="text-[11px] italic text-[#667085]">
                            Q: &ldquo;{n.discovery_question}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Separate WhatsApp & Email Approval Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
                {group.whatsapp && renderChannelCard(group.whatsapp)}
                {group.email && renderChannelCard(group.email)}
                {group.extras.map((ex) => renderChannelCard(ex))}
              </div>
            </div>
          );
        })
      )}

      {unmatchedInbound.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-[#151B2B]">
                Unmatched Inbound Emails ({unmatchedInbound.length})
              </h2>
              <p className="text-xs text-[#525A6B]">
                Inbound emails that did not safely match an existing Lead record are isolated here rather than creating duplicate prospects.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {unmatchedInbound.map((msg) => (
              <div
                key={msg.id}
                className="rounded-xl border border-[#E4E7EC] bg-[#FFFFFF] p-3.5 text-xs space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-[#151B2B]">
                    {msg.from_address} — <span className="font-semibold">{msg.subject}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {msg.reply_classification && (
                      <span className="rounded-full bg-[#ECEFF3] px-2 py-0.5 text-[10px] font-bold text-[#151B2B]">
                        {msg.reply_classification}
                      </span>
                    )}
                    {msg.has_prompt_injection && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                        Prompt Injection Ignored
                      </span>
                    )}
                  </div>
                </div>
                {msg.clean_snippet && (
                  <p className="text-[#525A6B] line-clamp-2">{msg.clean_snippet}</p>
                )}
                <div className="text-[10px] text-[#667085]">
                  Received: {new Date(msg.received_or_sent_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
