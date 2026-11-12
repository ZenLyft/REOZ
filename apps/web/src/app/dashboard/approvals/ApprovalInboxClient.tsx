'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  approveDraftAction,
  rejectDraftAction,
  getOpenWaStatusAction,
  dispatchApprovedDraftViaOpenWAAction,
  OpenWaGatewayStatus,
} from './actions';

interface ApprovalItem {
  id: string;
  target_id: string;
  lead_id?: string | null;
  action_type: string;
  recipient: string;
  reason: string;
  payload_hash: string;
  status: string;
  draft_content: string;
  organisation_name: string;
  location?: string;
  channel: 'whatsapp' | 'email';
}

interface ApprovalInboxClientProps {
  initialApprovals: ApprovalItem[];
}

export function ApprovalInboxClient({ initialApprovals }: ApprovalInboxClientProps) {
  const [approvals, setApprovals] = useState<ApprovalItem[]>(initialApprovals);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<OpenWaGatewayStatus | null>(null);
  const [checkingGateway, setCheckingGateway] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  async function handleApprove(item: ApprovalItem) {
    setProcessingId(item.id);
    setNotice(null);
    const res = await approveDraftAction(item.id, item.target_id, item.draft_content, item.recipient);
    setProcessingId(null);

    if (res.success) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'approved' } : a))
      );
      setNotice({ type: 'success', text: `Approved draft for ${item.organisation_name}.` });
    } else {
      setNotice({ type: 'error', text: `Approval error: ${res.error}` });
    }
  }

  async function handleReject(item: ApprovalItem) {
    const reason = window.prompt('Reason for rejecting this draft:');
    if (!reason) return;

    setProcessingId(item.id);
    setNotice(null);
    const res = await rejectDraftAction(item.id, item.target_id, reason);
    setProcessingId(null);

    if (res.success) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'rejected' } : a))
      );
    } else {
      setNotice({ type: 'error', text: `Rejection error: ${res.error}` });
    }
  }

  async function handleAutomatedSend(item: ApprovalItem) {
    setProcessingId(item.id);
    setNotice(null);
    const res = await dispatchApprovedDraftViaOpenWAAction(
      item.id,
      item.target_id,
      item.draft_content,
      item.recipient
    );
    setProcessingId(null);

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
        text: `${res.error} — Use "Open WhatsApp" to send directly.`,
      });
    }
  }

  function getSendDeepLink(item: ApprovalItem) {
    if (item.channel === 'whatsapp') {
      const digits = item.recipient.replace(/\D/g, '');
      const formatted = digits.length === 10 ? `91${digits}` : digits;
      const encodedMsg = encodeURIComponent(item.draft_content);
      return formatted
        ? `https://wa.me/${formatted}?text=${encodedMsg}`
        : `https://wa.me/?text=${encodedMsg}`;
    }
    const subject = encodeURIComponent(`ZenLyft HOMS & Digital Portal for ${item.organisation_name}`);
    const body = encodeURIComponent(item.draft_content);
    return `mailto:${item.recipient}?subject=${subject}&body=${body}`;
  }

  const isOpenWaReady = gatewayStatus?.status === 'ready';

  return (
    <div className="space-y-4">
      {/* Live OpenWA Dispatch Line Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-4 shadow-sm">
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
                : 'Manual WhatsApp Deep-Link Ready'}
            </span>
          </div>
          <p className="text-xs text-[#525A6B] mt-1">
            Approve any draft below to unlock direct WhatsApp dispatch or 1-click Web/App handoff.
          </p>
        </div>

        <button
          type="button"
          disabled={checkingGateway}
          onClick={checkGateway}
          className="self-start sm:self-auto rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2 text-xs font-bold text-[#151B2B] hover:bg-[#ECEFF3] transition"
        >
          {checkingGateway ? 'Checking...' : 'Refresh Line'}
        </button>
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

      {/* Approvals List */}
      {approvals.length === 0 ? (
        <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-10 text-center space-y-2">
          <p className="text-base font-bold text-[#151B2B]">Approval Inbox is Empty</p>
          <p className="text-xs text-[#525A6B]">
            Run Global Client Finder to discover institutions and auto-generate outreach drafts here.
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
        approvals.map((item) => {
          const isSent = item.status === 'sent' || item.status === 'dispatched';
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm transition hover:border-[#D0D5DD]"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#ECEFF3] pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#E05220]">
                    {item.action_type.replace(/_/g, ' ')}
                    {item.location ? ` • ${item.location}` : ''}
                  </span>
                  <h3 className="text-base font-bold text-[#151B2B]">{item.organisation_name}</h3>
                  <p className="text-xs text-[#525A6B]">
                    Recipient: <strong className="text-[#151B2B]">{item.recipient}</strong> via{' '}
                    <span className="capitalize font-medium text-[#151B2B]">{item.channel}</span>
                  </p>
                </div>

                <span
                  className={`self-start sm:self-auto rounded-full border px-3 py-1 text-xs font-bold ${
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

              <div className="mt-4">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                  Draft Content (SHA-256 Verified)
                </label>
                <div className="mt-1.5 rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-4 text-xs text-[#151B2B] whitespace-pre-wrap leading-relaxed">
                  {item.draft_content}
                </div>
                <div className="mt-1 text-[10px] font-mono text-[#667085] truncate">
                  Hash: {item.payload_hash}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECEFF3] pt-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(item.draft_content);
                      setCopiedId(item.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    className="rounded-xl border border-[#D0D5DD] bg-[#ECEFF3] px-3.5 py-2 text-xs font-semibold text-[#151B2B] hover:bg-[#E2E6EC]"
                  >
                    {copiedId === item.id ? '✓ Copied' : 'Copy Text'}
                  </button>
                  {item.lead_id && (
                    <Link
                      href={`/dashboard/leads/${item.lead_id}`}
                      className="rounded-xl border border-[#E4E7EC] bg-[#FFFFFF] px-3 py-2 text-xs font-semibold text-[#525A6B] hover:text-[#151B2B]"
                    >
                      View Lead
                    </Link>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {item.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        disabled={processingId === item.id}
                        onClick={() => handleReject(item)}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={processingId === item.id}
                        onClick={() => handleApprove(item)}
                        className="rounded-xl bg-[#FF6B35] px-5 py-2 text-xs font-bold text-[#F5F6F8] hover:bg-[#E05220]"
                      >
                        {processingId === item.id ? 'Approving...' : 'Approve Draft'}
                      </button>
                    </>
                  )}

                  {item.status === 'approved' && (
                    <>
                      {item.channel === 'whatsapp' && isOpenWaReady && (
                        <button
                          type="button"
                          disabled={processingId === item.id}
                          onClick={() => handleAutomatedSend(item)}
                          className="rounded-xl bg-[#151B2B] px-4 py-2 text-xs font-bold text-[#F5F6F8] hover:bg-[#2B313C]"
                        >
                          {processingId === item.id ? 'Sending...' : 'Auto-Send via OpenWA'}
                        </button>
                      )}
                      <a
                        href={getSendDeepLink(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-[#F5F6F8] hover:bg-emerald-800"
                      >
                        Open {item.channel === 'whatsapp' ? 'WhatsApp' : 'Mail'} &rarr;
                      </a>
                    </>
                  )}

                  {isSent && (
                    <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800">
                      ✓ Sent to Prospect
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
