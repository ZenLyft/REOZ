-- REOZ 3.0: Complete Deal Closing Pipeline, Product Divisions & Customer Onboarding Schema
-- Author: Niresh Senthoor (Founder & CEO, ZenLyft)
-- Date: 2026-11-15

-- 1. Extend leads table with REOZ 3.0 commercial and deal tracking attributes
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS revenue_division TEXT CHECK (revenue_division IN ('division_a_digital', 'division_b_institutional')),
  ADD COLUMN IF NOT EXISTS disqualification_reason TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS estimated_value_inr NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_quote_inr NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost_inr NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_margin_percent NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cohort_week VARCHAR(10),
  ADD COLUMN IF NOT EXISTS meeting_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meeting_outcome TEXT,
  ADD COLUMN IF NOT EXISTS proposal_id UUID,
  ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;

-- 2. Meetings & Demonstration Management Table
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  meeting_link TEXT,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'rescheduled', 'cancelled', 'no_show')) DEFAULT 'scheduled',
  brief JSONB DEFAULT '{}'::jsonb,
  discovery_questions JSONB DEFAULT '[]'::jsonb,
  outcome TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Branded Proposals & Commercial Quotations Table
CREATE TABLE IF NOT EXISTS public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  division TEXT NOT NULL CHECK (division IN ('division_a_digital', 'division_b_institutional')),
  product_name TEXT NOT NULL,
  scope TEXT NOT NULL,
  deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclusions TEXT,
  timeline_days INTEGER NOT NULL DEFAULT 14,
  quote_inr NUMERIC(12, 2) NOT NULL,
  delivery_cost_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross_margin_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  payment_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected')) DEFAULT 'draft',
  founder_approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Customer Onboarding & Delivery Checklists Table
CREATE TABLE IF NOT EXISTS public.onboarding_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  service_line TEXT NOT NULL,
  project_name TEXT NOT NULL,
  contracted_value_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  implementation_owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_client_inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('pending_intake', 'in_progress', 'client_review', 'completed')) DEFAULT 'pending_intake',
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes for fast cohort and stage querying
CREATE INDEX IF NOT EXISTS idx_leads_cohort_week ON public.leads(cohort_week);
CREATE INDEX IF NOT EXISTS idx_leads_revenue_division ON public.leads(revenue_division);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON public.leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_meetings_lead_id ON public.meetings(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON public.proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_projects_lead_id ON public.onboarding_projects(lead_id);

