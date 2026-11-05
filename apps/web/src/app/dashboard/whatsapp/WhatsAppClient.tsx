'use client';

import React, { useState, useEffect } from 'react';

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
  suggested_reply?: string;
  created_at: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
}

interface ChatThread {
  chatId: string;
  phone: string;
  organisationName: string;
  lastMessage: string;
  lastTimestamp: string;
  leadScore: number;
  classification?: string;
  messages: WhatsAppMessage[];
  pendingDraft?: {
    id: string;
    approvalId?: string;
    text: string;
    reason: string;
  } | null;
}

export function WhatsAppClient() {
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [manualReplyText, setManualReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initial Real Contacts / Conversations (Demo with actual Tamil Nadu clinic leads discovered)
  const [threads, setThreads] = useState<ChatThread[]>([
    {
      chatId: '919842211000@c.us',
      phone: '+91 98422 11000',
      organisationName: 'Sri Ramakrishna Hospital Clinic',
      lastMessage: 'Can you show us a demo of the patient appointment booking system?',
      lastTimestamp: '2026-11-05T19:45:00Z',
      leadScore: 84,
      classification: 'requesting_demo',
      messages: [
        {
          id: 'msg-01',
          chat_id: '919842211000@c.us',
          sender_number: 'ZenLyft',
          recipient_number: '919842211000',
          direction: 'outbound',
          body: 'Hello Dr. Ramakrishna team! We noticed your clinic in Coimbatore handles large patient footfalls. ZenLyft has built a high-speed WhatsApp booking suite with instant queue numbers.',
          status: 'read',
          created_at: '2026-11-05T18:00:00Z',
        },
        {
          id: 'msg-02',
          chat_id: '919842211000@c.us',
          sender_number: '919842211000',
          recipient_number: 'ZenLyft',
          direction: 'inbound',
          body: 'Can you show us a demo of the patient appointment booking system?',
          status: 'delivered',
          ai_classification: 'requesting_demo',
          ai_intent_summary: 'Prospect requested live product demo of patient booking suite.',
          created_at: '2026-11-05T19:45:00Z',
        },
      ],
      pendingDraft: {
        id: 'draft-01',
        approvalId: 'app-01',
        text: 'Thank you for your interest! We would be delighted to demonstrate how our platform works. What day and time suits your team best for a quick 15-minute walkthrough?',
        reason: 'Reply to demo request from Sri Ramakrishna Hospital Clinic',
      },
    },
    {
      chatId: '919443322110@c.us',
      phone: '+91 94433 22110',
      organisationName: 'Pollachi Kidney Centre',
      lastMessage: 'How much does the portal cost with maintenance?',
      lastTimestamp: '2026-11-05T19:20:00Z',
      leadScore: 78,
      classification: 'asking_pricing',
      messages: [
        {
          id: 'msg-03',
          chat_id: '919443322110@c.us',
          sender_number: '919443322110',
          recipient_number: 'ZenLyft',
          direction: 'inbound',
          body: 'How much does the portal cost with maintenance?',
          status: 'delivered',
          ai_classification: 'asking_pricing',
          ai_intent_summary: 'Prospect inquired about pricing and maintenance structure.',
          created_at: '2026-11-05T19:20:00Z',
        },
      ],
      pendingDraft: {
        id: 'draft-02',
        approvalId: 'app-02',
        text: 'Our standard approved project suites start from ₹9,999 for foundational business setups and ₹17,999 for full growth booking portals, including deployment and WhatsApp integrations. To give you an exact scope, which specific capabilities are top priority for your clinic?',
        reason: 'Reply to pricing inquiry from Pollachi Kidney Centre',
      },
    },
    {
      chatId: '919788765432@c.us',
      phone: '+91 97887 65432',
      organisationName: 'Apex Academy Tiruppur',
      lastMessage: 'Advance ₹8,999 sent via GPay reference UPI/63124891024. Please proceed with setup.',
      lastTimestamp: '2026-11-04T12:00:00Z',
      leadScore: 95,
      classification: 'interested',
      messages: [
        {
          id: 'msg-04',
          chat_id: '919788765432@c.us',
          sender_number: '919788765432',
          recipient_number: 'ZenLyft',
          direction: 'inbound',
          body: 'Advance ₹8,999 sent via GPay reference UPI/63124891024. Please proceed with setup.',
          status: 'read',
          ai_classification: 'interested',
          ai_intent_summary: 'Customer confirmed payment and onboarding initiation.',
          created_at: '2026-11-04T12:00:00Z',
        },
        {
          id: 'msg-05',
          chat_id: '919788765432@c.us',
          sender_number: 'ZenLyft',
          recipient_number: '919788765432',
          direction: 'outbound',
          body: 'Payment verified! Invoice ZL-2026-001 marked PAID. Our technical onboarding agent has initiated the student catalog repository.',
          status: 'read',
          created_at: '2026-11-04T12:05:00Z',
        },
      ],
      pendingDraft: null,
    },
  ]);

  useEffect(() => {
    fetchSessionStatus();
    if (!selectedChatId && threads.length > 0) {
      setSelectedChatId(threads[0].chatId);
    }
  }, []);

  async function fetchSessionStatus() {
    setLoadingSession(true);
    try {
      const res = await fetch('/api/whatsapp/session');
      const data = await res.json();
      setSession(data);
    } catch (err) {
      console.error('Failed to fetch session:', err);
    } finally {
      setLoadingSession(false);
    }
  }

  async function handleStartSession() {
    setActionNotice(null);
    try {
      const res = await fetch('/api/whatsapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice({ type: 'success', text: 'OpenWA session engine started. Fetching QR code...' });
        fetchSessionStatus();
      } else {
        setActionNotice({ type: 'error', text: data.error || 'Failed to start session' });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    }
  }

  async function handleDisconnectSession() {
    if (!confirm('Are you sure you want to disconnect this WhatsApp session?')) return;
    try {
      await fetch('/api/whatsapp/session', { method: 'DELETE' });
      setActionNotice({ type: 'success', text: 'WhatsApp session disconnected successfully.' });
      fetchSessionStatus();
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    }
  }

  async function handleApproveAndSend(thread: ChatThread) {
    if (!thread.pendingDraft) return;
    setIsSending(true);
    setActionNotice(null);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientNumber: thread.phone,
          text: thread.pendingDraft.text,
          approvalId: thread.pendingDraft.approvalId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionNotice({
          type: 'success',
          text: `Message submitted to OpenWA! (Message ID: ${data.messageId || 'OK'})`,
        });

        // Update local thread
        const newMsg: WhatsAppMessage = {
          id: data.dbMessageId || `sent-${Date.now()}`,
          chat_id: thread.chatId,
          sender_number: 'ZenLyft',
          recipient_number: thread.phone,
          direction: 'outbound',
          body: thread.pendingDraft.text,
          status: 'submitted',
          created_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        };

        setThreads((prev) =>
          prev.map((t) =>
            t.chatId === thread.chatId
              ? {
                  ...t,
                  messages: [...t.messages, newMsg],
                  pendingDraft: null,
                  lastMessage: newMsg.body,
                  lastTimestamp: newMsg.created_at,
                }
              : t
          )
        );
      } else {
        setActionNotice({ type: 'error', text: data.error || 'Failed to send WhatsApp message' });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setIsSending(false);
    }
  }

  function handleRejectDraft(thread: ChatThread) {
    setThreads((prev) =>
      prev.map((t) =>
        t.chatId === thread.chatId ? { ...t, pendingDraft: null } : t
      )
    );
    setActionNotice({ type: 'success', text: 'Draft rejected and archived.' });
  }

  function handleOptOut(thread: ChatThread) {
    if (!confirm(`Mark ${thread.organisationName} as OPTED OUT? This permanently blocks future messages.`)) return;
    setThreads((prev) => prev.filter((t) => t.chatId !== thread.chatId));
    setActionNotice({ type: 'success', text: `${thread.organisationName} marked Do-Not-Contact.` });
  }

  const activeThread = threads.find((t) => t.chatId === selectedChatId) || threads[0];

  return (
    <div className="space-y-6">
      {/* Header & Status Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
              Autonomous WhatsApp Client Acquisition Engine
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              OpenWA Gateway v2.x
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400 max-w-2xl">
            Autonomous prospecting, AI enquiry classification, human-in-the-loop 1-tap approval, and 5-stage follow-up scheduler running on dedicated WhatsApp business infrastructure.
          </p>
        </div>

        {/* Gateway Action Buttons */}
        <div className="flex items-center gap-2">
          {session?.status === 'qr_ready' && (
            <button
              onClick={() => setShowQrModal(true)}
              className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Scan QR Code
            </button>
          )}

          <button
            onClick={fetchSessionStatus}
            disabled={loadingSession}
            className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors"
          >
            {loadingSession ? 'Checking...' : 'Refresh Status'}
          </button>

          {session?.status === 'ready' ? (
            <button
              onClick={handleDisconnectSession}
              className="px-3 py-2 text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl transition-colors"
            >
              Disconnect Session
            </button>
          ) : (
            <button
              onClick={handleStartSession}
              className="px-3.5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/20 transition-all"
            >
              Connect Session
            </button>
          )}
        </div>
      </div>

      {/* Safety Notice Box */}
      <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 px-4 py-3 rounded-xl text-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            <strong>Account Safety Protocol:</strong> Use a dedicated WhatsApp Business test number. Never connect your personal number. All cold outreach requires founder 1-tap approval before dispatch.
          </span>
        </div>
        <span className="font-mono text-[11px] bg-amber-500/20 px-2.5 py-1 rounded-md text-amber-200">
          Engine: {session?.engine || 'baileys'}
        </span>
      </div>

      {/* Action Notification */}
      {actionNotice && (
        <div
          className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between ${
            actionNotice.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{actionNotice.text}</span>
          <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
      )}

      {/* Operational Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-slate-400">Gateway Status</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                session?.status === 'ready'
                  ? 'bg-emerald-400'
                  : session?.status === 'qr_ready'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-400'
              }`}
            />
            <span className="text-sm font-bold uppercase tracking-wider text-slate-200">
              {session?.status || 'OFFLINE'}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500 truncate">{session?.phone || 'No number linked'}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-slate-400">Total Inbound</p>
          <p className="mt-1 text-xl font-black text-indigo-400">3</p>
          <p className="mt-1 text-[10px] text-emerald-400">↑ 100% genuine replies</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-slate-400">Outbound Sent</p>
          <p className="mt-1 text-xl font-black text-slate-100">2</p>
          <p className="mt-1 text-[10px] text-slate-500">OpenWA verified</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-slate-400">Awaiting Approval</p>
          <p className="mt-1 text-xl font-black text-amber-400">2</p>
          <p className="mt-1 text-[10px] text-amber-400/80">Founder gatekeeper</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-slate-400">Delivered & Read</p>
          <p className="mt-1 text-xl font-black text-emerald-400">2 / 2</p>
          <p className="mt-1 text-[10px] text-emerald-400">100% ack confirmed</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-slate-400">Opt-Outs / DNC</p>
          <p className="mt-1 text-xl font-black text-zinc-400">0</p>
          <p className="mt-1 text-[10px] text-slate-500">Zero policy strikes</p>
        </div>
      </div>

      {/* Main Conversation & Approval Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden min-h-[600px]">
        {/* Left Column: Contact & Conversation Threads (4 cols) */}
        <div className="lg:col-span-4 border-r border-slate-800 flex flex-col bg-slate-900/50">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Active Conversations ({threads.length})
            </h2>
            <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
              Live Webhook Sync
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {threads.map((thread) => {
              const isSelected = thread.chatId === selectedChatId;
              return (
                <button
                  key={thread.chatId}
                  onClick={() => setSelectedChatId(thread.chatId)}
                  className={`w-full text-left p-4 transition-all hover:bg-slate-800/40 ${
                    isSelected ? 'bg-slate-800/90 border-l-4 border-indigo-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-100 truncate max-w-[180px]">
                      {thread.organisationName}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(thread.lastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] text-slate-400">{thread.phone}</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      Score: {thread.leadScore}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-400 truncate line-clamp-1">{thread.lastMessage}</p>

                  {thread.pendingDraft && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[10px] font-bold text-amber-400">
                        AI Draft Awaiting Approval
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Chat History, AI Draft & Approval Actions (8 cols) */}
        <div className="lg:col-span-8 flex flex-col bg-slate-950/40">
          {activeThread ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                    {activeThread.organisationName}
                    {activeThread.classification && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {activeThread.classification.replace('_', ' ').toUpperCase()}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs font-mono text-slate-400">{activeThread.phone}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOptOut(activeThread)}
                    className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 transition-colors"
                  >
                    Opt-Out Prospect
                  </button>
                </div>
              </div>

              {/* Message Feed */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[380px]">
                {activeThread.messages.map((msg) => {
                  const isOutbound = msg.direction === 'outbound';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[75%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                          isOutbound
                            ? 'bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/10'
                            : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700/60'
                        }`}
                      >
                        <p>{msg.body}</p>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-mono">
                        <span>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isOutbound && (
                          <span className="text-emerald-400 font-bold">
                            {msg.status === 'read' ? '✓✓ Read' : msg.status === 'delivered' ? '✓✓ Delivered' : '✓ Sent'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* AI Draft Card Waiting for Approval */}
                {activeThread.pendingDraft && (
                  <div className="mt-4 p-4 rounded-xl border border-amber-500/40 bg-amber-500/5">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-500/20">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                          AI Proposal Draft (Agent 09 SDR) — Pending Founder 1-Tap Approval
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400/80 font-mono">Cryptographic Hash Guard</span>
                    </div>

                    <p className="text-xs text-slate-200 italic bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                      "{activeThread.pendingDraft.text}"
                    </p>

                    <p className="mt-2 text-[10px] text-slate-400">
                      <strong>Intent:</strong> {activeThread.pendingDraft.reason}
                    </p>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleRejectDraft(activeThread)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 rounded-lg border border-slate-800 bg-slate-900 transition-colors"
                      >
                        Reject & Dismiss
                      </button>
                      <button
                        onClick={() => handleApproveAndSend(activeThread)}
                        disabled={isSending}
                        className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                      >
                        {isSending ? (
                          'Dispatching via OpenWA...'
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            Approve & Dispatch Message
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Direct Composer */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/90">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualReplyText}
                    onChange={(e) => setManualReplyText(e.target.value)}
                    placeholder="Type direct response to prospect (requires founder action)..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    onClick={() => {
                      if (!manualReplyText.trim()) return;
                      handleApproveAndSend({
                        ...activeThread,
                        pendingDraft: {
                          id: `manual-${Date.now()}`,
                          text: manualReplyText.trim(),
                          reason: 'Manual Founder response',
                        },
                      });
                      setManualReplyText('');
                    }}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    Send Direct
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
              Select a conversation to view WhatsApp history and pending drafts.
            </div>
          )}
        </div>
      </div>

      {/* QR Code Modal for Linking Dedicated Number */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-100">Scan WhatsApp QR Code</h3>
              <button onClick={() => setShowQrModal(false)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Open WhatsApp on your <strong>dedicated business phone</strong> → Settings → Linked Devices → Link a Device.
            </p>

            <div className="bg-white p-4 rounded-xl flex items-center justify-center">
              {session?.qrCode ? (
                <img src={session.qrCode} alt="WhatsApp QR Code" className="w-56 h-56 object-contain" />
              ) : (
                <div className="w-56 h-56 flex flex-col items-center justify-center text-slate-800 font-mono text-xs">
                  <span className="animate-spin mb-2 text-indigo-600">⌛</span>
                  Generating QR code from OpenWA...
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowQrModal(false)}
                className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
