-- =====================================================================
-- ZENLYFT REVENUE ENGINE - AUTONOMOUS OUTREACH & IPHONE PWA PUSH MIGRATION
-- Migration: 20261112000002_autonomous_pwa_notifications.sql
-- =====================================================================

-- 1. Extend system_settings with founder-authorized autonomous flags
alter table public.system_settings
  add column if not exists auto_pilot_enabled boolean not null default true,
  add column if not exists auto_send_first_cold boolean not null default true,
  add column if not exists notify_every_event boolean not null default true,
  add column if not exists next_permission_founder_only boolean not null default true;

-- Ensure approvals & outreach_drafts have created_at for deterministic sorting
alter table public.approvals
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now());

alter table public.outreach_drafts
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now());

-- Default Founder-granted Autopilot Level 3 (1st cold auto-send; next steps founder-gated)
update public.system_settings
set
  autonomy_level = case when autonomy_level < 3 then 3 else autonomy_level end,
  evolution_api_auto_send = true,
  auto_pilot_enabled = true,
  auto_send_first_cold = true,
  notify_every_event = true,
  next_permission_founder_only = true,
  updated_at = now()
where id = 'zenlyft-global-settings';

-- 2. iPhone / Desktop PWA Web Push Subscriptions
create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text not null default 'iPhone PWA',
  user_agent text,
  is_active boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_push_subscriptions_active
  on public.push_subscriptions(is_active);

-- 3. Founder Live Notifications & Next-Permission Feed
create table if not exists public.founder_notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  category text not null default 'system', -- 'discovery', 'first_cold_sent', 'reply_received', 'permission_required', 'openwa_alert', 'system'
  title text not null,
  body text not null,
  url text not null default '/dashboard/approvals',
  lead_id uuid references public.leads(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_founder_notifications_created
  on public.founder_notifications(created_at desc);

create index if not exists idx_founder_notifications_unread
  on public.founder_notifications(read_at)
  where read_at is null;

-- 4. RLS & Grants
alter table public.push_subscriptions enable row level security;
alter table public.founder_notifications enable row level security;

drop policy if exists "Auth users manage push_subscriptions" on public.push_subscriptions;
create policy "Auth users manage push_subscriptions"
  on public.push_subscriptions for all to authenticated using (true) with check (true);

drop policy if exists "Auth users manage founder_notifications" on public.founder_notifications;
create policy "Auth users manage founder_notifications"
  on public.founder_notifications for all to authenticated using (true) with check (true);

grant all on public.push_subscriptions, public.founder_notifications to authenticated, service_role;

