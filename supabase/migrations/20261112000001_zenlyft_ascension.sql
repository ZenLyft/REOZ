-- ZenLyft Ascension — 59-Agent Unified Control Plane, Shared Memory & Execution Tables
-- Run idempotently in Supabase SQL Editor. Also pairs with langgraph-checkpoint-postgres.

create table if not exists public.ascension_control_state (
  id text primary key,
  kill_switch_engaged boolean not null default false,
  kill_switch_reason text,
  max_concurrent_agents integer not null default 5,
  allow_paid_fallback boolean not null default false,
  updated_by text default 'founder',
  updated_at timestamptz not null default now()
);

insert into public.ascension_control_state (id, kill_switch_engaged, max_concurrent_agents, allow_paid_fallback)
values ('global', false, 5, false)
on conflict (id) do nothing;

create table if not exists public.ascension_agents (
  agent_id text primary key,
  code text not null,
  name text not null,
  department text not null,
  tier text not null,
  reports_to text not null,
  preferred_provider text not null,
  model text not null,
  active boolean not null default false,
  is_temporary boolean not null default false,
  permissions jsonb not null default '[]'::jsonb,
  allowed_tools jsonb not null default '[]'::jsonb,
  allowed_memory_scopes jsonb not null default '[]'::jsonb,
  completed_tasks integer not null default 0,
  failed_tasks integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.ascension_tasks (
  task_id text primary key,
  thread_id text not null,
  description text not null,
  business_objective text not null,
  assigned_agent text not null references public.ascension_agents(agent_id),
  department text not null,
  priority text not null default 'normal',
  status text not null default 'created',
  requires_approval boolean not null default false,
  approval_action_type text,
  approval_hash text,
  idempotency_key text unique,
  delegation_depth integer not null default 0,
  budget_limit_tokens integer not null default 12000,
  input_data jsonb not null default '{}'::jsonb,
  final_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ascension_memory_facts (
  fact_id text primary key,
  scope text not null,
  subject text not null,
  content text not null,
  classification text not null,
  provenance_source text not null,
  provenance_url text,
  confidence real not null default 0.8,
  created_by_agent text not null,
  department text,
  decay_half_life_days integer not null default 30,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ascension_token_usage (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  agent_id text,
  thread_id text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  estimated_cost_usd numeric(10,6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ascension_tasks_thread on public.ascension_tasks(thread_id);
create index if not exists idx_ascension_tasks_status on public.ascension_tasks(status);
create index if not exists idx_ascension_memory_scope on public.ascension_memory_facts(scope);

alter table public.ascension_control_state enable row level security;
alter table public.ascension_agents enable row level security;
alter table public.ascension_tasks enable row level security;
alter table public.ascension_memory_facts enable row level security;
alter table public.ascension_token_usage enable row level security;

drop policy if exists "Auth manage ascension_control_state" on public.ascension_control_state;
create policy "Auth manage ascension_control_state" on public.ascension_control_state for all to authenticated using (true) with check (true);

drop policy if exists "Auth manage ascension_agents" on public.ascension_agents;
create policy "Auth manage ascension_agents" on public.ascension_agents for all to authenticated using (true) with check (true);

drop policy if exists "Auth manage ascension_tasks" on public.ascension_tasks;
create policy "Auth manage ascension_tasks" on public.ascension_tasks for all to authenticated using (true) with check (true);

drop policy if exists "Auth manage ascension_memory_facts" on public.ascension_memory_facts;
create policy "Auth manage ascension_memory_facts" on public.ascension_memory_facts for all to authenticated using (true) with check (true);

drop policy if exists "Auth manage ascension_token_usage" on public.ascension_token_usage;
create policy "Auth manage ascension_token_usage" on public.ascension_token_usage for all to authenticated using (true) with check (true);

grant all on public.ascension_control_state, public.ascension_agents, public.ascension_tasks, public.ascension_memory_facts, public.ascension_token_usage to anon, authenticated, service_role;

