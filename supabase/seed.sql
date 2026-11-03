-- ======================================================================
-- ZENLYFT REVENUE ENGINE: SEED DATA / DEV FIXTURES
-- ======================================================================

-- Default settings check
INSERT INTO public.settings (key, value, description)
VALUES 
  ('global_pause', '{"paused": false, "reason": null}'::jsonb, 'Emergency kill-switch for automated jobs'),
  ('daily_limits', '{"max_research_tasks_per_day": 50, "max_outreach_drafts_per_day": 25}'::jsonb, 'Quota guardrails'),
  ('quotas', '{"gemini_rpm_limit": 15, "gemini_tpm_limit": 1000000}'::jsonb, 'API safety limits')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
