-- =====================================================================
-- ZENLYFT CLIENT ENGINE - DYNAMIC PERSONALIZED OUTREACH SCHEMA EXTENSIONS
-- Migration: 20261112000003_research_driven_outreach.sql
-- Non-destructive extension of leads, outreach_drafts & approvals
-- =====================================================================

alter table public.leads
  add column if not exists research_profile jsonb not null default '{}'::jsonb,
  add column if not exists business_needs jsonb not null default '[]'::jsonb,
  add column if not exists research_evidence jsonb not null default '[]'::jsonb,
  add column if not exists recommended_service text,
  add column if not exists recommended_solution text,
  add column if not exists discovery_question text,
  add column if not exists research_confidence text,
  add column if not exists whatsapp_draft text,
  add column if not exists email_subject text,
  add column if not exists email_draft text,
  add column if not exists message_quality_score integer not null default 0,
  add column if not exists message_hash text,
  add column if not exists approval_status text not null default 'PENDING',
  add column if not exists approval_timestamp timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists dispatch_status text not null default 'NOT_SENT';

alter table public.outreach_drafts
  add column if not exists subject text,
  add column if not exists template_version text not null default 'research-v2',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_leads_research_confidence
  on public.leads(research_confidence);

create index if not exists idx_leads_dispatch_status
  on public.leads(dispatch_status);

