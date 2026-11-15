'use client';

import React, { useState } from 'react';
import { PipelineStage, RevenueDivision } from '@/lib/types/database';
import { updateLeadStageAction } from '../actions';
import { VALID_TRANSITIONS } from '@/lib/crm/leads';

interface CommercialOperationsClientProps {
  leadId: string;
  leadName: string;
  category: string;
  location: string;
  currentStage: PipelineStage;
  revenueDivision: RevenueDivision;
  estimatedValueInr?: number;
  approvedQuoteInr?: number;
  grossMarginPercent?: number;
  currentUserRole: string;
}

export function CommercialOperationsClient({
  leadId,
  leadName,
  category,
  location,
  currentStage: initialStage,
  revenueDivision,
  estimatedValueInr = 0,
  approvedQuoteInr = 0,
  grossMarginPercent = 0,
  currentUserRole,
}: CommercialOperationsClientProps) {
  const [stage, setStage] = useState<PipelineStage>(initialStage);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Meeting Modal State
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [meetingBrief, setMeetingBrief] = useState<any>(null);

  // Proposal Modal State
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>(
    revenueDivision === 'division_b_institutional' ? 'homs_pilot' : 'website_booking'
  );
  const [customPrice, setCustomPrice] = useState<number>(
    revenueDivision === 'division_b_institutional' ? 85000 : 17999
  );
  const [generatedProposal, setGeneratedProposal] = useState<any>(null);

  // Onboarding Modal State
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [onboardingService, setOnboardingService] = useState('website_project');
  const [onboardingProject, setOnboardingProject] = useState<any>(null);

  const allowedTransitions = VALID_TRANSITIONS[stage] || [];

  async function handleStageChange(newStage: PipelineStage) {
    if (newStage === stage) return;
    setIsUpdating(true);
    setNotice(null);

    let reason: string | undefined;
    if (newStage === 'lost' || newStage === 'disqualified') {
      const inputReason = window.prompt(`Reason for marking this lead as ${newStage}:`);
      if (!inputReason) {
        setIsUpdating(false);
        return;
      }
      reason = inputReason;
    }

    const res = await updateLeadStageAction(leadId, newStage, reason);
    setIsUpdating(false);

    if (res.success) {
      setStage(newStage);
      setNotice({ type: 'success', text: `Lead moved to ${newStage.toUpperCase()}` });
    } else {
      setNotice({ type: 'error', text: res.error || 'Failed to update stage' });
    }
  }

  async function handleScheduleMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!meetingDate) return;
    setIsUpdating(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          scheduledAt: meetingDate,
          meetingLink,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMeetingBrief(data.meeting.brief);
        setStage('meeting');
        setNotice({ type: 'success', text: 'Meeting scheduled & AI Brief generated!' });
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to schedule meeting' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error scheduling meeting' });
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleGenerateProposal(e: React.FormEvent) {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          serviceLine: selectedProduct,
          customQuoteInr: customPrice,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedProposal(data.proposal);
        setStage('proposal');
        setNotice({ type: 'success', text: 'Proposal generated & submitted for review!' });
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to generate proposal' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error generating proposal' });
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleStartOnboarding() {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          serviceLine: onboardingService,
          contractedValueInr: customPrice,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOnboardingProject(data.onboarding);
        setStage('onboarding');
        setNotice({ type: 'success', text: 'Customer onboarding initiated with 6-point delivery checklist!' });
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to initiate onboarding' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error initiating onboarding' });
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[#E4E7EC] pb-3">
        <div>
          <h2 className="text-sm font-bold text-[#151B2B]">Commercial Deal Console</h2>
          <span className="text-[11px] font-mono text-[#525A6B]">
            {revenueDivision === 'division_b_institutional' ? 'Division B: Institutional Tech' : 'Division A: Digital Solutions'}
          </span>
        </div>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold border border-[#FF6B35] bg-[#151B2B] text-white">
          {stage.toUpperCase()}
        </span>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-xl text-xs font-medium ${
            notice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Stage Progression Selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-[#525A6B]">Advance Deal Stage:</label>
        <select
          disabled={isUpdating || allowedTransitions.length === 0}
          value={stage}
          onChange={(e) => handleStageChange(e.target.value as PipelineStage)}
          className="w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-2 text-xs font-semibold text-[#151B2B] focus:border-[#FF6B35] focus:outline-none disabled:opacity-40"
        >
          <option value={stage} disabled>
            Current: {stage}
          </option>
          {allowedTransitions.map((st) => (
            <option key={st} value={st}>
              &rarr; Move to: {st.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          onClick={() => setShowMeetingModal(true)}
          className="px-3 py-2 rounded-xl text-xs font-bold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition text-center"
        >
          📅 Meeting & AI Brief
        </button>

        <button
          onClick={() => setShowProposalModal(true)}
          className="px-3 py-2 rounded-xl text-xs font-bold border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition text-center"
        >
          📄 Create Proposal
        </button>
      </div>

      {(stage === 'agreement' || stage === 'payment_pending' || stage === 'paid' || stage === 'onboarding') && (
        <button
          onClick={() => setShowOnboardingModal(true)}
          className="w-full mt-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition text-center shadow-sm"
        >
          🚀 Initiate Customer Onboarding
        </button>
      )}

      {/* Meeting Modal */}
      {showMeetingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-w-lg w-full bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-[#151B2B]">Schedule Discovery Meeting</h3>
              <button onClick={() => setShowMeetingModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleScheduleMeeting} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">Meeting Date & Time:</label>
                <input
                  type="datetime-local"
                  required
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="w-full mt-1 border rounded-xl p-2 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">Meeting Link (Google Meet / Zoom):</label>
                <input
                  type="text"
                  placeholder="https://meet.google.com/..."
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  className="w-full mt-1 border rounded-xl p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMeetingModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
                >
                  Confirm & Generate AI Brief
                </button>
              </div>
            </form>

            {meetingBrief && (
              <div className="mt-4 p-4 bg-slate-50 border rounded-xl space-y-3 text-xs">
                <h4 className="font-bold text-slate-800">AI Meeting Brief & Discovery Questions</h4>
                <div className="text-slate-600">
                  <span className="font-bold">Demo Focus:</span> {meetingBrief.demoFocus}
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-slate-700">Questions to ask:</span>
                  {meetingBrief.discoveryQuestions.map((q: string, i: number) => (
                    <div key={i} className="pl-2 border-l-2 border-indigo-400 text-slate-600">
                      • {q}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Proposal Modal */}
      {showProposalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-w-lg w-full bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-[#151B2B]">Generate Commercial Proposal</h3>
              <button onClick={() => setShowProposalModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleGenerateProposal} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">Product / Package:</label>
                <select
                  value={selectedProduct}
                  onChange={(e) => {
                    setSelectedProduct(e.target.value);
                    if (e.target.value === 'website_starter') setCustomPrice(9999);
                    if (e.target.value === 'website_booking') setCustomPrice(17999);
                    if (e.target.value === 'homs_pilot') setCustomPrice(85000);
                  }}
                  className="w-full mt-1 border rounded-xl p-2 text-xs"
                >
                  <option value="website_starter">Division A: Website Starter (₹9,999)</option>
                  <option value="website_booking">Division A: Website + Booking/WhatsApp (₹17,999)</option>
                  <option value="homs_pilot">Division B: HOMS Annual Campus License (₹85,000)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">Quote Price (₹ INR):</label>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(Number(e.target.value))}
                  className="w-full mt-1 border rounded-xl p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProposalModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700"
                >
                  Generate Proposal
                </button>
              </div>
            </form>

            {generatedProposal && (
              <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-900">{generatedProposal.product_name}</span>
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    Margin: {generatedProposal.gross_margin_percent}%
                  </span>
                </div>
                <p className="text-slate-600">{generatedProposal.scope}</p>
                <div className="pt-2 font-bold text-purple-950">
                  Total Quote: ₹{generatedProposal.quote_inr.toLocaleString('en-IN')} (Status: {generatedProposal.status})
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      {showOnboardingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-w-lg w-full bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-[#151B2B]">Initiate Customer Onboarding</h3>
              <button onClick={() => setShowOnboardingModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">Select Service Line Checklist:</label>
                <select
                  value={onboardingService}
                  onChange={(e) => setOnboardingService(e.target.value)}
                  className="w-full mt-1 border rounded-xl p-2 text-xs"
                >
                  <option value="website_project">Website Project (6-step delivery)</option>
                  <option value="booking_enquiry">Booking & WhatsApp System (5-step delivery)</option>
                  <option value="business_automation">Business Automation (5-step delivery)</option>
                  <option value="homs_pilot">HOMS Institutional Pilot (6-step delivery)</option>
                  <option value="campus_node">Campus Node Deployment (4-step delivery)</option>
                  <option value="custom_software">Custom Software (5-step delivery)</option>
                </select>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                ⚠️ Independent payment verification required before delivery go-live.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOnboardingModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartOnboarding}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700"
                >
                  Launch Onboarding Checklist
                </button>
              </div>

              {onboardingProject && (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs">
                  <h4 className="font-bold text-emerald-900">Checklist Provisioned:</h4>
                  {onboardingProject.checklist.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2 text-slate-700">
                      <span>•</span>
                      <span>{item.title} ({item.assignedRole})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

