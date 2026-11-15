'use client';

import { useState } from 'react';
import { updateLeadStageAction } from './actions';
import { PipelineStage } from '@/lib/types/database';
import { VALID_TRANSITIONS } from '@/lib/crm/leads';

interface LeadItem {
  id: string;
  organisation_name: string;
  category: string;
  location: string;
  website_url?: string | null;
  website_status: string;
  pipeline_stage: PipelineStage;
  contact_restriction: 'none' | 'do_not_contact' | 'opt_out';
  next_action?: string | null;
  score?: number | null;
  owner_id?: string | null;
  created_at: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
}

interface LeadsTableClientProps {
  initialLeads: LeadItem[];
  canAssign?: boolean;
  teamMembers?: TeamMember[];
}

export function LeadsTableClient({
  initialLeads,
  canAssign = false,
  teamMembers = [],
}: LeadsTableClientProps) {
  const [leads, setLeads] = useState<LeadItem[]>(initialLeads);
  const [filterStage, setFilterStage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  async function handleAssignLead(leadId: string, newOwnerId: string) {
    setAssigningId(leadId);
    try {
      const res = await fetch('/api/leads/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: [leadId],
          assignedTo: newOwnerId === 'unassigned' ? null : newOwnerId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? { ...l, owner_id: newOwnerId === 'unassigned' ? null : newOwnerId }
              : l
          )
        );
      } else {
        alert(`Error assigning lead: ${data.error}`);
      }
    } catch {
      alert('Network error while assigning lead');
    } finally {
      setAssigningId(null);
    }
  }

  const filteredLeads = leads.filter((lead) => {
    const matchesStage = filterStage === 'all' || lead.pipeline_stage === filterStage;
    const matchesSearch =
      lead.organisation_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStage && matchesSearch;
  });

  async function handleStageChange(
    leadId: string,
    currentStage: PipelineStage,
    newStage: PipelineStage
  ) {
    if (newStage === currentStage) return;
    setUpdatingId(leadId);

    let reason: string | undefined;
    if (newStage === 'lost') {
      const inputReason = window.prompt('Reason for marking this lead as Lost:');
      if (!inputReason) {
        setUpdatingId(null);
        return;
      }
      reason = inputReason;
    }

    const res = await updateLeadStageAction(leadId, newStage, reason);
    setUpdatingId(null);

    if (res.success) {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: newStage } : l))
      );
    } else {
      alert(`Error updating stage: ${res.error}`);
    }
  }

  const stageBadgeColors: Record<PipelineStage, string> = {
    discovered: 'bg-[#ECEFF3] text-[#525A6B] border-[#D0D5DD]',
    qualified: 'bg-[#151B2B] text-[#F5F6F8] border-[#FF6B35]',
    contacted: 'bg-sky-50 text-sky-900 border-sky-200',
    responded: 'bg-amber-50 text-amber-900 border-amber-200',
    replied: 'bg-amber-50 text-amber-900 border-amber-200',
    meeting: 'bg-indigo-50 text-indigo-900 border-indigo-200',
    requirements_confirmed: 'bg-blue-50 text-blue-900 border-blue-200',
    proposal: 'bg-purple-50 text-purple-900 border-purple-200',
    negotiation: 'bg-violet-50 text-violet-900 border-violet-200',
    agreement: 'bg-emerald-50 text-emerald-900 border-emerald-300',
    payment_pending: 'bg-yellow-50 text-yellow-900 border-yellow-300',
    paid: 'bg-emerald-600 text-white border-emerald-700',
    won: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    onboarding: 'bg-teal-50 text-teal-900 border-teal-200',
    active_project: 'bg-cyan-50 text-cyan-900 border-cyan-200',
    completed: 'bg-slate-800 text-white border-slate-900',
    lost: 'bg-red-50 text-red-800 border-red-200',
    disqualified: 'bg-slate-200 text-slate-700 border-slate-300',
    not_a_fit: 'bg-[#ECEFF3] text-[#667085] border-[#E4E7EC]',
    do_not_contact: 'bg-red-700 text-[#F5F6F8] border-red-800',
    on_hold: 'bg-amber-50 text-amber-800 border-amber-200',
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search leads by name, category, or city..."
            className="w-full rounded-xl border border-[#D0D5DD] bg-[#FFFFFF] px-4 py-2.5 text-sm text-[#151B2B] placeholder-[#667085] focus:border-[#FF6B35] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-[#525A6B]">Stage:</label>
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="rounded-xl border border-[#D0D5DD] bg-[#FFFFFF] px-3 py-2 text-sm text-[#151B2B] focus:border-[#FF6B35] focus:outline-none"
          >
            <option value="all">All Stages ({leads.length})</option>
            <option value="discovered">Discovered</option>
            <option value="qualified">Qualified</option>
            <option value="contacted">Contacted</option>
            <option value="responded">Responded</option>
            <option value="meeting">Meeting</option>
            <option value="proposal">Proposal</option>
            <option value="agreement">Agreement</option>
            <option value="paid">Paid</option>
            <option value="onboarding">Onboarding</option>
            <option value="active_project">Active Project</option>
            <option value="completed">Completed</option>
            <option value="lost">Lost</option>
            <option value="disqualified">Disqualified</option>
            <option value="do_not_contact">Do Not Contact</option>
          </select>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] md:block shadow-sm">
        <table className="w-full text-left text-sm text-[#151B2B]">
          <thead className="border-b border-[#E4E7EC] bg-[#F5F6F8] text-[11px] font-bold uppercase tracking-wider text-[#667085]">
            <tr>
              <th className="px-5 py-3.5">Organisation</th>
              <th className="px-4 py-3.5">Category & Location</th>
              <th className="px-4 py-3.5">Score</th>
              <th className="px-4 py-3.5">Stage</th>
              <th className="px-4 py-3.5">Assigned To</th>
              <th className="px-4 py-3.5">Quick Stage Action</th>
              <th className="px-5 py-3.5 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECEFF3]">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-[#667085]">
                  No prospects found matching your filter.
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => {
                const allowedTransitions = VALID_TRANSITIONS[lead.pipeline_stage] || [];
                const assignedMember = teamMembers.find((m) => m.id === lead.owner_id);

                return (
                  <tr key={lead.id} className="hover:bg-[#F5F6F8]">
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#151B2B]">{lead.organisation_name}</div>
                      {lead.contact_restriction === 'do_not_contact' && (
                        <span className="mt-0.5 inline-block rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          DNC RESTRICTED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[#151B2B] font-medium">{lead.category}</div>
                      <div className="text-xs text-[#525A6B]">{lead.location}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-mono text-xs font-bold text-[#151B2B]">
                        {lead.score ?? '—'}/100
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                          stageBadgeColors[lead.pipeline_stage]
                        }`}
                      >
                        {lead.pipeline_stage}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {canAssign ? (
                        <select
                          disabled={assigningId === lead.id}
                          value={lead.owner_id || 'unassigned'}
                          onChange={(e) => handleAssignLead(lead.id, e.target.value)}
                          className="rounded-lg border border-[#D0D5DD] bg-[#FFFFFF] px-2.5 py-1 text-xs text-[#151B2B] focus:border-[#FF6B35] focus:outline-none disabled:opacity-40"
                        >
                          <option value="unassigned">-- Unassigned --</option>
                          {teamMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name || m.email} ({m.role})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-medium text-[#525A6B]">
                          {assignedMember ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              {assignedMember.name || assignedMember.email}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <select
                        disabled={updatingId === lead.id || allowedTransitions.length === 0}
                        value={lead.pipeline_stage}
                        onChange={(e) =>
                          handleStageChange(
                            lead.id,
                            lead.pipeline_stage,
                            e.target.value as PipelineStage
                          )
                        }
                        className="rounded-lg border border-[#D0D5DD] bg-[#F5F6F8] px-2.5 py-1 text-xs text-[#151B2B] focus:border-[#FF6B35] focus:outline-none disabled:opacity-40"
                      >
                        <option value={lead.pipeline_stage} disabled>
                          Move stage...
                        </option>
                        {allowedTransitions.map((stage) => (
                          <option key={stage} value={stage}>
                            → {stage}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <a
                        href={`/dashboard/leads/${lead.id}`}
                        className="rounded-lg border border-[#D0D5DD] bg-[#ECEFF3] px-3 py-1.5 text-xs font-bold text-[#151B2B] hover:bg-[#FF6B35] hover:border-[#FF6B35] hover:text-[#F5F6F8] transition"
                      >
                        Inspect &rarr;
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-3 md:hidden">
        {filteredLeads.length === 0 ? (
          <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-6 text-center text-[#667085]">
            No leads found.
          </div>
        ) : (
          filteredLeads.map((lead) => {
            const allowedTransitions = VALID_TRANSITIONS[lead.pipeline_stage] || [];
            return (
              <div
                key={lead.id}
                className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[#151B2B]">{lead.organisation_name}</h3>
                    <p className="text-xs text-[#525A6B]">
                      {lead.category} • {lead.location}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                      stageBadgeColors[lead.pipeline_stage]
                    }`}
                  >
                    {lead.pipeline_stage}
                  </span>
                </div>

                {canAssign && (
                  <div className="mt-2.5 flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <span className="text-[#525A6B] font-medium">Assigned:</span>
                    <select
                      disabled={assigningId === lead.id}
                      value={lead.owner_id || 'unassigned'}
                      onChange={(e) => handleAssignLead(lead.id, e.target.value)}
                      className="rounded border border-[#D0D5DD] bg-white px-2 py-0.5 text-xs text-[#151B2B] focus:border-[#FF6B35] focus:outline-none"
                    >
                      <option value="unassigned">-- Unassigned --</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-[#ECEFF3] pt-3">
                  <select
                    disabled={updatingId === lead.id || allowedTransitions.length === 0}
                    value={lead.pipeline_stage}
                    onChange={(e) =>
                      handleStageChange(
                        lead.id,
                        lead.pipeline_stage,
                        e.target.value as PipelineStage
                      )
                    }
                    className="rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-2 text-xs font-medium text-[#151B2B]"
                  >
                    <option value={lead.pipeline_stage} disabled>
                      Change stage...
                    </option>
                    {allowedTransitions.map((stage) => (
                      <option key={stage} value={stage}>
                        → {stage}
                      </option>
                    ))}
                  </select>

                  <a
                    href={`/dashboard/leads/${lead.id}`}
                    className="rounded-xl bg-[#FF6B35] px-3.5 py-2 text-xs font-bold text-[#F5F6F8]"
                  >
                    View Lead &rarr;
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
