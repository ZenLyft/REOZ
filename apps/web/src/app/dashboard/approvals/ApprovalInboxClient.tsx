'use client';

import { useState, useEffect } from 'react';
import {
  approveDraftAction,
  rejectDraftAction,
  getEvolutionStatusAction,
  dispatchApprovedDraftViaEvolutionAction,
} from './actions';
import { ConnectionStateResult } from '@/lib/integrations/evolution-api';

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
  const [evolutionStatus, setEvolutionStatus] = useState<ConnectionStateResult | null>(null);
  const [isCheckingEvolution, setIsCheckingEvolution] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    checkGateway();
  }, []);

  async function checkGateway() {
    setIsCheckingEvolution(true);
    try {
      const res = await getEvolutionStatusAction();
      setEvolutionStatus(res);
    } catch {
      // Ignored
    } finally {
      setIsCheckingEvolution(false);
    }
  }

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

  async function handleAutomatedSend(item: ApprovalItem) {
    if (!confirm(`Dispatch automated WhatsApp message to ${item.organisation_name} (${item.recipient})?`)) {
      return;
    }

    setProcessingId(item.id);
    const res = await dispatchApprovedDraftViaEvolutionAction(
      item.id,
      item.target_id,
      item.draft_content,
      item.recipient
    );
    setProcessingId(null);

    if (res.success) {
      alert(`Message successfully dispatched via Evolution API! (Message ID: ${res.messageId})`);
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'dispatched' } : a))
      );
    } else {
      alert(`Automated dispatch failed: ${res.error}\n\nYou can use the fallback "Open WhatsApp" button.`);
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

  const isEvolutionReady = evolutionStatus?.configured && evolutionStatus.state === 'open';

  return (
    <div className="space-y-4">
      {/* Evolution API Gateway Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex items-center gap-3">
          <div className="text-xl">🤖</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-200">Evolution API WhatsApp Engine</span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isEvolutionReady
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : evolutionStatus?.configured
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                {isEvolutionReady
                  ? '● Connected & Automated'
                  : evolutionStatus?.state === 'close'
                  ? '○ QR Scan Required'
                  : evolutionStatus?.configured
                  ? '○ Server Offline'
                  : '○ Standby (Deep-Link Active)'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {isEvolutionReady
                ? `Instance "${evolutionStatus.instanceName}" is linked and ready for automated 1-click dispatch and incoming reply detection.`
                : 'Free open-source Baileys gateway. Dispatches WhatsApp messages and processes client replies.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {evolutionStatus?.qrCodeBase64 && (
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
            >
              📱 Scan QR Code
            </button>
          )}
          <button
            type="button"
            disabled={isCheckingEvolution}
            onClick={checkGateway}
            className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            {isCheckingEvolution ? 'Checking...' : '🔄 Refresh Status'}
          </button>
        </div>
      </div>

      {/* QR Code Modal */}
      {showQrModal && evolutionStatus?.qrCodeBase64 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100">Scan with WhatsApp</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Open WhatsApp on your phone &rarr; Settings &rarr; Linked Devices &rarr; Link a Device.
            </p>
            <div className="mt-4 flex justify-center rounded-xl bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={evolutionStatus.qrCodeBase64}
                alt="WhatsApp QR Code"
                className="h-56 w-56 object-contain"
              />
            </div>
            {evolutionStatus.pairingCode && (
              <p className="mt-3 font-mono text-xs text-indigo-400">
                Pairing Code: <strong>{evolutionStatus.pairingCode}</strong>
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setShowQrModal(false);
                checkGateway();
              }}
              className="mt-5 w-full rounded-xl bg-zinc-800 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              Close & Refresh
            </button>
          </div>
        </div>
      )}

      {/* Approvals List */}
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
                    item.status === 'approved' || item.status === 'dispatched'
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
                  <div className="flex items-center gap-2">
                    {/* Automated Direct WhatsApp Dispatch */}
                    {item.channel === 'whatsapp' && (
                      <button
                        type="button"
                        disabled={processingId === item.id}
                        onClick={() => handleAutomatedSend(item)}
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500"
                      >
                        {processingId === item.id ? 'Dispatching...' : '⚡ Auto-Send via API'}
                      </button>
                    )}

                    {/* Fallback Deep Link */}
                    <a
                      href={getSendDeepLink(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
                    >
                      Open {item.channel === 'whatsapp' ? 'WhatsApp' : 'Mail'} &rarr;
                    </a>
                  </div>
                )}

                {item.status === 'dispatched' && (
                  <span className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400">
                    ✓ Dispatched to WhatsApp
                  </span>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
