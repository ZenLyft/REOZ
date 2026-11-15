-- REOZ 3.0: Admin-Controlled Unique Team Credentials & Account Management
-- Author: Niresh Senthoor (Founder & CEO, ZenLyft)
-- Date: 2026-11-15

-- 1. Extend profiles with Employee ID, Username, Job Title, and Security Tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_id TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Ensure unique constraints on username and employee_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(LOWER(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.profiles(LOWER(employee_id)) WHERE employee_id IS NOT NULL;

-- 2. Extend team_invitations with Employee ID, Username, and Job Title
ALTER TABLE public.team_invitations
  ADD COLUMN IF NOT EXISTS employee_id TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_username ON public.team_invitations(LOWER(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_employee_id ON public.team_invitations(LOWER(employee_id)) WHERE employee_id IS NOT NULL;

-- 3. Expand status constraint on profiles if exists
DO $$
BEGIN
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'suspended', 'deactivated', 'invitation_pending'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
