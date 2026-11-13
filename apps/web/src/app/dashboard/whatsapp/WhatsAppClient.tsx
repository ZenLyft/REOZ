'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface WhatsAppSession {
  sessionId: string;
  status: string;
  phone?: string | null;
  pushName?: string | null;
  qrCode?: string | null;
  pairingCode?: string | null;
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

function playAlertChime(type: 'success' | 'alert' = 'success') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch {}
}

function triggerDesktopNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.ico' });
    } catch {}
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => {
      if (p === 'granted') {
        try {
          new Notification(title, { body, icon: '/favicon.ico' });
        } catch {}
      }
    });
  }
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
    // Fast polling every 3.5s while gateway is not yet ready or displaying QR code
    const timer = setInterval(() => {
      fetch('/api/whatsapp/session')
        .then((r) => r.json())
        .then((data) => {
          setSession(data);
        })
        .catch(() => {});
    }, 3500);
    return () => clearInterval(timer);
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
          approvalId: draft.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        playAlertChime('success');
        triggerDesktopNotification(
          'REOZ: WhatsApp Message Dispatched!',
          `Outbound message submitted to ${recipientNumber} via WhatsApp Gateway.`
        );
        setActionNotice({
          type: 'success',
          text: `Message submitted to WhatsApp Gateway! Message ID: ${data.messageId || 'queued'}`,
        });
        fetchRealData();
      } else {
        playAlertChime('alert');
        setActionNotice({
          type: 'error',
          text: data.error || 'OpenWA gateway not connected — use Open WhatsApp Web below.',
        });
      }
    } catch (err: unknown) {
      playAlertChime('alert');
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FFFFFF] border border-[#E4E7EC] p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-[#151B2B] flex items-center gap-2.5">
              <span
                className={`w-3 h-3 rounded-full ${
                  isGatewayReady ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'
                }`}
              />
              WhatsApp Client Acquisition
            </h1>
            <span className="text-[11px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#ECEFF3] text-[#151B2B] border border-[#D0D5DD]">
              Line: {session?.phone || '+91 80159 29139'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#525A6B] max-w-2xl">
            Live OpenWA & Supabase cadence synced across global prospects. Review queued follow-ups or message replies directly.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => {
              playAlertChime('success');
              if (typeof window !== 'undefined' && 'Notification' in window) {
                Notification.requestPermission().then((perm) => {
                  if (perm === 'granted') {
                    triggerDesktopNotification(
                      '🔔 REOZ Alerts Active!',
                      'You will hear audio chimes and receive desktop alerts for WhatsApp sends and client replies.'
                    );
                  }
                });
              }
              setActionNotice({
                type: 'success',
                text: 'Sound & Desktop Alerts Active! Test audio chime played.',
              });
            }}
            className="px-3.5 py-2 text-xs font-bold bg-[#F5F6F8] hover:bg-[#ECEFF3] text-[#151B2B] rounded-xl transition-colors border border-[#D0D5DD] flex items-center gap-1.5 shadow-sm"
          >
            <span>🔔</span>
            <span>Enable Sound & Alerts</span>
          </button>
          <button
            type="button"
            onClick={fetchRealData}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold bg-[#151B2B] hover:bg-[#2B313C] text-[#F5F6F8] rounded-xl transition-colors"
          >
            {loading ? 'Refreshing...' : 'Refresh Live Data'}
          </button>
        </div>
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
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2.5 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping" />
            <span>WhatsApp Dedicated Gateway CONNECTED (+{session?.phone || '918015929139'})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md font-bold uppercase">
              Engine: {session?.engine || 'Baileys'} • 100% Autonomous Ready
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-[#FFFFFF] border-2 border-[#FF6B35]/30 p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E4E7EC] pb-4">
            <div>
              <h2 className="text-base font-black text-[#151B2B] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                Connect Your WhatsApp (+91 80159 29139)
              </h2>
              <p className="text-xs text-[#525A6B] mt-0.5">
                Scan the QR code below or enter the 8-digit pairing code to link your phone for 100% autonomous client messaging.
              </p>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 bg-amber-50 text-amber-900 rounded-lg font-bold border border-amber-200 self-start sm:self-auto">
              STATUS: {session?.status?.toUpperCase() || 'STANDBY'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left: Live QR Code Display */}
            <div className="flex flex-col items-center justify-center p-6 bg-[#F5F6F8] rounded-xl border border-[#E4E7EC] text-center min-h-[260px]">
              {session?.qrCode ? (
                <div className="space-y-3">
                  <div className="p-2.5 bg-white rounded-xl shadow-md border border-[#D0D5DD] inline-block">
                    <img
                      src={session.qrCode}
                      alt="WhatsApp QR Code"
                      className="w-56 h-56 object-contain rounded-lg"
                    />
                  </div>
                  <p className="text-xs font-bold text-[#151B2B]">
                    Point your phone camera at this QR code in WhatsApp
                  </p>
                  <p className="text-[11px] text-[#667085]">
                    Auto-refreshing every 3 seconds • Auto-pairs on scan
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 text-[#FF6B35] flex items-center justify-center mx-auto text-xl font-bold">
                    📱
                  </div>
                  <p className="text-xs font-bold text-[#151B2B]">
                    WhatsApp Gateway Ready to Pair
                  </p>
                  <p className="text-[11px] text-[#525A6B] max-w-xs">
                    Start the gateway worker on your machine or server to display the live QR code:
                  </p>
                  <code className="text-[11px] font-mono bg-white px-3 py-1.5 rounded-lg border border-[#D0D5DD] block text-[#151B2B]">
                    npm run whatsapp:gateway
                  </code>
                </div>
              )}
            </div>

            {/* Right: Pairing Code & Step-by-Step Instructions */}
            <div className="space-y-4">
              {session?.pairingCode && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                    Official 8-Digit WhatsApp Pairing Code:
                  </span>
                  <div className="text-2xl font-black font-mono tracking-widest text-emerald-900 bg-white px-3 py-2 rounded-lg border border-emerald-200 inline-block shadow-sm">
                    {session.pairingCode}
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Enter this code in WhatsApp &gt; Linked Devices &gt; Link with phone number instead.
                  </p>
                </div>
              )}

              <div className="bg-[#F5F6F8] p-4 rounded-xl border border-[#E4E7EC] space-y-2.5 text-xs">
                <p className="font-black text-[#151B2B] text-sm">3 Quick Steps to Link:</p>
                <div className="flex items-start gap-2.5 text-[#344054]">
                  <span className="w-5 h-5 rounded-full bg-[#151B2B] text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Open WhatsApp on your phone (<strong>+91 80159 29139</strong>).
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-[#344054]">
                  <span className="w-5 h-5 rounded-full bg-[#151B2B] text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Tap <strong>Settings</strong> (iOS) or <strong>Three dots &gt; Linked Devices</strong> (Android).
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-[#344054]">
                  <span className="w-5 h-5 rounded-full bg-[#151B2B] text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Tap <strong>Link a Device</strong> and scan the QR code on the left!
                  </span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-center justify-between">
                <span>
                  💡 <strong>Instant Fallback:</strong> Every outreach draft can also be dispatched immediately via <code>wa.me</code> deep links below.
                </span>
              </div>
            </div>
          </div>
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
        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#667085]">Gateway</p>
          <p
            className={`mt-1 text-sm font-black uppercase ${
              isGatewayReady ? 'text-emerald-700' : 'text-[#E05220]'
            }`}
          >
            {isGatewayReady ? 'ONLINE' : 'STANDBY'}
          </p>
          <p className="mt-1 text-[10px] text-[#667085]">OpenWA Engine</p>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#667085]">Inbound Replies</p>
          <p className="mt-1 text-xl font-black text-[#151B2B]">{stats.totalInbound}</p>
          <p className="mt-1 text-[10px] text-[#667085]">Webhook messages</p>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#667085]">Outbound Sent</p>
          <p className="mt-1 text-xl font-black text-[#151B2B]">{stats.totalOutbound}</p>
          <p className="mt-1 text-[10px] text-[#667085]">Tracked dispatches</p>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#667085]">Follow-Up Queue</p>
          <p className="mt-1 text-xl font-black text-[#E05220]">{stats.awaitingApproval}</p>
          <p className="mt-1 text-[10px] text-[#667085]">Awaiting review</p>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#667085]">Delivered / Read</p>
          <p className="mt-1 text-xl font-black text-emerald-700">{stats.deliveredCount}</p>
          <p className="mt-1 text-[10px] text-[#667085]">Confirmed ACKs</p>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl">
          <p className="text-[11px] font-bold text-[#667085]">Opt-Outs / DNC</p>
          <p className="mt-1 text-xl font-black text-[#525A6B]">{stats.optOutCount}</p>
          <p className="mt-1 text-[10px] text-[#667085]">Protected leads</p>
        </div>
      </div>

      {/* Follow-Up Studio + Live Message Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 bg-[#FFFFFF] border border-[#E4E7EC] rounded-2xl overflow-hidden min-h-[480px] shadow-sm">
        {/* Left: Live Follow-Up Queue */}
        <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-[#E4E7EC] flex flex-col bg-[#F5F6F8]">
          <div className="p-4 border-b border-[#E4E7EC] flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#151B2B]">
              Live Follow-Up Queue ({followups.length})
            </h2>
            <span className="text-[10px] font-mono font-bold text-[#E05220] bg-[#FFFFFF] px-2 py-0.5 rounded-full border border-[#D0D5DD]">
              Supabase Live
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#ECEFF3] max-h-[440px]">
            {followups.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#667085]">
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
                    className={`w-full text-left p-4 transition-all hover:bg-[#ECEFF3] ${
                      isSelected ? 'bg-[#FFFFFF] border-l-4 border-[#FF6B35]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-[#151B2B] truncate">
                        {f.leads?.organisation_name || 'Verified Business'}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#ECEFF3] text-[#151B2B] border border-[#D0D5DD]">
                        {f.stage}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-[#525A6B]">
                      <span>{f.leads?.location || 'Global'}</span>
                      {f.leads?.score && (
                        <span className="font-bold text-[#E05220]">• Score {f.leads.score}</span>
                      )}
                    </div>

                    <p className="mt-2 text-xs text-[#525A6B] line-clamp-2 italic bg-[#F5F6F8] p-2 rounded-lg border border-[#E4E7EC]">
                      “{f.notes}”
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Inspector & Dispatch */}
        <div className="lg:col-span-7 flex flex-col bg-[#FFFFFF] p-6 space-y-4">
          {activeFollowup ? (
            <>
              <div className="border-b border-[#ECEFF3] pb-4 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-black text-[#151B2B]">
                    {activeFollowup.leads?.organisation_name || 'Prospect Review'}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#525A6B]">
                    {activeFollowup.leads?.location || 'Global'} •{' '}
                    {activeFollowup.leads?.category || 'Enterprise'}
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-[#151B2B] text-[#F5F6F8]">
                  {activeFollowup.stage.toUpperCase()}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#E05220] uppercase tracking-wide">
                    AI Follow-Up Message
                  </span>
                  <span className="font-mono text-[10px] text-[#667085]">
                    Scheduled: {new Date(activeFollowup.scheduled_for).toLocaleDateString()}
                  </span>
                </div>

                <div className="bg-[#FFFFFF] p-4 rounded-xl border border-[#E4E7EC] text-xs text-[#151B2B] leading-relaxed whitespace-pre-wrap">
                  {activeFollowup.notes}
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#525A6B]">
                  Status:{' '}
                  <span className="font-mono font-bold text-[#151B2B]">{activeFollowup.status}</span>
                </div>

                <div className="flex items-center gap-2">
                  {isGatewayReady && (
                    <button
                      type="button"
                      onClick={() => handleApproveFollowup(activeFollowup)}
                      disabled={isSending}
                      className="px-4 py-2 text-xs font-bold text-[#F5F6F8] bg-[#151B2B] hover:bg-[#2B313C] rounded-xl disabled:opacity-50"
                    >
                      {isSending ? 'Sending...' : 'Send via OpenWA'}
                    </button>
                  )}
                  <a
                    href={getWaMeUrl(activeFollowup)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-xs font-bold text-[#F5F6F8] bg-emerald-700 hover:bg-emerald-800 rounded-xl"
                  >
                    Open WhatsApp &rarr;
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2 py-12">
              <p className="text-sm font-bold text-[#151B2B]">No Follow-Up Draft Selected</p>
              <p className="text-xs text-[#525A6B] max-w-sm">
                Use Global Client Finder to discover targets and generate outreach drafts, or review Approvals.
              </p>
            </div>
          )}

          {/* Live Webhook Message Log */}
          {messages.length > 0 && (
            <div className="mt-auto border-t border-[#ECEFF3] pt-4 space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                Recent Live Messages ({messages.length})
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {messages.slice(-5).map((m) => (
                  <div
                    key={m.id}
                    className="rounded-lg bg-[#F5F6F8] border border-[#E4E7EC] px-3 py-2 text-xs flex items-center justify-between gap-3"
                  >
                    <span className="text-[#151B2B] truncate">
                      <strong className="uppercase text-[10px] mr-1.5">{m.direction}:</strong>
                      {m.body}
                    </span>
                    <span className="text-[10px] font-mono text-[#667085] shrink-0">
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
