'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ProjectMilestone {
  id: string;
  project_id: string;
  title: string;
  status: 'completed' | 'in_progress' | 'pending';
  due_date: string | null;
}

interface ClientInfo {
  id: string;
  lead_id?: string | null;
  organisation_name: string;
  primary_contact_name: string;
  primary_contact_channel: string;
  billing_email?: string | null;
  status: string;
}

interface InvoiceRef {
  id: string;
  invoice_number: string;
  amount_inr: number;
  status: string;
}

export interface ProjectRecord {
  id: string;
  client_id: string;
  name: string;
  service_line: string;
  status: string;
  start_date: string;
  target_date?: string | null;
  approved_scope: string;
  contracted_value_inr: number;
  clients?: ClientInfo | null;
  project_milestones?: ProjectMilestone[];
  invoices?: InvoiceRef[];
}

export interface EligibleLead {
  id: string;
  organisation_name: string;
  location: string;
  category: string;
  pipeline_stage: string;
  service_interest?: string | null;
}

interface ProjectsClientProps {
  initialProjects: ProjectRecord[];
  eligibleLeads: EligibleLead[];
}

export function ProjectsClient({ initialProjects, eligibleLeads }: ProjectsClientProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjects[0]?.id || '');
  const [isCreatingModal, setIsCreatingModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [newClientName, setNewClientName] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newServiceName, setNewServiceName] = useState('Hostel Outpass Management System (HOMS)');
  const [newContractValue, setNewContractValue] = useState('35000');

  const activeProject = projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  function handleSelectLead(leadId: string) {
    setSelectedLeadId(leadId);
    const match = eligibleLeads.find((l) => l.id === leadId);
    if (match) {
      setNewClientName(match.organisation_name);
    }
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientName.trim() || !newContactPhone.trim()) {
      setNotice({ type: 'error', text: 'Client name and contact WhatsApp/email are required.' });
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: selectedLeadId || null,
          organisation_name: newClientName.trim(),
          primary_contact_name: newContactName.trim() || 'Decision Maker',
          primary_contact_channel: newContactPhone.trim(),
          service_line: newServiceName,
          contracted_value_inr: parseInt(newContractValue, 10) || 35000,
          issue_advance_invoice: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.project) {
        setNotice({ type: 'error', text: data.error || 'Failed to onboard client.' });
        return;
      }

      setProjects((prev) => [data.project, ...prev]);
      setSelectedProjectId(data.project.id);
      setIsCreatingModal(false);
      setSelectedLeadId('');
      setNewClientName('');
      setNewContactName('');
      setNewContactPhone('');
      setNotice({
        type: 'success',
        text: `Onboarded "${data.project.clients?.organisation_name || newClientName}" to live delivery & generated 50% advance invoice.`,
      });
    } catch (err: unknown) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleMilestone(projId: string, milestone: ProjectMilestone) {
    const nextStatus: ProjectMilestone['status'] =
      milestone.status === 'pending'
        ? 'in_progress'
        : milestone.status === 'in_progress'
          ? 'completed'
          : 'pending';

    const res = await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        milestone_id: milestone.id,
        milestone_status: nextStatus,
      }),
    });

    if (res.ok) {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projId) return p;
          return {
            ...p,
            project_milestones: (p.project_milestones || []).map((m) =>
              m.id === milestone.id ? { ...m, status: nextStatus } : m
            ),
          };
        })
      );
    }
  }

  async function handleUpdateStage(projId: string, stage: string) {
    const res = await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projId, status: stage }),
    });
    if (res.ok) {
      setProjects((prev) => prev.map((p) => (p.id === projId ? { ...p, status: stage } : p)));
    }
  }

  function buildWhatsAppHref(channel: string) {
    const digits = (channel || '').replace(/\D/g, '');
    if (!digits) return null;
    const formatted = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${formatted}`;
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center justify-between ${notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
            }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-4 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProjectId(p.id)}
              className={`rounded-xl px-4 py-2 text-xs font-bold border transition ${activeProject?.id === p.id
                  ? 'bg-[#11100E] border-[#11100E] text-[#FAF6EE]'
                  : 'bg-[#FFFDF9] border-[#DDD4C4] text-[#5A554C] hover:bg-[#EFE7DA] hover:text-[#11100E]'
                }`}
            >
              {p.clients?.organisation_name || p.name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIsCreatingModal(true)}
          className="self-start sm:self-auto rounded-xl bg-[#11100E] px-5 py-2.5 text-xs font-bold text-[#FAF6EE] hover:bg-[#272420] shadow-sm whitespace-nowrap"
        >
          + Onboard Client
        </button>
      </div>

      {/* Empty State */}
      {!activeProject ? (
        <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-10 text-center space-y-3">
          <p className="text-base font-bold text-[#11100E]">No Active Client Projects Yet</p>
          <p className="text-xs text-[#5A554C] max-w-md mx-auto">
            As soon as a prospect says yes, onboard them here to create their real delivery workspace, milestones, and initial 50% advance invoice.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreatingModal(true)}
              className="rounded-xl bg-[#11100E] px-5 py-2.5 text-xs font-bold text-[#FAF6EE] hover:bg-[#272420]"
            >
              + Onboard First Paying Client
            </button>
            <Link
              href="/dashboard/leads"
              className="rounded-xl border border-[#DDD4C4] bg-[#F4EEE3] px-4 py-2.5 text-xs font-bold text-[#11100E] hover:bg-[#EAE1D2]"
            >
              Review Leads &rarr;
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Milestones */}
          <div className="lg:col-span-2 rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EFE7DA] pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C6A3B]">
                  Live Client Delivery
                </span>
                <h2 className="text-xl font-black text-[#11100E]">
                  {activeProject.clients?.organisation_name || activeProject.name}
                </h2>
                <p className="text-xs text-[#5A554C] mt-0.5">
                  {activeProject.service_line} • Started {activeProject.start_date}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                  ₹{(activeProject.contracted_value_inr || 0).toLocaleString('en-IN')} Contract
                </span>
                <select
                  value={activeProject.status}
                  onChange={(e) => handleUpdateStage(activeProject.id, e.target.value)}
                  className="rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-1 text-xs font-bold text-[#11100E] focus:outline-none"
                >
                  <option value="requirements">Stage: Requirements</option>
                  <option value="planning">Stage: Planning</option>
                  <option value="development">Stage: Development</option>
                  <option value="client_review">Stage: Client Review</option>
                  <option value="completed">Stage: Completed</option>
                  <option value="on_hold">Stage: On Hold</option>
                </select>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C756A]">
                Delivery Milestones (Click to advance status)
              </h3>
              <div className="mt-3 space-y-2.5">
                {(activeProject.project_milestones || []).map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleToggleMilestone(activeProject.id, m)}
                    className="w-full flex items-center justify-between rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-3.5 text-left hover:border-[#11100E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${m.status === 'completed'
                            ? 'bg-emerald-700 text-[#FAF6EE]'
                            : m.status === 'in_progress'
                              ? 'bg-[#11100E] text-[#FAF6EE]'
                              : 'bg-[#E5DDD0] text-[#5A554C]'
                          }`}
                      >
                        {m.status === 'completed' ? '✓' : i + 1}
                      </span>
                      <div>
                        <p
                          className={`text-xs font-bold ${m.status === 'completed'
                              ? 'line-through text-[#7C756A]'
                              : 'text-[#11100E]'
                            }`}
                        >
                          {m.title}
                        </p>
                        {m.due_date && (
                          <p className="text-[11px] text-[#7C756A]">Target: {m.due_date}</p>
                        )}
                      </div>
                    </div>

                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${m.status === 'completed'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : m.status === 'in_progress'
                            ? 'bg-[#11100E] border-[#11100E] text-[#FAF6EE]'
                            : 'bg-[#FFFDF9] border-[#DDD4C4] text-[#5A554C]'
                        }`}
                    >
                      {m.status.replace(/_/g, ' ')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Scope, Billing & Contact */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm space-y-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
                  Approved Delivery Scope
                </span>
                <p className="mt-1.5 text-xs text-[#11100E] leading-relaxed">
                  {activeProject.approved_scope}
                </p>
              </div>

              <div className="border-t border-[#EFE7DA] pt-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
                  Primary Client Contact
                </span>
                <p className="mt-1 text-xs font-bold text-[#11100E]">
                  {activeProject.clients?.primary_contact_name || 'Decision Maker'}
                </p>
                <p className="text-xs text-[#5A554C]">
                  {activeProject.clients?.primary_contact_channel || 'No channel recorded'}
                </p>
                {activeProject.clients?.primary_contact_channel &&
                  buildWhatsAppHref(activeProject.clients.primary_contact_channel) && (
                    <a
                      href={buildWhatsAppHref(activeProject.clients.primary_contact_channel)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block w-full rounded-xl bg-emerald-700 py-2.5 text-center text-xs font-bold text-[#FAF6EE] hover:bg-emerald-800"
                    >
                      Open Client WhatsApp &rarr;
                    </a>
                  )}
              </div>

              <div className="border-t border-[#EFE7DA] pt-4 flex items-center justify-between">
                <span className="text-xs text-[#5A554C]">
                  Invoices linked: {activeProject.invoices?.length || 0}
                </span>
                <Link
                  href="/dashboard/revenue"
                  className="text-xs font-bold text-[#11100E] underline underline-offset-4 hover:text-[#8C6A3B]"
                >
                  Manage Billing &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real Onboard Client Modal */}
      {isCreatingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#11100E]/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateClient}
            className="w-full max-w-md rounded-2xl border border-[#DDD4C4] bg-[#FFFDF9] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#EFE7DA] pb-3">
              <div>
                <h3 className="text-base font-black text-[#11100E]">Onboard Paying Client</h3>
                <p className="text-xs text-[#5A554C]">
                  Creates client, project milestones, and 50% advance invoice in Supabase.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatingModal(false)}
                className="text-sm text-[#5A554C] hover:text-[#11100E]"
              >
                ✕
              </button>
            </div>

            {eligibleLeads.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-[#11100E]">
                  Link from CRM Lead (Optional)
                </label>
                <select
                  value={selectedLeadId}
                  onChange={(e) => handleSelectLead(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-xs text-[#11100E]"
                >
                  <option value="">— Enter new organisation manually —</option>
                  {eligibleLeads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.organisation_name} ({l.location})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#11100E]">
                Client / Institution Name *
              </label>
              <input
                type="text"
                required
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="e.g. St. Xavier Hostel London"
                className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-xs text-[#11100E]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#11100E]">Contact Name</label>
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Director / Warden"
                  className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-xs text-[#11100E]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#11100E]">
                  WhatsApp / Email *
                </label>
                <input
                  type="text"
                  required
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="+44 7700 900077"
                  className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-xs text-[#11100E]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#11100E]">Approved Package</label>
              <select
                value={newServiceName}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewServiceName(val);
                  if (val.includes('HOMS')) setNewContractValue('35000');
                  else if (val.includes('Starter')) setNewContractValue('9999');
                  else if (val.includes('Growth')) setNewContractValue('17999');
                  else if (val.includes('Assistant')) setNewContractValue('22000');
                  else setNewContractValue('65000');
                }}
                className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-xs text-[#11100E]"
              >
                <option value="Hostel Outpass Management System (HOMS)">
                  Hostel Outpass Management System (₹35,000)
                </option>
                <option value="Starter Business Showcase (3-Page)">
                  Starter Business Showcase (₹9,999)
                </option>
                <option value="Growth Booking & Catalog Suite (5-Page)">
                  Growth Booking & Catalog Suite (₹17,999)
                </option>
                <option value="AI WhatsApp Customer Enquiry Assistant">
                  AI WhatsApp Customer Enquiry Assistant (₹22,000)
                </option>
                <option value="Custom Business Operations Portal">
                  Custom Operations Portal (₹65,000)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#11100E]">
                Contract Value (INR ₹)
              </label>
              <input
                type="number"
                required
                min={1000}
                value={newContractValue}
                onChange={(e) => setNewContractValue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-xs text-[#11100E]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreatingModal(false)}
                className="rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-4 py-2 text-xs font-bold text-[#5A554C]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#11100E] px-5 py-2 text-xs font-bold text-[#FAF6EE] hover:bg-[#272420] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Complete Onboarding'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
