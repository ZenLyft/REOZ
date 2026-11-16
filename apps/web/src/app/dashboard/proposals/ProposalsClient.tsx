'use client';

import React, { useState } from 'react';
import { ProposalPayload, buildProposalForProduct } from '@/lib/crm/proposals';

interface LeadOption {
  id: string;
  organisation_name: string;
  category: string;
  location: string;
  public_phone?: string | null;
}

interface ProposalsClientProps {
  initialLeads: LeadOption[];
}

export function ProposalsClient({ initialLeads }: ProposalsClientProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<string>(
    initialLeads[0]?.id || ''
  );
  const [servicePackage, setServicePackage] = useState<
    'website_booking' | 'website_starter' | 'homs_pilot'
  >('website_booking');
  const [customPrice, setCustomPrice] = useState<number>(25000);
  const [copied, setCopied] = useState<boolean>(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  const selectedLead = initialLeads.find((l) => l.id === selectedLeadId) || initialLeads[0];

  const proposal: ProposalPayload = buildProposalForProduct({
    leadId: selectedLead?.id || 'sample',
    division: servicePackage === 'homs_pilot' ? 'division_b_institutional' : 'division_a_digital',
    serviceLine: servicePackage,
    clientName: selectedLead?.organisation_name || 'Client Business',
    customQuoteInr: customPrice,
  });

  const whatsappSummary = `*COMMERCIAL PROPOSAL: ${proposal.productName.toUpperCase()}*
Client: *${selectedLead?.organisation_name || 'Your Team'}*
Provider: *ZenLyft (Coimbatore, Tamil Nadu)*
Founder: *Niresh Senthoor (CEO)*

━━━━━━━━━━━━━━━━━━━━
*1. PROJECT DELIVERABLES:*
${proposal.deliverables.map((d, i) => `• *${d.title}*: ${d.description}`).join('\n')}

*2. TIMELINE & IMPLEMENTATION:*
• Turnaround: *${proposal.timelineDays} business days* to live deployment.
• Includes: Complete architecture, local Google Maps SEO, and 1-year cloud hosting with SSL.

*3. COMMERCIAL TERMS & INVESTMENT:*
• Total Package: *₹${proposal.quoteInr.toLocaleString('en-IN')}*
• Advance (50% on Kickoff): *₹${proposal.paymentMilestones[0]?.amountInr.toLocaleString('en-IN')}*
• Balance (50% on Go-Live): *₹${proposal.paymentMilestones[1]?.amountInr.toLocaleString('en-IN')}*

*4. PAYMENT DETAILS (ZENLYFT):*
• UPI ID: *8015929139@upi*
• Official Website: https://zenlyft.in
• Direct Contact: +91 80159 29139

Would you like us to generate the formal invoice and begin kickoff this week?`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(whatsappSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendViaWhatsApp = async () => {
    if (!selectedLead?.public_phone) {
      alert('Selected lead has no phone number on file. Please select a lead with a phone or copy text.');
      return;
    }
    setDispatchStatus('Dispatching via WhatsApp Gateway...');
    try {
      const cleanPhone = selectedLead.public_phone.replace(/\D/g, '');
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientNumber: finalPhone,
          text: whatsappSummary,
          approvalId: 'direct_proposal_dispatch',
          leadId: selectedLead.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDispatchStatus(`✓ Proposal dispatched to +${finalPhone}! Check your WhatsApp chat.`);
      } else {
        setDispatchStatus(`Notice: ${data.error || 'Failed to dispatch'}`);
      }
    } catch (err: any) {
      setDispatchStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#151B2B] tracking-tight">
            Commercial Proposals & Invoices
          </h1>
          <p className="mt-1 text-xs text-[#525A6B]">
            Generate ready-to-close ZenLyft client proposals, scope of work agreements, and advance payment invoices in seconds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 text-xs font-bold text-[#151B2B] bg-[#FFFFFF] border border-[#D0D5DD] hover:bg-[#ECEFF3] rounded-xl shadow-xs transition"
          >
            🖨️ Print / Save PDF
          </button>
          <button
            type="button"
            onClick={copyToClipboard}
            className="px-4 py-2 text-xs font-bold text-[#F5F6F8] bg-[#151B2B] hover:bg-[#2B313C] rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <span>{copied ? '✓ Copied!' : '📋 Copy WhatsApp Quote'}</span>
          </button>
        </div>
      </div>

      {/* Control Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#FFFFFF] p-4 rounded-2xl border border-[#E4E7EC] shadow-xs">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-1">
            Target Prospect
          </label>
          <select
            value={selectedLeadId}
            onChange={(e) => setSelectedLeadId(e.target.value)}
            className="w-full text-xs font-semibold text-[#151B2B] bg-[#F5F6F8] border border-[#D0D5DD] rounded-xl px-3 py-2"
          >
            {initialLeads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.organisation_name} ({lead.category || 'Business'})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-1">
            Product Package
          </label>
          <select
            value={servicePackage}
            onChange={(e) => {
              const val = e.target.value as any;
              setServicePackage(val);
              setCustomPrice(val === 'homs_pilot' ? 85000 : val === 'website_booking' ? 25000 : 9999);
            }}
            className="w-full text-xs font-semibold text-[#151B2B] bg-[#F5F6F8] border border-[#D0D5DD] rounded-xl px-3 py-2"
          >
            <option value="website_booking">
              Engine A: Web Platform + WhatsApp Booking (₹25,000)
            </option>
            <option value="website_starter">
              Engine A: Web Showcase Starter (₹9,999)
            </option>
            <option value="homs_pilot">
              Engine B: Institutional HOMS Campus License (₹85,000)
            </option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-1">
            Quotation Amount (INR ₹)
          </label>
          <input
            type="number"
            value={customPrice}
            onChange={(e) => setCustomPrice(Number(e.target.value))}
            className="w-full text-xs font-semibold text-[#151B2B] bg-[#F5F6F8] border border-[#D0D5DD] rounded-xl px-3 py-2"
          />
        </div>
      </div>

      {dispatchStatus && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-medium text-blue-900 flex items-center justify-between">
          <span>{dispatchStatus}</span>
          <button onClick={() => setDispatchStatus(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Official Branded Document Preview */}
      <div id="printable-proposal" className="bg-[#FFFFFF] border border-[#E4E7EC] rounded-2xl p-6 sm:p-10 space-y-8 shadow-sm">
        {/* Document Header */}
        <div className="border-b border-[#ECEFF3] pb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#151B2B] text-[#F5F6F8] font-black text-xl flex items-center justify-center border-b-4 border-[#FF6B35]">
              Z
            </div>
            <div>
              <h2 className="text-lg font-black text-[#151B2B] tracking-tight">ZENLYFT</h2>
              <p className="text-xs text-[#525A6B]">Technology, AI & Business Automation Solutions</p>
              <p className="text-[11px] text-[#667085]">Coimbatore, Tamil Nadu • https://zenlyft.in</p>
            </div>
          </div>

          <div className="sm:text-right text-xs space-y-1">
            <div className="font-bold text-[#151B2B]">COMMERCIAL QUOTATION & SOW</div>
            <div className="text-[#667085]">Ref: ZL-2026-{proposal.leadId.slice(0, 6).toUpperCase()}</div>
            <div className="text-[#667085]">Date: {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</div>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
              Founder Approved
            </span>
          </div>
        </div>

        {/* Client & Executive Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-[#F5F6F8] p-5 rounded-xl border border-[#E4E7EC]">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Prepared Exclusively For:</span>
            <h3 className="mt-1 text-base font-black text-[#151B2B]">{selectedLead?.organisation_name}</h3>
            <p className="text-xs text-[#525A6B]">{selectedLead?.location} • {selectedLead?.category}</p>
            {selectedLead?.public_phone && (
              <p className="mt-1 text-xs font-mono text-[#151B2B]">Verified Contact: +{selectedLead.public_phone}</p>
            )}
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Project Summary:</span>
            <h4 className="mt-1 text-xs font-bold text-[#151B2B]">{proposal.productName}</h4>
            <p className="mt-1 text-xs text-[#525A6B] leading-relaxed">{proposal.scope}</p>
          </div>
        </div>

        {/* Deliverables Checklist */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#151B2B]">
            Verified Scope & Deliverables
          </h3>
          <div className="divide-y divide-[#ECEFF3] border border-[#E4E7EC] rounded-xl overflow-hidden">
            {proposal.deliverables.map((item, idx) => (
              <div key={idx} className="p-3.5 bg-[#FFFFFF] flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  ✓
                </span>
                <div>
                  <h4 className="text-xs font-bold text-[#151B2B]">{item.title}</h4>
                  <p className="text-[11px] text-[#525A6B] mt-0.5">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Commercial Investment & Milestones */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#151B2B]">
            Commercial Investment & Payment Milestones
          </h3>
          <div className="border border-[#E4E7EC] rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F5F6F8] text-[#525A6B] font-bold border-b border-[#E4E7EC]">
                <tr>
                  <th className="p-3">Milestone Stage</th>
                  <th className="p-3">Terms / Condition</th>
                  <th className="p-3">Share</th>
                  <th className="p-3 text-right">Amount (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEFF3]">
                {proposal.paymentMilestones.map((m, idx) => (
                  <tr key={idx} className="hover:bg-[#F9FAFB]">
                    <td className="p-3 font-bold text-[#151B2B]">{m.milestone}</td>
                    <td className="p-3 text-[#525A6B]">{m.condition}</td>
                    <td className="p-3 font-mono">{m.percentage}%</td>
                    <td className="p-3 text-right font-black font-mono text-[#151B2B]">
                      ₹{m.amountInr.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#FFF1EC]/50 font-black text-sm">
                  <td colSpan={3} className="p-3 text-[#E05220]">
                    Total Commercial Investment (Turnaround: {proposal.timelineDays} Days)
                  </td>
                  <td className="p-3 text-right text-[#E05220] font-mono">
                    ₹{proposal.quoteInr.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Transfer Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#F5F6F8] p-5 rounded-xl border border-[#E4E7EC]">
          <div>
            <h4 className="text-xs font-black text-[#151B2B] uppercase tracking-wide">
              Bank Wire & UPI Remittance Details
            </h4>
            <div className="mt-2 text-xs space-y-1 text-[#525A6B]">
              <p>• Payee: <strong className="text-[#151B2B]">ZenLyft Operations / Niresh Senthoor</strong></p>
              <p>• UPI ID: <strong className="font-mono text-[#151B2B]">8015929139@upi</strong></p>
              <p>• Location: <strong className="text-[#151B2B]">Coimbatore, Tamil Nadu, India</strong></p>
              <p>• Support & Inquiries: <strong className="text-[#151B2B]">niresh@zenlyft.in</strong></p>
            </div>
          </div>
          <div className="flex flex-col justify-end text-xs sm:text-right space-y-1 text-[#667085]">
            <p>Authorized Signature:</p>
            <div className="font-serif italic text-base font-bold text-[#151B2B] mt-2">Niresh Senthoor</div>
            <p className="text-[11px]">Founder & CEO, ZenLyft</p>
            <p className="text-[10px]">Document generated autonomously via REOZ Operating Engine</p>
          </div>
        </div>

        {/* Direct Action Bar */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECEFF3]">
          <span className="text-xs text-[#525A6B]">
            Ready to close? Send this quotation directly to the prospect's WhatsApp or email.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendViaWhatsApp}
              className="px-4 py-2 text-xs font-bold text-[#F5F6F8] bg-emerald-700 hover:bg-emerald-800 rounded-xl transition shadow-xs flex items-center gap-1.5"
            >
              <span>💬 Send to Client via WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={copyToClipboard}
              className="px-4 py-2 text-xs font-bold text-[#F5F6F8] bg-[#151B2B] hover:bg-[#2B313C] rounded-xl transition shadow-xs"
            >
              📋 Copy Pitch Text
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

