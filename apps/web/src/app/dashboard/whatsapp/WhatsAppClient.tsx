'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface WhatsAppSession {
  sessionId: string;
  status: string;
  phone?: string | null;
  pushName?: string | null;
  qrCode?: string | null;
  emergencyStopActive: boolean;
  engine: string;
  openwaBaseUrl: string;
}

interface FollowupDraft {
  id: string;
  lead_id: string;
  stage: string;
  status: string;
  scheduled_for: string;
  notes: string;
  leads?: {
    organisation_name: string;
    location: string;
    category: string;
    score: number;
    public_phone?: string | null;
  };
}

interface WhatsAppMessage {
  id: string;
  chat_id: string;
  sender_number: string;
  recipient_number: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  ai_classification?: string;
  ai_intent_summary?: string;
  created_at: string;
}

export function WhatsAppClient() {
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [followups, setFollowups] = useState<FollowupDraft[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [selectedFollowupId, setSelectedFollowupId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalInbound: 0,
    totalOutbound: 0,
    awaitingApproval: 0,
    deliveredCount: 0,
    optOutCount: 0,
  });
  const [isSending, setIsSending] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    fetchRealData();
  }, []);

  async function fetchRealData() {
    setLoading(true);
    try {
      const [sessionRes, convRes] = await Promise.all([
        fetch('/api/whatsapp/session'),
        fetch('/api/whatsapp/conversations'),
      ]);
      const sessionData = await sessionRes.json();
      setSession(sessionData);

      const convData = await convRes.json();
      if (convData.success) {
        setFollowups(convData.followups || []);
        setMessages(convData.messages || []);
        setStats(convData.stats);
        if (convData.followups?.length > 0 && !selectedFollowupId) {
          setSelectedFollowupId(convData.followups[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load WhatsApp data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveFollowup(draft: FollowupDraft) {
    const recipientNumber = draft.leads?.public_phone?.trim();
    if (!recipientNumber) {
      setActionNotice({
        type: 'error',
        text: 'No verified phone number recorded for this lead yet. Use "Open WhatsApp" to select a contact manually or update the lead.',
      });
      return;
    }

    setIsSending(true);
    setActionNotice(null);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: draft.lead_id,
          recipientNumber,
          text: draft.notes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionNotice({
          type: 'success',
          text: `Message submitted via OpenWA! Message ID: ${data.messageId}`,
        });
        fetchRealData();
      } else {
        setActionNotice({
          type: 'error',
          text: data.error || 'OpenWA gateway not connected — use Open WhatsApp Web below.',
        });
      }
    } catch (err: unknown) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setIsSending(false);
    }
  }

  function getWaMeUrl(draft: FollowupDraft) {
    const digits = (draft.leads?.public_phone || '').replace(/\D/g, '');
    const formatted = digits.length === 10 ? `91${digits}` : digits;
    const encoded = encodeURIComponent(draft.notes || '');
    return formatted ? `https://wa.me/${formatted}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }

  const activeFollowup = followups.find((f) => f.id === selectedFollowupId) || followups[0] || null;
  const isGatewayReady = session?.status === 'ready';

  return (
    <div className="space-y-6">
      {/* Header & Live Status Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FFFDF9] border border-[#E5DDD0] p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-[#11100E] flex items-center gap-2.5">
              <span
                className={`w-3 h-3 rounded-full ${
                  isGatewayReady ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'
                }`}
              />
              WhatsApp Client Acquisition
            </h1>
            <span className="text-[11px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#F4EEE3] text-[#11100E] border border-[#DDD4C4]">
              Line: {session?.phone || '+91 80159 29139'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5A554C] max-w-2xl">
            Live OpenWA & Supabase cadence synced across global prospects. Review queued follow-ups or message replies directly.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchRealData}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2 text-xs font-bold bg-[#11100E] hover:bg-[#272420] text-[#FAF6EE] rounded-xl transition-colors"
        >
          {loading ? 'Refreshing...' : 'Refresh Live Data'}
        </button>
      </div>

      {/* Gateway Connectivity Notice */}
      {session?.emergencyStopActive ? (
        <div className="bg-red-50 border border-red-200 text-red-900 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <span className="font-bold">
            Emergency Stop Active: Outbound WhatsApp sending is locked in Settings.
          </span>
          <Link href="/dashboard/settings" className="underline font-bold">
            Manage Safety &rarr;
          </Link>
        </div>
      ) : isGatewayReady ? (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
            <span>OpenWA Gateway CONNECTED ({session?.phone || session?.sessionId})</span>
          </div>
          <span className="font-mono text-[10px] bg-emerald-100 px-2 py-0.5 rounded">
            {session?.engine}
          </span>
        </div>
      ) : (
        <div className="bg-[#F4EEE3] border border-[#DDD4C4] text-[#5A554C] px-4 py-3 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="font-bold text-[#11100E]">OpenWA Gateway Offline — Instant Web/App Mode Ready:</span>{' '}
            <span>
              You can send every approved message in 1 tap via <code className="font-mono text-[#11100E]">wa.me</code> or start the OpenWA worker for silent dispatch.
            </span>
          </div>
          <span className="font-mono text-[10px] bg-[#FFFDF9] border border-[#DDD4C4] px-2.5 py-1 rounded text-[#11100E] shrink-0">
            STATUS: {session?.status?.toUpperCase() || 'STANDBY'}
          </span>
        </div>
      )}

      {actionNotice && (
        <div
          className={`px-4 py-3 rounded-xl text-xs font-semibold border flex items-center justify-between ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{actionNotice.text}</span>
          <button onClick={() => setActionNotice(null)} className="ml-4 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Live Supabase Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#FFFDF9] border border-[#E5DDD0] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#7C756A]">Gateway</p>
          <p
            className={`mt-1 text-sm font-black uppercase ${
              isGatewayReady ? 'text-emerald-700' : 'text-[#C2410C]'
            }`}
          >
            {isGatewayReady ? 'ONLINE' : 'STANDBY'}
          </p>
          <p className="mt-1 text-[10px] text-[#7C756A]">OpenWA Engine</p>
        </div>

        <div className="bg-[#FFFDF9] border border-[#E5DDD0] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#7C756A]">Inbound Replies</p>
          <p className="mt-1 text-xl font-black text-[#11100E]">{stats.totalInbound}</p>
          <p className="mt-1 text-[10px] text-[#7C756A]">Webhook messages</p>
        </div>

        <div className="bg-[#FFFDF9] border border-[#E5DDD0] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#7C756A]">Outbound Sent</p>
          <p className="mt-1 text-xl font-black text-[#11100E]">{stats.totalOutbound}</p>
          <p className="mt-1 text-[10px] text-[#7C756A]">Tracked dispatches</p>
        </div>

        <div className="bg-[#FFFDF9] border border-[#E5DDD0] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#7C756A]">Follow-Up Queue</p>
          <p className="mt-1 text-xl font-black text-[#C2410C]">{stats.awaitingApproval}</p>
          <p className="mt-1 text-[10px] text-[#7C756A]">Awaiting review</p>
        </div>

        <div className="bg-[#FFFDF9] border border-[#E5DDD0] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#7C756A]">Delivered / Read</p>
          <p className="mt-1 text-xl font-black text-emerald-700">{stats.deliveredCount}</p>
          <p className="mt-1 text-[10px] text-[#7C756A]">Confirmed ACKs</p>
        </div>

        <div className="bg-[#FFFDF9] border border-[#E5DDD0] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#7C756A]">Opt-Outs / DNC</p>
          <p className="mt-1 text-xl font-black text-[#5A554C]">{stats.optOutCount}</p>
          <p className="mt-1 text-[10px] text-[#7C756A]">Protected leads</p>
        </div>
      </div>

      {/* Follow-Up Studio + Live Message Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 bg-[#FFFDF9] border border-[#E5DDD0] rounded-2xl overflow-hidden min-h-[480px] shadow-sm">
        {/* Left: Live Follow-Up Queue */}
        <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-[#E5DDD0] flex flex-col bg-[#FAF6EE]">
          <div className="p-4 border-b border-[#E5DDD0] flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#11100E]">
              Live Follow-Up Queue ({followups.length})
            </h2>
            <span className="text-[10px] font-mono font-bold text-[#C2410C] bg-[#FFFDF9] px-2 py-0.5 rounded-full border border-[#DDD4C4]">
              Supabase Live
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#EFE7DA] max-h-[440px]">
            {followups.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#7C756A]">
                No scheduled WhatsApp follow-ups yet. Run Global Client Finder or check Approvals to queue outreach.
              </div>
            ) : (
              followups.map((f) => {
                const isSelected = f.id === activeFollowup?.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFollowupId(f.id)}
                    className={`w-full text-left p-4 transition-all hover:bg-[#F2EBE0] ${
                      isSelected ? 'bg-[#FFFDF9] border-l-4 border-[#EA580C]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-[#11100E] truncate">
                        {f.leads?.organisation_name || 'Verified Business'}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#EFE7DA] text-[#11100E] border border-[#DDD4C4]">
                        {f.stage}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-[#5A554C]">
                      <span>{f.leads?.location || 'Global'}</span>
                      {f.leads?.score && (
                        <span className="font-bold text-[#C2410C]">• Score {f.leads.score}</span>
                      )}
                    </div>

                    <p className="mt-2 text-xs text-[#5A554C] line-clamp-2 italic bg-[#FAF6EE] p-2 rounded-lg border border-[#E5DDD0]">
                      “{f.notes}”
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Inspector & Dispatch */}
        <div className="lg:col-span-7 flex flex-col bg-[#FFFDF9] p-6 space-y-4">
          {activeFollowup ? (
            <>
              <div className="border-b border-[#EFE7DA] pb-4 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-black text-[#11100E]">
                    {activeFollowup.leads?.organisation_name || 'Prospect Review'}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#5A554C]">
                    {activeFollowup.leads?.location || 'Global'} •{' '}
                    {activeFollowup.leads?.category || 'Enterprise'}
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-[#11100E] text-[#FAF6EE]">
                  {activeFollowup.stage.toUpperCase()}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#C2410C] uppercase tracking-wide">
                    AI Follow-Up Message
                  </span>
                  <span className="font-mono text-[10px] text-[#7C756A]">
                    Scheduled: {new Date(activeFollowup.scheduled_for).toLocaleDateString()}
                  </span>
                </div>

                <div className="bg-[#FFFDF9] p-4 rounded-xl border border-[#E5DDD0] text-xs text-[#11100E] leading-relaxed whitespace-pre-wrap">
                  {activeFollowup.notes}
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#5A554C]">
                  Status:{' '}
                  <span className="font-mono font-bold text-[#11100E]">{activeFollowup.status}</span>
                </div>

                <div className="flex items-center gap-2">
                  {isGatewayReady && (
                    <button
                      type="button"
                      onClick={() => handleApproveFollowup(activeFollowup)}
                      disabled={isSending}
                      className="px-4 py-2 text-xs font-bold text-[#FAF6EE] bg-[#11100E] hover:bg-[#272420] rounded-xl disabled:opacity-50"
                    >
                      {isSending ? 'Sending...' : 'Send via OpenWA'}
                    </button>
                  )}
                  <a
                    href={getWaMeUrl(activeFollowup)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-xs font-bold text-[#FAF6EE] bg-emerald-700 hover:bg-emerald-800 rounded-xl"
                  >
                    Open WhatsApp &rarr;
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2 py-12">
              <p className="text-sm font-bold text-[#11100E]">No Follow-Up Draft Selected</p>
              <p className="text-xs text-[#5A554C] max-w-sm">
                Use Global Client Finder to discover targets and generate outreach drafts, or review Approvals.
              </p>
            </div>
          )}

          {/* Live Webhook Message Log */}
          {messages.length > 0 && (
            <div className="mt-auto border-t border-[#EFE7DA] pt-4 space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
                Recent Live Messages ({messages.length})
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {messages.slice(-5).map((m) => (
                  <div
                    key={m.id}
                    className="rounded-lg bg-[#FAF6EE] border border-[#E5DDD0] px-3 py-2 text-xs flex items-center justify-between gap-3"
                  >
                    <span className="text-[#11100E] truncate">
                      <strong className="uppercase text-[10px] mr-1.5">{m.direction}:</strong>
                      {m.body}
                    </span>
                    <span className="text-[10px] font-mono text-[#7C756A] shrink-0">
                      {m.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
