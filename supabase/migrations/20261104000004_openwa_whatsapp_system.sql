-- =====================================================================
-- ZENLYFT REVENUE ENGINE - OPENWA WHATSAPP SYSTEM MIGRATION
-- Migration: 20261104000004_openwa_whatsapp_system.sql
-- Covers: WhatsApp Sessions, Messages, Webhook Events, Followup Cadence
-- =====================================================================

-- 1. WhatsApp Sessions Table
create table if not exists public.whatsapp_sessions (
  id text primary key, -- e.g. 'zenlyft-wa-01' or openwa session UUID
  name text not null,
  status text not null default 'created', -- 'created', 'initializing', 'qr_ready', 'authenticating', 'ready', 'disconnected', 'action_required', 'failed'
  phone text,
  push_name text,
  qr_code text,
  engine text not null default 'baileys',
  is_active boolean not null default true,
  last_error text,
  last_active_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Seed default dedicated business test session
insert into public.whatsapp_sessions (id, name, status, engine, is_active)
values ('zenlyft-wa-01', 'ZenLyft Business Acquisition (Dedicated)', 'created', 'baileys', true)
on conflict (id) do nothing;

-- 2. WhatsApp Messages & Conversations
create table if not exists public.whatsapp_messages (
  id uuid default gen_random_uuid() primary key,
  session_id text not null references public.whatsapp_sessions(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  chat_id text not null, -- e.g. '919876543210@c.us'
  sender_number text not null,
  recipient_number text not null,
  direction text not null default 'outbound', -- 'inbound', 'outbound'
  body text not null,
  message_type text not null default 'chat',
  status text not null default 'draft', -- 'draft', 'pending_approval', 'approved', 'rejected', 'queued', 'submitted', 'sent', 'delivered', 'read', 'failed', 'cancelled'
  external_message_id text,
  approval_hash text,
  approval_id uuid references public.approvals(id) on delete set null,
  ai_classification text, -- 'interested', 'requesting_info', 'asking_pricing', 'requesting_demo', 'wants_meeting', 'not_interested', 'not_right_contact', 'opt_out', 'support_request', 'general_enquiry', 'unclear'
  ai_intent_summary text,
  suggested_reply text,
  error_reason text,
  delivery_ack integer default 0,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_whatsapp_messages_chat on public.whatsapp_messages(chat_id);
create index if not exists idx_whatsapp_messages_lead on public.whatsapp_messages(lead_id);
create index if not exists idx_whatsapp_messages_status on public.whatsapp_messages(status);

-- 3. Webhook Delivery Audit & Ingestion Log
create table if not exists public.whatsapp_webhook_events (
  id uuid default gen_random_uuid() primary key,
  session_id text,
  event_name text not null,
  idempotency_key text unique,
  delivery_id text,
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  error text,
  created_at timestamptz default now() not null
);

create index if not exists idx_whatsapp_webhooks_idempotency on public.whatsapp_webhook_events(idempotency_key);

-- 4. Persistent Follow-up Cadence Scheduler (Day 0, 3, 7, 12, 18)
create table if not exists public.whatsapp_followups (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  session_id text not null references public.whatsapp_sessions(id) on delete cascade,
  stage text not null default 'initial', -- 'initial', 'day_3', 'day_7', 'day_12', 'day_18', 'completed', 'opted_out'
  status text not null default 'scheduled', -- 'scheduled', 'awaiting_approval', 'sent', 'cancelled_replied', 'cancelled_optout'
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  notes text,
  created_at timestamptz default now() not null
);

create index if not exists idx_whatsapp_followups_lead on public.whatsapp_followups(lead_id);
create index if not exists idx_whatsapp_followups_status on public.whatsapp_followups(status, scheduled_for);

-- 5. Row Level Security & Permissions
alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_followups enable row level security;

create policy "Auth users manage whatsapp_sessions" on public.whatsapp_sessions for all to authenticated using (true) with check (true);
create policy "Auth users manage whatsapp_messages" on public.whatsapp_messages for all to authenticated using (true) with check (true);
create policy "Auth users manage whatsapp_webhook_events" on public.whatsapp_webhook_events for all to authenticated using (true) with check (true);
create policy "Auth users manage whatsapp_followups" on public.whatsapp_followups for all to authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
