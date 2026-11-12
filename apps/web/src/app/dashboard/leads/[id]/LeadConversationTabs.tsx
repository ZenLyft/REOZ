'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface UnifiedTimelineEvent {
  id: string;
  channel: 'whatsapp' | 'email';
  direction: 'inbound' | 'outbound';
  sender: string;
  recipient: string;
  subject?: string | null;
  body: string;
  status?: string | null;
  classification?: string | null;
  hasPromptInjection?: boolean;
  timestamp: string;
}

export interface EmailReplySuggestion {
  conversationId: string;
  subject: string;
  classification?: string | null;
  suggestedReply: string;
  rationale?: string | null;
}

interface LeadConversationTabsProps {
  leadId: string;
  organisationName: string;
  defaultEmail: string;
  defaultPhone: string;
  selectedSenderEmail?: string | null;
  events: UnifiedTimelineEvent[];
  suggestions: EmailReplySuggestion[];
}

export function LeadConversationTabs({
  leadId,
  organisationName,
  defaultEmail,
  defaultPhone,
  selectedSenderEmail,
  events,
  suggestions,
}: LeadConversationTabsProps) {
  const [tab, setTab] = useState<'all' | 'whatsapp' | 'email'>('all');
  const [composeChannel, setComposeChannel] = useState<'email' | 'whatsapp'>(
    defaultEmail ? 'email' : 'whatsapp'
  );
  const [recipient, setRecipient] = useState<string>(defaultEmail || defaultPhone || '');
  const [subject, setSubject] = useState<string>(
    suggestions[0]?.subject ? `Re: ${suggestions[0].subject.replace(/^Re:\s*/i, '')}` : `ZenLyft Follow-up for ${organisationName}`
  );
  const [body, setBody] = useState<string>(suggestions[0]?.suggestedReply || '');
  const [rationale, setRationale] = useState<string>(
    suggestions[0]?.rationale || 'Follow-up drafted in Lead workspace (requires Founder approval before send).'
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const visibleEvents = events.filter((ev) => (tab === 'all' ? true : ev.channel === tab));
  const latestSuggestion = suggestions.find((s) => Boolean(s.suggestedReply));

  function handleSwitchChannel(next: 'email' | 'whatsapp') {
    setComposeChannel(next);
    setRecipient(next === 'email' ? defaultEmail : defaultPhone);
    setNotice(null);
  }

  async function handleQueueDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setNotice({ type: 'error', text: 'Draft message body cannot be empty.' });
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      if (composeChannel === 'email') {
        const res = await fetch('/api/email/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId,
            recipientEmail: recipient.trim(),
            senderAddress: selectedSenderEmail || undefined,
            subject: subject.trim(),
            textBody: body.trim(),
            rationale: rationale.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || data?.detail || 'Failed to queue email approval draft.');
        }
        setNotice({
          type: 'success',
          text: 'Email draft queued for Founder Approval Inbox. Nothing was sent automatically.',
        });
      } else {
        const res = await fetch(`/api/leads/${leadId}/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customWhatsAppDraft: body.trim(), targetPhone: recipient.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to queue WhatsApp approval draft.');
        }
        setNotice({
          type: 'success',
          text: 'WhatsApp follow-up queued in Founder Approval Inbox.',
        });
      }
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to queue approval draft.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#ECEFF3] pb-3">
        <div>
          <h2 className="text-sm font-bold text-[#151B2B]">
            Unified Prospect Conversations (WhatsApp + Email)
          </h2>
          <p className="text-xs text-[#525A6B] mt-0.5">
            Every outbound &amp; inbound message synced under one CRM lead record. AI suggestions never auto-send without Founder approval.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {(['all', 'whatsapp', 'email'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                tab === t
                  ? 'bg-[#151B2B] text-[#F5F6F8]'
                  : 'border border-[#E4E7EC] bg-[#F5F6F8] text-[#525A6B] hover:text-[#151B2B]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {latestSuggestion && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-amber-950">
              AI Reply Suggestion ({latestSuggestion.classification || 'Classified'}) — Human Approval Required
            </span>
            <button
              type="button"
              onClick={() => {
                setComposeChannel('email');
                setRecipient(defaultEmail);
                setSubject(`Re: ${latestSuggestion.subject.replace(/^Re:\s*/i, '')}`);
                setBody(latestSuggestion.suggestedReply);
                setRationale(latestSuggestion.rationale || 'AI-assisted reply loaded for Founder review.');
              }}
              className="rounded-lg bg-[#151B2B] px-3 py-1 text-[11px] font-bold text-[#F5F6F8]"
            >
              Load into Draft Composer
            </button>
          </div>
          <p className="text-amber-900 whitespace-pre-wrap">{latestSuggestion.suggestedReply}</p>
          {latestSuggestion.rationale && (
            <p className="text-[11px] text-amber-800">{latestSuggestion.rationale}</p>
          )}
        </div>
      )}

      {/* Timeline */}
      {visibleEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#D0D5DD] bg-[#F5F6F8] p-5 text-center text-xs text-[#525A6B]">
          No {tab === 'all' ? 'WhatsApp or Email' : tab.toUpperCase()} messages recorded for {organisationName} yet.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
          {visibleEvents.map((ev) => (
            <div
              key={ev.id}
              className={`rounded-xl border p-3.5 text-xs space-y-1.5 ${
                ev.direction === 'inbound'
                  ? 'border-sky-200 bg-sky-50/40'
                  : 'border-[#E4E7EC] bg-[#F9FAFB]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      ev.channel === 'email'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {ev.channel}
                  </span>
                  <span className="font-bold text-[#151B2B]">
                    {ev.direction === 'inbound' ? `Inbound from ${ev.sender}` : `Outbound to ${ev.recipient}`}
                  </span>
                  {ev.classification && (
                    <span className="rounded bg-[#ECEFF3] px-1.5 py-0.5 text-[10px] font-bold text-[#525A6B]">
                      {ev.classification}
                    </span>
                  )}
                  {ev.hasPromptInjection && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                      Prompt Injection Ignored
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[#667085]">
                  {ev.status ? `${ev.status} • ` : ''}
                  {new Date(ev.timestamp).toLocaleString()}
                </span>
              </div>
              {ev.subject && (
                <div className="font-semibold text-[#151B2B]">Subject: {ev.subject}</div>
              )}
              <div className="text-[#525A6B] whitespace-pre-wrap leading-relaxed">{ev.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* Approval-Gated Reply / Outreach Composer */}
      <form onSubmit={handleQueueDraft} className="rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-[#151B2B]">
            Queue New Reply / Follow-up Draft (Founder Approval Gate)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleSwitchChannel('email')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                composeChannel === 'email'
                  ? 'bg-[#EA580C] text-white'
                  : 'border border-[#D0D5DD] bg-white text-[#525A6B]'
              }`}
            >
              Email (Zoho)
            </button>
            <button
              type="button"
              onClick={() => handleSwitchChannel('whatsapp')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                composeChannel === 'whatsapp'
                  ? 'bg-emerald-700 text-white'
                  : 'border border-[#D0D5DD] bg-white text-[#525A6B]'
              }`}
            >
              WhatsApp
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#525A6B] mb-1">
              Recipient ({composeChannel === 'email' ? 'Email Address' : 'WhatsApp Number'})
            </label>
            <input
              type="text"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={composeChannel === 'email' ? 'founder@company.com' : '+91...'}
              className="w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs text-[#151B2B]"
            />
          </div>

          {composeChannel === 'email' && (
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#525A6B] mb-1">
                Email Subject
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs text-[#151B2B]"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase text-[#525A6B] mb-1">
            Message Body (Queued as DRAFT_PENDING — requires approval before send)
          </label>
          <textarea
            rows={4}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#151B2B]"
          />
        </div>

        {notice && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs font-semibold flex items-center justify-between ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            <span>{notice.text}</span>
            <Link href="/dashboard/approvals" className="underline font-bold ml-3">
              Open Approval Inbox &rarr;
            </Link>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#151B2B] hover:bg-[#2B313C] disabled:opacity-50 px-4 py-2 text-xs font-bold text-[#F5F6F8]"
          >
            {saving ? 'Queueing Draft...' : 'Save to Approval Inbox'}
          </button>
        </div>
      </form>
    </div>
  );
}

