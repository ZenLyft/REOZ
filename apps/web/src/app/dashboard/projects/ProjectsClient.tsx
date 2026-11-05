'use client';

import { useState } from 'react';

interface ProjectMilestone {
  title: string;
  status: 'completed' | 'in_progress' | 'pending';
  due_date: string;
}

interface ClientProject {
  id: string;
  client_name: string;
  service_name: string;
  contracted_value_inr: number;
  stage: 'requirements' | 'planning' | 'development' | 'client_review' | 'handover';
  start_date: string;
  primary_contact: string;
  milestones: ProjectMilestone[];
  onboarding_checklist: { task: string; completed: boolean }[];
}

const INITIAL_PROJECTS: ClientProject[] = [
  {
    id: 'proj-001',
    client_name: 'Apex Academy Tiruppur',
    service_name: 'Growth Booking & Catalog Suite (5-Page)',
    contracted_value_inr: 17999,
    stage: 'development',
    start_date: '2026-11-01',
    primary_contact: '+91 98420 12345 (Director)',
    milestones: [
      { title: 'Requirements & Photo Assets Collected', status: 'completed', due_date: '2026-11-02' },
      { title: 'Responsive UI Design & Course Catalog', status: 'completed', due_date: '2026-11-04' },
      { title: 'WhatsApp Instant Booking Integration', status: 'in_progress', due_date: '2026-11-06' },
      { title: 'Client Review & Staging Feedback', status: 'pending', due_date: '2026-11-08' },
      { title: 'Live Domain Launch & Final Handover', status: 'pending', due_date: '2026-11-09' },
    ],
    onboarding_checklist: [
      { task: 'Create client workspace & welcome WhatsApp message', completed: true },
      { task: 'Collect course syllabus & high-res logo assets', completed: true },
      { task: 'Domain DNS delegation setup', completed: true },
      { task: 'Invoice 1 (50% Advance - ₹8,999) issued', completed: true },
      { task: 'Staff training video recorded', completed: false },
    ],
  },
];

export function ProjectsClient() {
  const [projects, setProjects] = useState<ClientProject[]>(INITIAL_PROJECTS);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [isCreatingModal, setIsCreatingModal] = useState(false);

  // Form state for instant onboarding
  const [newClientName, setNewClientName] = useState('');
  const [newServiceName, setNewServiceName] = useState('Starter Business Showcase (3-Page)');
  const [newContractValue, setNewContractValue] = useState('9999');
  const [newContactPhone, setNewContactPhone] = useState('+91 ');

  const activeProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  function handleCreateClient() {
    if (!newClientName || !newContactPhone) {
      alert('Please enter client name and contact phone.');
      return;
    }

    const valueNum = parseInt(newContractValue, 10) || 9999;
    const newProj: ClientProject = {
      id: `proj-${Date.now().toString().slice(-4)}`,
      client_name: newClientName,
      service_name: newServiceName,
      contracted_value_inr: valueNum,
      stage: 'requirements',
      start_date: new Date().toISOString().split('T')[0],
      primary_contact: newContactPhone,
      milestones: [
        { title: 'Requirements & Scope Confirmation', status: 'in_progress', due_date: 'In 2 days' },
        { title: 'Design Mockup & Brand Assets', status: 'pending', due_date: 'In 4 days' },
        { title: 'Development & Mobile Testing', status: 'pending', due_date: 'In 7 days' },
        { title: 'Client Review & Handover', status: 'pending', due_date: 'In 10 days' },
      ],
      onboarding_checklist: [
        { task: 'Welcome message sent to client WhatsApp', completed: true },
        { task: 'Collect brand logo, photos, and color palette', completed: false },
        { task: 'Issue 50% Advance Invoice', completed: false },
        { task: 'Domain registrar access credentials secured', completed: false },
      ],
    };

    setProjects([newProj, ...projects]);
    setSelectedProjectId(newProj.id);
    setIsCreatingModal(false);
    setNewClientName('');
    alert(`Client "${newClientName}" successfully onboarded into active project delivery workspace!`);
  }

  function toggleTask(projId: string, taskIndex: number) {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projId) return p;
        const newChecklist = [...p.onboarding_checklist];
        newChecklist[taskIndex].completed = !newChecklist[taskIndex].completed;
        return { ...p, onboarding_checklist: newChecklist };
      })
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                selectedProjectId === p.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-700/60'
              }`}
            >
              💼 {p.client_name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIsCreatingModal(true)}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500"
        >
          + Onboard New Client
        </button>
      </div>

      {/* Instant Onboard Modal */}
      {isCreatingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100">Onboard New Customer</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Initialize client delivery workspace, milestone roadmap, and onboarding checklist.
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-zinc-300">Client / Institution Name</label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g. Sri Krishna Textiles, Erode"
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-300">Service Line</label>
                <select
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="Starter Business Showcase (3-Page)">Starter Business Showcase (₹9,999)</option>
                  <option value="Growth Booking & Catalog Suite (5-Page)">Growth Booking & Catalog Suite (₹17,999)</option>
                  <option value="Hostel Outpass Management System (HOMS)">Hostel Outpass Management System (₹35,000)</option>
                  <option value="AI WhatsApp Customer Enquiry Assistant">AI WhatsApp Customer Enquiry Assistant (₹22,000)</option>
                  <option value="Custom Business Operations Portal">Custom Operations Portal (₹65,000)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-zinc-300">Contracted Value (INR ₹)</label>
                <input
                  type="number"
                  value={newContractValue}
                  onChange={(e) => setNewContractValue(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-300">Primary Contact Phone / WhatsApp</label>
                <input
                  type="text"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="+91 98420 12345"
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingModal(false)}
                className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateClient}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                ✓ Complete Onboarding
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Project Details */}
      {activeProject && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Project Overview & Milestones */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                    Active Client Delivery
                  </span>
                  <h2 className="text-lg font-bold text-zinc-100">{activeProject.client_name}</h2>
                  <p className="text-xs text-zinc-400">
                    {activeProject.service_name} • Started on {activeProject.start_date}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
                    ₹{activeProject.contracted_value_inr.toLocaleString('en-IN')} Contract
                  </span>
                  <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300 capitalize">
                    {activeProject.stage}
                  </span>
                </div>
              </div>

              {/* Milestones Timeline */}
              <div className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Delivery Milestones & Stages
                </h3>
                <div className="mt-3 space-y-3">
                  {activeProject.milestones.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                            m.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : m.status === 'in_progress'
                              ? 'bg-indigo-500/20 text-indigo-400 animate-pulse'
                              : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {m.status === 'completed' ? '✓' : i + 1}
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-zinc-200">{m.title}</p>
                          <p className="text-[10px] text-zinc-500">Target: {m.due_date}</p>
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          m.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : m.status === 'in_progress'
                            ? 'bg-indigo-500/10 text-indigo-400'
                            : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        {m.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Onboarding Checklist & Client Info */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Customer Onboarding Checklist
              </h3>
              <p className="mt-1 text-[11px] text-zinc-500">
                Automated customer success task list for delivery readiness.
              </p>

              <div className="mt-4 space-y-2.5">
                {activeProject.onboarding_checklist.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleTask(activeProject.id, i)}
                    className="flex w-full items-start gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-2.5 text-left transition hover:border-zinc-700"
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      readOnly
                      className="mt-0.5 rounded border-zinc-700 text-indigo-600 focus:ring-0"
                    />
                    <span
                      className={`text-xs ${
                        item.completed ? 'text-zinc-500 line-through' : 'text-zinc-300 font-medium'
                      }`}
                    >
                      {item.task}
                    </span>
                  </button>
                ))}
              </div>

              {/* Client Contact Info */}
              <div className="mt-5 border-t border-zinc-800 pt-4">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Authorized Contact</span>
                <p className="mt-1 text-xs font-semibold text-zinc-200">{activeProject.primary_contact}</p>
                <div className="mt-3 flex gap-2">
                  <a
                    href={`https://wa.me/${activeProject.primary_contact.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-xl bg-emerald-600/20 border border-emerald-500/30 py-2 text-center text-xs font-semibold text-emerald-400 hover:bg-emerald-600/30"
                  >
                    💬 WhatsApp Client
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

