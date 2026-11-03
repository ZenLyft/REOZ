'use client';

import { useState } from 'react';
import { approveDraftAction, rejectDraftAction } from './actions';

interface ApprovalItem {
  id: string;
  target_id: string; // draft id
  action_type: string;
  recipient: string;
  reason: string;
  payload_hash: string;
  status: string;
  draft_content: string;
  organisation_name: string;
  channel: 'whatsapp' | 'email';
}

interface ApprovalInboxClientProps {
  initialApprovals: ApprovalItem[];
}

export function ApprovalInboxClient({ initialApprovals }: ApprovalInboxClientProps) {
  const [approvals, setApprovals] = useState<ApprovalItem[]>(initialApprovals);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleApprove(item: ApprovalItem) {
    setProcessingId(item.id);
    const res = await approveDraftAction(item.id, item.target_id, item.draft_content, item.recipient);
    setProcessingId(null);

    if (res.success) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'approved' } : a))
      );
    } else {
      alert(`Approval error: ${res.error}`);
    }
  }

  async function handleReject(item: ApprovalItem) {
    const reason = window.prompt('Reason for rejection:');
    if (!reason) return;

    setProcessingId(item.id);
    const res = await rejectDraftAction(item.id, item.target_id, reason);
    setProcessingId(null);

    if (res.success) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'rejected' } : a))
      );
    } else {
      alert(`Rejection error: ${res.error}`);
    }
  }

  function getSendDeepLink(item: ApprovalItem) {
    if (item.channel === 'whatsapp') {
      const cleanPhone = item.recipient.replace(/\D/g, '');
      const encodedMsg = encodeURIComponent(item.draft_content);
      return `https://wa.me/91${cleanPhone}?text=${encodedMsg}`;
    } else {
      const subject = encodeURIComponent(`ZenLyft Digital Growth Proposal for ${item.organisation_name}`);
      const body = encodeURIComponent(item.draft_content);
      return `mailto:${item.recipient}?subject=${subject}&body=${body}`;
    }
  }

  return (
    <div className="space-y-4">
      {approvals.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-zinc-500">
          <div className="text-3xl">✨</div>
          <p className="mt-2 text-sm font-medium text-zinc-300">Approval Inbox is Empty</p>
          <p className="text-xs text-zinc-500">No pending outreach or proposals waiting for your sign-off.</p>
        </div>
      ) : (
        approvals.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm transition hover:border-zinc-700"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  {item.action_type.replace(/_/g, ' ')}
                </span>
                <h3 className="text-base font-bold text-zinc-100">{item.organisation_name}</h3>
                <p className="text-xs text-zinc-400">
                  Recipient: <strong className="text-zinc-200">{item.recipient}</strong> via{' '}
                  <span className="capitalize text-zinc-300">{item.channel}</span>
                </p>
              </div>

              <div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    item.status === 'approved'
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : item.status === 'rejected'
                      ? 'border-red-500/20 bg-red-500/10 text-red-400'
                      : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                  }`}
                >
                  {item.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Exact Draft Content */}
            <div className="mt-4">
              <label className="text-[11px] font-semibold uppercase text-zinc-500">
                Exact Draft Content (Locked by SHA-256 Hash)
              </label>
              <div className="mt-1.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-200 whitespace-pre-wrap">
                {item.draft_content}
              </div>
              <div className="mt-1 text-[10px] text-zinc-500 truncate">
                Hash: {item.payload_hash}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 pt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(item.draft_content)}
                  className="rounded-xl border border-zinc-800 bg-zinc-800/60 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
                >
                  📋 Copy Text
                </button>
              </div>

              <div className="flex items-center gap-2">
                {item.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      disabled={processingId === item.id}
                      onClick={() => handleReject(item)}
                      className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={processingId === item.id}
                      onClick={() => handleApprove(item)}
                      className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500"
                    >
                      {processingId === item.id ? 'Approving...' : '✓ Approve Draft'}
                    </button>
                  </>
                )}

                {item.status === 'approved' && (
                  <a
                    href={getSendDeepLink(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500"
                  >
                    🚀 Open {item.channel === 'whatsapp' ? 'WhatsApp' : 'Mail'} & Send →
                  </a>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

