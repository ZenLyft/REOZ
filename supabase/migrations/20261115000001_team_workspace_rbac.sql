-- ======================================================================
-- REOZ REVENUE ENGINE: DATABASE MIGRATION 20261115000001
-- TEAM WORKSPACE, ROLE-BASED ACCESS CONTROL (RBAC) & LEAD ASSIGNMENT
-- ======================================================================

-- 1. Upgrade user roles enum if applicable, or support canonical role strings
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'MARKETING';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DEVELOPER';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SALES_EXECUTIVE';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Upgrade public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'operations',
  ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Ensure status check includes 'suspended' and 'deactivated'
DO $$ BEGIN
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'suspended', 'deactivated'));
EXCEPTION
  WHEN others THEN null;
END $$;

-- 3. Team Invitations Table (One-time, cryptographically hashed token)
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'MARKETING', 'DEVELOPER', 'SALES_EXECUTIVE')),
  department TEXT NOT NULL,
  custom_permissions TEXT[] NOT NULL DEFAULT '{}',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON public.team_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON public.team_invitations(email);

-- 4. Lead Assignment Audit Trail
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_assignee UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead_id ON public.lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_assigned_to ON public.lead_assignments(assigned_to);

-- 5. Developer Work & Task Items
CREATE TABLE IF NOT EXISTS public.dev_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'feature' CHECK (task_type IN ('feature', 'bug', 'deployment', 'refactor')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'code_review', 'done')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_tasks_assigned_to ON public.dev_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_dev_tasks_status ON public.dev_tasks(status);

