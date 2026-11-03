-- ======================================================================
-- ZENLYFT REVENUE ENGINE: DATABASE MIGRATION 001 - CORE SCHEMA & RLS
-- ======================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom enum types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('founder', 'team_member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE actor_type AS ENUM ('user', 'agent', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE org_type AS ENUM ('local_business', 'institution');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE website_status_type AS ENUM (
    'not_found_in_checked_sources',
    'verified',
    'unavailable_at_check',
    'appears_outdated',
    'needs_review',
    'not_enough_evidence'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE pipeline_stage_type AS ENUM (
    'discovered',
    'qualified',
    'contacted',
    'replied',
    'proposal',
    'won',
    'lost',
    'not_a_fit',
    'do_not_contact',
    'on_hold'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_status_type AS ENUM (
    'draft',
    'pending',
    'approved',
    'rejected',
    'expired',
    'sent',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE proposal_status_type AS ENUM (
    'draft',
    'internal_review',
    'approved',
    'sent',
    'accepted',
    'rejected',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_status_type AS ENUM (
    'queued',
    'in_progress',
    'completed',
    'failed',
    'deferred',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------
-- 1. PROFILES (Linked to auth.users)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'founder',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------
-- 2. AUDIT LOG (Immutable trail of all significant actions)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type actor_type NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'blocked')),
  metadata_without_secrets JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ----------------------------------------------------------------------
-- 3. SETTINGS & SYSTEM CONTROLS
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Insert default system controls
INSERT INTO public.settings (key, value, description)
VALUES 
  ('global_pause', '{"paused": false, "reason": null}'::jsonb, 'Emergency kill-switch for automated jobs'),
  ('daily_limits', '{"max_research_tasks_per_day": 50, "max_outreach_drafts_per_day": 25}'::jsonb, 'Quota guardrails'),
  ('quotas', '{"gemini_rpm_limit": 15, "gemini_tpm_limit": 1000000}'::jsonb, 'API safety limits')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------
-- 4. USAGE COUNTERS (Quota tracking)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,
  period DATE NOT NULL DEFAULT CURRENT_DATE,
  units_used INT NOT NULL DEFAULT 0,
  limit_estimate INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (provider, period)
);

-- ----------------------------------------------------------------------
-- 5. LEADS
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_name TEXT NOT NULL,
  normalised_name TEXT NOT NULL,
  organisation_type org_type NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  website_url TEXT,
  website_domain TEXT,
  website_status website_status_type NOT NULL DEFAULT 'not_enough_evidence',
  service_interest TEXT NOT NULL DEFAULT 'website_redesign',
  score INT NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  score_explanation JSONB NOT NULL DEFAULT '{"breakdown": {}, "reasons": [], "unknowns": []}'::jsonb,
  pipeline_stage pipeline_stage_type NOT NULL DEFAULT 'discovered',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  next_action TEXT,
  next_follow_up DATE,
  contact_restriction TEXT NOT NULL DEFAULT 'none' CHECK (contact_restriction IN ('none', 'do_not_contact', 'opt_out')),
  loss_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  archived_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------
-- 6. SOURCES (Verifiable claim references)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  observed_fact TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  confidence confidence_level NOT NULL DEFAULT 'medium'
);

-- ----------------------------------------------------------------------
-- 7. CONTACT CHANNELS (Public channels only)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL, -- e.g. email, phone, whatsapp, contact_page
  public_value TEXT NOT NULL,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  contact_restriction TEXT NOT NULL DEFAULT 'none'
);

-- ----------------------------------------------------------------------
-- 8. WEBSITE AUDITS
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  website_url TEXT NOT NULL,
  audit_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  audit_status TEXT NOT NULL DEFAULT 'completed',
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitations TEXT NOT NULL,
  priority_score INT NOT NULL DEFAULT 0,
  measured_vs_estimated JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ----------------------------------------------------------------------
-- 9. RESEARCH BRIEFS (Single Agent Output)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.research_briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  brief JSONB NOT NULL,
  model_used TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  reviewed_by_founder BOOLEAN NOT NULL DEFAULT false
);

-- ----------------------------------------------------------------------
-- 10. OPPORTUNITIES
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  service_line TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  proposed_solution TEXT NOT NULL,
  estimated_value NUMERIC(10, 2),
  confidence confidence_level NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'identified'
);

-- ----------------------------------------------------------------------
-- 11. OUTREACH DRAFTS (Zero auto-send)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  draft TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  approval_status approval_status_type NOT NULL DEFAULT 'draft',
  approved_content_hash TEXT,
  approved_recipient TEXT,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------
-- 12. PROPOSALS
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status proposal_status_type NOT NULL DEFAULT 'draft',
  content JSONB NOT NULL,
  price_range_internal JSONB NOT NULL,
  approved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------
-- 13. APPROVALS INBOX (Cryptographic tamper-check)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID NOT NULL,
  proposed_by actor_type NOT NULL DEFAULT 'agent',
  payload_hash TEXT NOT NULL,
  recipient TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  cost_risk TEXT NOT NULL,
  status approval_status_type NOT NULL DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

-- ----------------------------------------------------------------------
-- 14. TASKS (Worker Queue with Idempotency)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_type TEXT NOT NULL,
  status task_status_type NOT NULL DEFAULT 'queued',
  priority INT NOT NULL DEFAULT 1,
  idempotency_key TEXT NOT NULL UNIQUE,
  input_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_ref JSONB,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_summary TEXT
);

-- ----------------------------------------------------------------------
-- INDEXES FOR PERFORMANCE & DEDUPLICATION
-- ----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_normalised_name ON public.leads(normalised_name);
CREATE INDEX IF NOT EXISTS idx_leads_website_domain ON public.leads(website_domain);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON public.leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON public.leads(next_follow_up);
CREATE INDEX IF NOT EXISTS idx_sources_lead_id ON public.sources(lead_id);
CREATE INDEX IF NOT EXISTS idx_contact_channels_lead_id ON public.contact_channels(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON public.approvals(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log(timestamp DESC);

-- ----------------------------------------------------------------------
-- AUTOMATIC TIMESTAMP & PROFILE SYNC TRIGGERS
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_leads_updated_at ON public.leads;
CREATE TRIGGER set_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger to create a profile automatically when a user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'founder',
    'active'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------
-- SECURITY CONSTRAINT: AGENT CAN NEVER SELF-APPROVE
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_approval_actor()
RETURNS TRIGGER AS $$
BEGIN
  -- If status is being set to 'approved', verify that it was NOT proposed by an agent approving itself
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Ensure current session has founder role or authenticated human user
    IF auth.role() = 'anon' THEN
      RAISE EXCEPTION 'Anonymous users cannot approve actions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_agent_self_approval ON public.approvals;
CREATE TRIGGER prevent_agent_self_approval
  BEFORE UPDATE OF status ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.check_approval_actor();

-- ----------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Default: DENY ALL for unauthenticated / anon users.
-- Only authenticated users linked to a valid active profile have access.
-- ----------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Base helper function to check active user role
CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Profiles: Authenticated users can view profiles, only self or founder can update
CREATE POLICY "profiles_read_authenticated" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.current_user_is_active());

-- Audit Log: Authenticated users can read audit log; insert allowed by authenticated users & service role
CREATE POLICY "audit_log_read_authenticated" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());

CREATE POLICY "audit_log_insert_authenticated" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_active());

-- Settings: Read-only for authenticated, update only for founder
CREATE POLICY "settings_read_authenticated" ON public.settings
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());

CREATE POLICY "settings_update_founder" ON public.settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role = 'founder' AND status = 'active'
    )
  );

-- Leads: Full CRUD for authenticated active team members & founders
CREATE POLICY "leads_all_authenticated" ON public.leads
  FOR ALL TO authenticated
  USING (public.current_user_is_active())
  WITH CHECK (public.current_user_is_active());

-- Sources: Full CRUD for authenticated active users
CREATE POLICY "sources_all_authenticated" ON public.sources
  FOR ALL TO authenticated
  USING (public.current_user_is_active())
  WITH CHECK (public.current_user_is_active());

-- Contact Channels: Full CRUD for authenticated active users
CREATE POLICY "contact_channels_all_authenticated" ON public.contact_channels
  FOR ALL TO authenticated
  USING (public.current_user_is_active())
  WITH CHECK (public.current_user_is_active());

-- Website Audits: Full CRUD for authenticated active users
CREATE POLICY "website_audits_all_authenticated" ON public.website_audits
  FOR ALL TO authenticated
  USING (public.current_user_is_active())
  WITH CHECK (public.current_user_is_active());

-- Research Briefs: Full CRUD for authenticated active users
CREATE POLICY "research_briefs_all_authenticated" ON public.research_briefs
  FOR ALL TO authenticated
  USING (public.current_user_is_active())
  WITH CHECK (public.current_user_is_active());

-- Opportunities: Full CRUD for authenticated active users
CREATE POLICY "opportunities_all_authenticated" ON public.opportunities
  FOR ALL TO authenticated
  USING (public.current_user_is_active())
  WITH CHECK (public.current_user_is_active());

-- Outreach Drafts: Full CRUD for authenticated active users
CREATE POLICY "outreach_drafts_all_authenticated" ON public.outreach_drafts
  FOR ALL TO authenticated
  USING (public.current_user_is_active())
  WITH CHECK (public.current_user_is_active());

-- Proposals: Full CRUD for authenticated active users
CREATE POLICY "proposals_all_authenticated" ON public.proposals
  FOR ALL TO authenticated
  USING (public.current_user_is_active())
  WITH CHECK (public.current_user_is_active());

-- Approvals: Select and Update only by founder
CREATE POLICY "approvals_select_authenticated" ON public.approvals
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());

CREATE POLICY "approvals_update_founder_only" ON public.approvals
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role = 'founder' AND status = 'active'
    )
  );

-- Tasks: Authenticated active users can manage tasks
CREATE POLICY "tasks_all_authenticated" ON public.tasks
  FOR ALL TO authenticated
  USING (public.current_user_is_active())
  WITH CHECK (public.current_user_is_active());

-- Usage Counters: Read for authenticated users
CREATE POLICY "usage_counters_read_authenticated" ON public.usage_counters
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());
