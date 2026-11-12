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
  created_at: string;
}

interface LeadsTableClientProps {
  initialLeads: LeadItem[];
}

export function LeadsTableClient({ initialLeads }: LeadsTableClientProps) {
  const [leads, setLeads] = useState<LeadItem[]>(initialLeads);
  const [filterStage, setFilterStage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
    discovered: 'bg-[#F4EEE3] text-[#5A554C] border-[#DDD4C4]',
    qualified: 'bg-[#11100E] text-[#FAF6EE] border-[#11100E]',
    contacted: 'bg-sky-50 text-sky-900 border-sky-200',
    replied: 'bg-amber-50 text-amber-900 border-amber-200',
    proposal: 'bg-purple-50 text-purple-900 border-purple-200',
    won: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    lost: 'bg-red-50 text-red-800 border-red-200',
    not_a_fit: 'bg-[#F4EEE3] text-[#7C756A] border-[#E5DDD0]',
    do_not_contact: 'bg-red-700 text-[#FAF6EE] border-red-800',
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
            className="w-full rounded-xl border border-[#DDD4C4] bg-[#FFFDF9] px-4 py-2.5 text-sm text-[#11100E] placeholder-[#7C756A] focus:border-[#11100E] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-[#5A554C]">Stage:</label>
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="rounded-xl border border-[#DDD4C4] bg-[#FFFDF9] px-3 py-2 text-sm text-[#11100E] focus:border-[#11100E] focus:outline-none"
          >
            <option value="all">All Stages ({leads.length})</option>
            <option value="discovered">Discovered</option>
            <option value="qualified">Qualified</option>
            <option value="contacted">Contacted</option>
            <option value="replied">Replied</option>
            <option value="proposal">Proposal</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="do_not_contact">Do Not Contact</option>
          </select>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] md:block shadow-sm">
        <table className="w-full text-left text-sm text-[#11100E]">
          <thead className="border-b border-[#E5DDD0] bg-[#FAF6EE] text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
            <tr>
              <th className="px-5 py-3.5">Organisation</th>
              <th className="px-4 py-3.5">Category & Location</th>
              <th className="px-4 py-3.5">Score</th>
              <th className="px-4 py-3.5">Stage</th>
              <th className="px-4 py-3.5">Quick Stage Action</th>
              <th className="px-5 py-3.5 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE7DA]">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-[#7C756A]">
                  No prospects found matching your filter.
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => {
                const allowedTransitions = VALID_TRANSITIONS[lead.pipeline_stage] || [];
                return (
                  <tr key={lead.id} className="hover:bg-[#FAF6EE]">
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#11100E]">{lead.organisation_name}</div>
                      {lead.contact_restriction === 'do_not_contact' && (
                        <span className="mt-0.5 inline-block rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          DNC RESTRICTED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[#11100E] font-medium">{lead.category}</div>
                      <div className="text-xs text-[#5A554C]">{lead.location}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-mono text-xs font-bold text-[#11100E]">
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
                        className="rounded-lg border border-[#DDD4C4] bg-[#FAF6EE] px-2.5 py-1 text-xs text-[#11100E] focus:border-[#11100E] focus:outline-none disabled:opacity-40"
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
                        className="rounded-lg border border-[#DDD4C4] bg-[#F4EEE3] px-3 py-1.5 text-xs font-bold text-[#11100E] hover:bg-[#11100E] hover:text-[#FAF6EE] transition"
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
          <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-6 text-center text-[#7C756A]">
            No leads found.
          </div>
        ) : (
          filteredLeads.map((lead) => {
            const allowedTransitions = VALID_TRANSITIONS[lead.pipeline_stage] || [];
            return (
              <div
                key={lead.id}
                className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[#11100E]">{lead.organisation_name}</h3>
                    <p className="text-xs text-[#5A554C]">
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

                <div className="mt-3 flex items-center justify-between border-t border-[#EFE7DA] pt-3">
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
                    className="rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-xs font-medium text-[#11100E]"
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
                    className="rounded-xl bg-[#11100E] px-3.5 py-2 text-xs font-bold text-[#FAF6EE]"
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
