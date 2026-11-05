'use client';

import { useState } from 'react';

interface AgentInfo {
  id: string;
  num: string;
  name: string;
  category: 'executive' | 'acquisition' | 'sales' | 'operations' | 'finance';
  categoryLabel: string;
  provider: string;
  model: string;
  description: string;
  responsibilities: string[];
  defaultPrompt: string;
}

const AGENTS_LIST: AgentInfo[] = [
  {
    id: 'agent-01',
    num: '01',
    name: 'CEO Executive Orchestrator',
    category: 'executive',
    categoryLabel: 'Executive Management',
    provider: 'Groq Cloud',
    model: 'qwen/qwen3.8-27b',
    description: 'Coordinates all 15 agents, breaks down founder commands, and tracks daily revenue milestones.',
    responsibilities: [
      'Coordinate all 15 specialist agents',
      'Assign tasks and enforce workflow dependencies',
      'Generate daily executive revenue summaries',
      'Escalate decisions requiring founder sign-off',
    ],
    defaultPrompt: 'Review today pipeline health and recommend top 3 focus actions for Coimbatore.',
  },
  {
    id: 'agent-02',
    num: '02',
    name: 'Underserved Opportunity Intelligence',
    category: 'acquisition',
    categoryLabel: 'Customer Acquisition',
    provider: 'Google Gemini',
    model: 'gemini-flash-lite-latest',
    description: 'Finds businesses with zero/low competitive coverage, paper outpass chaos, or missing digital portals.',
    responsibilities: [
      'Scan for businesses with no verified website',
      'Detect paper-based hostel outpass & register workflows',
      'Assess competitive intensity (Low/Underserved)',
      'Match problems to ZenLyft approved catalogue',
    ],
    defaultPrompt: 'Analyze clinic opportunities in Coimbatore with zero online appointment booking.',
  },
  {
    id: 'agent-03',
    num: '03',
    name: 'Global Market Discovery Agent',
    category: 'acquisition',
    categoryLabel: 'Customer Acquisition',
    provider: 'OpenStreetMap',
    model: 'nominatim-engine-v1',
    description: 'Discovers verified physical businesses and educational institutions across Tamil Nadu and global cities.',
    responsibilities: [
      'Search target cities (Coimbatore, Tiruppur, Erode, Chennai)',
      'Extract business names, categories, and coordinates',
      'Deduplicate records against existing CRM database',
      'Enforce source attribution and timestamps',
    ],
    defaultPrompt: 'Discover 10 clinics and hospitals in Pollachi, Coimbatore.',
  },
  {
    id: 'agent-04',
    num: '04',
    name: 'Competition Research Agent',
    category: 'acquisition',
    categoryLabel: 'Customer Acquisition',
    provider: 'Groq Cloud',
    model: 'qwen/qwen3.8-27b',
    description: 'Analyzes regional software agencies and ERP alternatives to position ZenLyft with clear local advantages.',
    responsibilities: [
      'Identify regional software agencies and ERP alternatives',
      'Highlight ZenLyft local delivery & pricing advantages',
      'Identify underserved local SME segments',
    ],
    defaultPrompt: 'Compare ZenLyft HOMS vs generic ERP providers in Tamil Nadu.',
  },
  {
    id: 'agent-05',
    num: '05',
    name: 'Prospect Intelligence Agent',
    category: 'acquisition',
    categoryLabel: 'Customer Acquisition',
    provider: 'Google Gemini',
    model: 'gemini-flash-lite-latest',
    description: 'Researches verified public business contacts, phone numbers, and WhatsApp channels.',
    responsibilities: [
      'Extract verified public phone numbers and addresses',
      'Verify official website accessibility',
      'Distinguish confirmed facts from inferences',
    ],
    defaultPrompt: 'Verify contact details for engineering college hostels in Eachanari.',
  },
  {
    id: 'agent-06',
    num: '06',
    name: 'Website Usability Audit Agent',
    category: 'acquisition',
    categoryLabel: 'Customer Acquisition',
    provider: 'Groq Cloud',
    model: 'qwen/qwen3.8-27b',
    description: 'Audits public websites for mobile responsiveness, slow load speeds, and missing WhatsApp CTAs.',
    responsibilities: [
      'Inspect viewport and responsive tags',
      'Evaluate WhatsApp enquiry click-to-chat accessibility',
      'Produce evidence-based usability audit report',
    ],
    defaultPrompt: 'Audit mobile navigation obstacles for bakery and restaurant websites.',
  },
  {
    id: 'agent-07',
    num: '07',
    name: 'Lead Qualification Agent',
    category: 'acquisition',
    categoryLabel: 'Customer Acquisition',
    provider: 'Deterministic',
    model: 'scoring-engine-v1',
    description: 'Scores prospects from 0 to 100 based on objective evidence, ZenLyft fit, and reachability.',
    responsibilities: [
      'Score website opportunity (up to 20 pts)',
      'Score ZenLyft service fit (up to 20 pts)',
      'Score verified public contact channel (up to 10 pts)',
      'Assign priority class (High 80-100, Qualified 60-79)',
    ],
    defaultPrompt: 'Score a multi-speciality dental clinic with no website and verified phone in RS Puram.',
  },
  {
    id: 'agent-08',
    num: '08',
    name: 'Marketing Intelligence Agent',
    category: 'sales',
    categoryLabel: 'Sales Support',
    provider: 'Groq Cloud',
    model: 'qwen/qwen3.8-27b',
    description: 'Crafts localized bilingual (Tamil & English) value propositions and campaign concepts.',
    responsibilities: [
      'Develop sector-specific hooks (Clinics, Hostels, Colleges)',
      'Maintain approved brand messaging',
      'Evaluate campaign performance metrics',
    ],
    defaultPrompt: 'Create a WhatsApp outreach hook for Coimbatore fitness gyms in Tamil and English.',
  },
  {
    id: 'agent-09',
    num: '09',
    name: 'Sales Development Assistant (SDR)',
    category: 'sales',
    categoryLabel: 'Sales Support',
    provider: 'Groq Cloud',
    model: 'qwen/qwen3.8-27b',
    description: 'Generates personalized Day 0 outreach drafts bound by cryptographic SHA-256 payload hashes.',
    responsibilities: [
      'Prepare prospect-specific initial introduction drafts',
      'Map problem to exact catalogue pricing tier',
      'Queue drafts in founder Approval Inbox',
    ],
    defaultPrompt: 'Draft Day 0 proposal for a retail textile manufacturer in Tiruppur offering Starter Showcase ₹9,999.',
  },
  {
    id: 'agent-10',
    num: '10',
    name: 'Continuous Follow-Up Coordinator',
    category: 'sales',
    categoryLabel: 'Sales Support',
    provider: 'Deterministic',
    model: 'cadence-engine-v1',
    description: 'Executes the Day 3, 7, 12, 18 touchpoint cadence and auto-pauses when prospect replies.',
    responsibilities: [
      'Track days elapsed since last contact',
      'Queue Day 3 benefit, Day 7 observation, Day 12 demo offers',
      'Stop immediately on opt-out or decline',
    ],
    defaultPrompt: 'Scan contacted leads and queue Day 3 follow-ups with local proof.',
  },
  {
    id: 'agent-11',
    num: '11',
    name: 'Account Executive Assistant',
    category: 'sales',
    categoryLabel: 'Sales Support',
    provider: 'Google Gemini',
    model: 'gemini-flash-lite-latest',
    description: 'Summarizes prospect requirements, prepares demo agendas, and drafts formal proposals.',
    responsibilities: [
      'Draft interactive demonstration agendas',
      'Map client requests to approved deliverables',
      'Prepare commercial proposal summaries',
    ],
    defaultPrompt: 'Create a 5-minute HOMS demo agenda for college trustees in Coimbatore.',
  },
  {
    id: 'agent-12',
    num: '12',
    name: 'Negotiation & Objection Intelligence',
    category: 'sales',
    categoryLabel: 'Sales Support',
    provider: 'Groq Cloud',
    model: 'qwen/qwen3.8-27b',
    description: 'Analyzes objections and enforces approved catalogue discount ceilings (Max 10-15%).',
    responsibilities: [
      'Address common pricing and timeline objections',
      'Enforce minimum approved price floors',
      'Escalate unapproved custom terms to founder (Level 3)',
    ],
    defaultPrompt: 'Handle objection: "We already have a manual paper register that works fine for hostel outpasses".',
  },
  {
    id: 'agent-13',
    num: '13',
    name: 'Deal Closing Coordinator',
    category: 'sales',
    categoryLabel: 'Sales Support',
    provider: 'Groq Cloud',
    model: 'qwen/qwen3.8-27b',
    description: 'Verifies formal customer acceptance evidence before initializing project onboarding.',
    responsibilities: [
      'Confirm scope, deliverables, and payment schedule',
      'Record documented client acceptance evidence',
      'Prevent deals from advancing without founder review',
    ],
    defaultPrompt: 'Verify acceptance terms for ₹17,999 Growth Booking Suite before onboarding kickoff.',
  },
  {
    id: 'agent-14',
    num: '14',
    name: 'Customer Onboarding Agent',
    category: 'operations',
    categoryLabel: 'Client Operations',
    provider: 'Deterministic',
    model: 'onboarding-engine-v1',
    description: 'Creates client workspaces, generates onboarding checklists, and schedules kickoff.',
    responsibilities: [
      'Generate customer onboarding task checklists',
      'Request brand logos, DNS credentials, and roster files',
      'Initialize client project delivery workspace',
    ],
    defaultPrompt: 'Generate customer onboarding checklist for newly signed clinic website.',
  },
  {
    id: 'agent-15',
    num: '15',
    name: 'Project Delivery & Finance Agent',
    category: 'finance',
    categoryLabel: 'Revenue & Finance',
    provider: 'Deterministic',
    model: 'revenue-reconciliation-v1',
    description: 'Tracks delivery milestones, generates invoices, and verifies UPI payment references.',
    responsibilities: [
      'Track 5-stage project delivery milestones',
      'Issue advance and milestone invoices',
      'Verify UPI/Bank references before marking cash as collected',
    ],
    defaultPrompt: 'Reconcile 50% advance invoice (₹8,999) against UPI reference UPI/63124891024/GPay.',
  },
];

export function AgentsClient() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<{
    agentId: string;
    model: string;
    latency_ms: number;
    executed_at: string;
    result: Record<string, unknown>;
  } | null>(null);

  const categories = [
    { id: 'all', label: 'All 15 Agents' },
    { id: 'executive', label: '👑 Executive (1)' },
    { id: 'acquisition', label: '🎯 Acquisition (6)' },
    { id: 'sales', label: '💼 Sales & Follow-Up (6)' },
    { id: 'operations', label: '🚀 Client Operations (1)' },
    { id: 'finance', label: '💰 Revenue & Finance (1)' },
  ];

  const filtered = AGENTS_LIST.filter(
    (a) => activeCategory === 'all' || a.category === activeCategory
  );

  async function handleRunTask(agent: AgentInfo) {
    setRunningAgentId(agent.id);
    setExecutionResult(null);

    try {
      const res = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          command: agent.defaultPrompt,
          payload: {
            organisation_name: 'Apex Academy Coimbatore',
            location: 'Coimbatore, Tamil Nadu',
            package_name: 'Growth Booking Suite',
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setExecutionResult({
          agentId: agent.id,
          model: data.model,
          latency_ms: data.latency_ms,
          executed_at: data.executed_at,
          result: data.result,
        });
      } else {
        alert(`Execution failed: ${data.error}`);
      }
    } catch (err: unknown) {
      alert(`Error running agent: ${err}`);
    } finally {
      setRunningAgentId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              activeCategory === c.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-700/60'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Live Execution Result Inspector Modal/Drawer */}
      {executionResult && (
        <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-zinc-900 to-purple-950/30 p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                Live Execution Evidence: {executionResult.agentId.toUpperCase()}
              </span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-indigo-300">
                {executionResult.model} • {executionResult.latency_ms}ms
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExecutionResult(null)}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              ✕ Close
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-200 overflow-x-auto max-h-64 whitespace-pre-wrap">
            {JSON.stringify(executionResult.result, null, 2)}
          </div>
          <p className="text-[10px] text-zinc-500">
            Recorded to immutable database table <code className="text-zinc-400">agent_executions</code> at{' '}
            {new Date(executionResult.executed_at).toLocaleTimeString()}.
          </p>
        </div>
      )}

      {/* Agents Grid (15 Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((agent) => {
          const isRunning = runningAgentId === agent.id;
          return (
            <div
              key={agent.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm hover:border-zinc-700 transition flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600/20 text-[11px] font-black text-indigo-400 font-mono">
                      {agent.num}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-100">{agent.name}</h3>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {agent.categoryLabel}
                      </span>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400 uppercase">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                    ONLINE
                  </span>
                </div>

                {/* Description */}
                <p className="mt-2.5 text-xs text-zinc-400 leading-relaxed">
                  {agent.description}
                </p>

                {/* Model / Provider Tag */}
                <div className="mt-3 flex items-center gap-2 font-mono text-[10px]">
                  <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-zinc-300 border border-zinc-700/60">
                    {agent.provider}
                  </span>
                  <span className="text-zinc-500 truncate">{agent.model}</span>
                </div>

                {/* Responsibilities */}
                <div className="mt-3 border-t border-zinc-800/80 pt-3">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                    Core Responsibilities
                  </span>
                  <ul className="mt-1 space-y-1 text-[11px] text-zinc-400">
                    {agent.responsibilities.slice(0, 3).map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-indigo-400 mt-0.5">›</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-4 pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => handleRunTask(agent)}
                  className="w-full rounded-xl bg-indigo-600/20 border border-indigo-500/30 py-2 text-center text-xs font-bold text-indigo-300 hover:bg-indigo-600/30 transition shadow-sm"
                >
                  {isRunning ? '⏳ Executing Task...' : '⚡ Test Agent Task'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
