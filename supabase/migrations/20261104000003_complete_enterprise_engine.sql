-- ======================================================================
-- ZENLYFT REVENUE ENGINE - ENTERPRISE GLOBAL MIGRATION
-- Migration: 20261104000003_complete_enterprise_engine.sql
-- Covers: Products, Clients, Projects, Milestones, Invoices, Payments,
-- System Settings, Conversations, and Agent Executions
-- ======================================================================

-- 1. System Settings & Autonomy Configuration
create table if not exists public.system_settings (
  id text primary key default 'zenlyft-global-settings',
  autonomy_level integer not null default 1, -- 1: Internal, 2: Pre-authorised Sales, 3: Escalation, 4: Founder-only
  emergency_stop_active boolean not null default false, -- Master Kill Switch
  daily_discovery_limit integer not null default 100,
  active_market_country text not null default 'India',
  active_market_regions text[] default array['Tamil Nadu', 'Karnataka', 'Maharashtra'],
  evolution_api_auto_send boolean not null default false,
  updated_at timestamptz default now() not null
);

insert into public.system_settings (id, autonomy_level, emergency_stop_active, daily_discovery_limit, active_market_country)
values ('zenlyft-global-settings', 1, false, 100, 'India')
on conflict (id) do nothing;

-- 2. Central Product & Service Catalogue
create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null, -- education_technology, website_development, ai_automation, custom_software, technical_services
  category_label text not null,
  description text not null,
  target_customer text not null,
  problems_solved text[] not null default array[]::text[],
  features text[] not null default array[]::text[],
  deliverables text[] not null default array[]::text[],
  pricing_model text not null default 'fixed',
  minimum_approved_price_inr integer not null,
  recommended_price_inr integer not null,
  maximum_approved_discount_percent integer not null default 10,
  implementation_time_days integer not null default 7,
  payment_terms text not null,
  maintenance_options text not null,
  demo_available boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 3. Clients
create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads(id) on delete set null,
  organisation_name text not null,
  primary_contact_name text not null,
  primary_contact_channel text not null,
  billing_email text,
  billing_address text,
  status text not null default 'active', -- active, completed, on_hold
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 4. Projects & Milestones
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  name text not null,
  service_line text not null,
  status text not null default 'requirements', -- requirements, planning, development, client_review, completed
  start_date date default current_date not null,
  target_date date,
  approved_scope text not null,
  contracted_value_inr integer not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.project_milestones (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  title text not null,
  description text,
  due_date date,
  status text not null default 'pending', -- pending, in_progress, completed
  created_at timestamptz default now() not null
);

-- 5. Invoices & Payments (Reality-based Revenue Tracking)
create table if not exists public.invoices (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  invoice_number text unique not null,
  amount_inr integer not null,
  status text not null default 'issued', -- issued, paid, cancelled, overdue
  due_date date not null,
  issued_at timestamptz default now() not null,
  paid_at timestamptz
);

create table if not exists public.payments (
  id uuid default gen_random_uuid() primary key,
  invoice_id uuid references public.invoices(id) on delete cascade not null,
  amount_received_inr integer not null,
  received_at timestamptz default now() not null,
  payment_reference text not null,
  notes text
);

-- 6. Conversations & Multi-channel History
create table if not exists public.conversations (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  channel text not null default 'whatsapp', -- whatsapp, email
  direction text not null default 'outbound', -- inbound, outbound
  sender text not null,
  recipient text not null,
  message_content text not null,
  external_message_id text,
  created_at timestamptz default now() not null
);

-- 7. Agent Executions & Autonomy History
create table if not exists public.agent_executions (
  id uuid default gen_random_uuid() primary key,
  agent_name text not null,
  command text not null,
  status text not null default 'success',
  result_summary text not null,
  data_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

-- 8. Row Level Security & Permissions
alter table public.system_settings enable row level security;
alter table public.products enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_milestones enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.conversations enable row level security;
alter table public.agent_executions enable row level security;

drop policy if exists "Auth users manage system_settings" on public.system_settings;
create policy "Auth users manage system_settings" on public.system_settings for all to authenticated using (true) with check (true);

drop policy if exists "Auth users manage products" on public.products;
create policy "Auth users manage products" on public.products for all to authenticated using (true) with check (true);

drop policy if exists "Auth users manage clients" on public.clients;
create policy "Auth users manage clients" on public.clients for all to authenticated using (true) with check (true);

drop policy if exists "Auth users manage projects" on public.projects;
create policy "Auth users manage projects" on public.projects for all to authenticated using (true) with check (true);

drop policy if exists "Auth users manage project_milestones" on public.project_milestones;
create policy "Auth users manage project_milestones" on public.project_milestones for all to authenticated using (true) with check (true);

drop policy if exists "Auth users manage invoices" on public.invoices;
create policy "Auth users manage invoices" on public.invoices for all to authenticated using (true) with check (true);

drop policy if exists "Auth users manage payments" on public.payments;
create policy "Auth users manage payments" on public.payments for all to authenticated using (true) with check (true);

drop policy if exists "Auth users manage conversations" on public.conversations;
create policy "Auth users manage conversations" on public.conversations for all to authenticated using (true) with check (true);

drop policy if exists "Auth users manage agent_executions" on public.agent_executions;
create policy "Auth users manage agent_executions" on public.agent_executions for all to authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

