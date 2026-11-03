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

  async function handleStageChange(leadId: string, currentStage: PipelineStage, newStage: PipelineStage) {
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
    discovered: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    qualified: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    contacted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    replied: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    proposal: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    won: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    lost: 'bg-red-500/10 text-red-400 border-red-500/20',
    not_a_fit: 'bg-zinc-800/80 text-zinc-500 border-zinc-800',
    do_not_contact: 'bg-red-600/20 text-red-300 border-red-600/40',
    on_hold: 'bg-amber-600/20 text-amber-300 border-amber-600/40',
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
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400">Stage:</label>
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
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

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 md:block">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead className="border-b border-zinc-800 bg-zinc-950/80 text-xs font-semibold uppercase text-zinc-400">
            <tr>
              <th className="px-5 py-3.5">Organisation</th>
              <th className="px-4 py-3.5">Category & Location</th>
              <th className="px-4 py-3.5">Website Status</th>
              <th className="px-4 py-3.5">Stage</th>
              <th className="px-4 py-3.5">Quick Stage Action</th>
              <th className="px-5 py-3.5 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-zinc-500">
                  No prospects found matching your query.
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => {
                const allowedTransitions = VALID_TRANSITIONS[lead.pipeline_stage] || [];
                return (
                  <tr key={lead.id} className="hover:bg-zinc-800/40">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-zinc-100">{lead.organisation_name}</div>
                      {lead.contact_restriction === 'do_not_contact' && (
                        <span className="mt-0.5 inline-block rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                          DNC RESTRICTED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-zinc-200">{lead.category}</div>
                      <div className="text-xs text-zinc-400">{lead.location}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs font-medium text-zinc-400">
                        {lead.website_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
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
                          handleStageChange(lead.id, lead.pipeline_stage, e.target.value as PipelineStage)
                        }
                        className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none disabled:opacity-40"
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
                        className="rounded-lg border border-zinc-800 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      >
                        Inspect →
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Layout (iPhone Optimized with large touch targets) */}
      <div className="space-y-3 md:hidden">
        {filteredLeads.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-500">
            No leads found.
          </div>
        ) : (
          filteredLeads.map((lead) => {
            const allowedTransitions = VALID_TRANSITIONS[lead.pipeline_stage] || [];
            return (
              <div
                key={lead.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-zinc-100">{lead.organisation_name}</h3>
                    <p className="text-xs text-zinc-400">
                      {lead.category} • {lead.location}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                      stageBadgeColors[lead.pipeline_stage]
                    }`}
                  >
                    {lead.pipeline_stage}
                  </span>
                </div>

                {lead.contact_restriction === 'do_not_contact' && (
                  <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
                    ⚠ Contact restriction: Do Not Contact
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-3">
                  <select
                    disabled={updatingId === lead.id || allowedTransitions.length === 0}
                    value={lead.pipeline_stage}
                    onChange={(e) =>
                      handleStageChange(lead.id, lead.pipeline_stage, e.target.value as PipelineStage)
                    }
                    className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200"
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
                    className="rounded-xl bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-200"
                  >
                    View Lead →
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

