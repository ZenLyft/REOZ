-- Phase 5 Schema Extension: Clients, Projects, Milestones, Invoices, Payments, and Agent Task Logs

create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads(id) on delete set null,
  organisation_name text not null,
  primary_contact_name text not null,
  primary_contact_channel text not null,
  billing_email text,
  billing_address text,
  status text not null default 'active',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  name text not null,
  service_line text not null,
  status text not null default 'requirements', -- requirements, in_progress, client_review, completed, on_hold
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

create table if not exists public.agent_executions (
  id uuid default gen_random_uuid() primary key,
  agent_name text not null,
  command text not null,
  status text not null default 'success',
  result_summary text not null,
  data_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

-- Enable RLS
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_milestones enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.agent_executions enable row level security;

-- Policies for authenticated users
create policy "Auth users manage clients" on public.clients for all to authenticated using (true) with check (true);
create policy "Auth users manage projects" on public.projects for all to authenticated using (true) with check (true);
create policy "Auth users manage project_milestones" on public.project_milestones for all to authenticated using (true) with check (true);
create policy "Auth users manage invoices" on public.invoices for all to authenticated using (true) with check (true);
create policy "Auth users manage payments" on public.payments for all to authenticated using (true) with check (true);
create policy "Auth users manage agent_executions" on public.agent_executions for all to authenticated using (true) with check (true);

-- Grant privileges to anon, authenticated, service_role
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

