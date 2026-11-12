-- ======================================================================
-- ZENLYFT CLIENT ENGINE: ZOHO MAIL INTEGRATION SCHEMA
-- Non-destructive migration adding OAuth connection storage, account
-- discovery, email conversations, inbound/outbound messages, incremental
-- sync state, email approvals, suppressions, and delivery logs.
-- ======================================================================

-- 1. Ephemeral CSRF OAuth state tokens (10-minute TTL)
CREATE TABLE IF NOT EXISTS public.zoho_oauth_states (
  state_token TEXT PRIMARY KEY,
  user_id UUID,
  return_to TEXT NOT NULL DEFAULT '/dashboard/settings',
  expected_dc TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_zoho_oauth_states_expires
  ON public.zoho_oauth_states(expires_at);

-- 2. Zoho OAuth connections (encrypted refresh tokens at rest)
CREATE TABLE IF NOT EXISTS public.zoho_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_key TEXT NOT NULL UNIQUE DEFAULT 'primary',
  status TEXT NOT NULL DEFAULT 'DISCONNECTED'
    CHECK (status IN ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'SYNCING', 'SYNC_ERROR', 'AUTH_EXPIRED')),
  accounts_base_url TEXT NOT NULL DEFAULT 'https://accounts.zoho.in',
  mail_api_base_url TEXT NOT NULL DEFAULT 'https://mail.zoho.in',
  data_center TEXT NOT NULL DEFAULT 'in',
  encrypted_refresh_token TEXT,
  encrypted_access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  token_type TEXT NOT NULL DEFAULT 'Zoho-oauthtoken',
  scopes TEXT[] NOT NULL DEFAULT ARRAY['ZohoMail.accounts.READ', 'ZohoMail.messages.READ', 'ZohoMail.messages.CREATE'],
  selected_account_id TEXT,
  selected_account_email TEXT,
  selected_sender_email TEXT,
  selected_sender_name TEXT,
  connected_by UUID,
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Discovered Zoho Mail accounts & authorized sender profiles
CREATE TABLE IF NOT EXISTS public.zoho_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID NOT NULL REFERENCES public.zoho_connections(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL UNIQUE,
  primary_email TEXT NOT NULL,
  display_name TEXT,
  account_name TEXT,
  send_mail_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  incoming_blocked BOOLEAN NOT NULL DEFAULT false,
  outgoing_blocked BOOLEAN NOT NULL DEFAULT false,
  is_selected BOOLEAN NOT NULL DEFAULT false,
  raw_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_zoho_accounts_conn
  ON public.zoho_accounts(connection_id);

-- 4. Email conversations linked to leads (or unmatched inbound)
CREATE TABLE IF NOT EXISTS public.email_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  thread_id TEXT,
  subject TEXT NOT NULL DEFAULT '(No Subject)',
  prospect_email TEXT NOT NULL,
  sender_address TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  reply_classification TEXT,
  ai_suggested_reply TEXT,
  ai_reply_rationale TEXT,
  message_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_email_conversations_lead
  ON public.email_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_conversations_thread
  ON public.email_conversations(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_conversations_prospect
  ON public.email_conversations(prospect_email);

-- 5. Email messages (outbound + inbound) with deduplication & security metadata
CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.email_conversations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  zoho_account_id TEXT,
  zoho_message_id TEXT UNIQUE,
  internet_message_id TEXT,
  thread_id TEXT,
  in_reply_to TEXT,
  references_header JSONB NOT NULL DEFAULT '[]'::jsonb,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  from_address TEXT NOT NULL,
  to_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to TEXT,
  subject TEXT NOT NULL DEFAULT '',
  html_body TEXT,
  text_body TEXT NOT NULL DEFAULT '',
  clean_snippet TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'DRAFT_PENDING'
    CHECK (delivery_status IN (
      'DRAFT_PENDING', 'APPROVED', 'SENDING', 'ACCEPTED', 'SENT',
      'FAILED', 'DELIVERY_STATUS_UNKNOWN', 'REJECTED', 'RECEIVED'
    )),
  reply_classification TEXT,
  is_unmatched BOOLEAN NOT NULL DEFAULT false,
  has_prompt_injection BOOLEAN NOT NULL DEFAULT false,
  security_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key TEXT UNIQUE,
  raw_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_or_sent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_email_messages_lead
  ON public.email_messages(lead_id, received_or_sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_conv
  ON public.email_messages(conversation_id, received_or_sent_at ASC);
CREATE INDEX IF NOT EXISTS idx_email_messages_unmatched
  ON public.email_messages(is_unmatched) WHERE is_unmatched = true;

-- 6. Incremental inbox sync cursors & exponential backoff tracking
CREATE TABLE IF NOT EXISTS public.email_sync_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id TEXT NOT NULL UNIQUE,
  folder_id TEXT NOT NULL DEFAULT 'inbox',
  last_sync_cursor TEXT,
  last_synced_message_time_ms BIGINT NOT NULL DEFAULT 0,
  last_sync_started_at TIMESTAMPTZ,
  last_sync_completed_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INT NOT NULL DEFAULT 0,
  backoff_until TIMESTAMPTZ,
  total_synced_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Canonical SHA-256 Email Approvals & Transactional Dispatch Locking
CREATE TABLE IF NOT EXISTS public.email_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES public.outreach_drafts(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES public.approvals(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.email_conversations(id) ON DELETE SET NULL,
  sender_address TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  cc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to TEXT,
  subject TEXT NOT NULL,
  html_body TEXT,
  text_body TEXT NOT NULL,
  rationale TEXT,
  verified_research JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_service TEXT,
  campaign_id TEXT NOT NULL DEFAULT 'default',
  campaign_name TEXT NOT NULL DEFAULT 'ZenLyft Direct Outreach',
  template_version TEXT NOT NULL DEFAULT 'research-v2',
  channel TEXT NOT NULL DEFAULT 'email',
  canonical_hash TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'DRAFT_PENDING'
    CHECK (approval_status IN (
      'DRAFT_PENDING', 'APPROVED', 'SENDING', 'ACCEPTED', 'SENT',
      'FAILED', 'DELIVERY_STATUS_UNKNOWN', 'REJECTED', 'CANCELLED'
    )),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  dispatch_lock_token TEXT,
  dispatch_locked_at TIMESTAMPTZ,
  zoho_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_email_approvals_lead
  ON public.email_approvals(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_approvals_status
  ON public.email_approvals(approval_status);

-- 8. Email opt-out & unsubscribe suppression registry
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT 'unsubscribe_request',
  source_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Detailed email delivery attempt logs (accepted vs sent vs failed vs unknown)
CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_approval_id UUID REFERENCES public.email_approvals(id) ON DELETE SET NULL,
  email_message_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  sender_address TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('ACCEPTED', 'SENT', 'FAILED', 'DELIVERY_STATUS_UNKNOWN')),
  zoho_message_id TEXT,
  http_status INT,
  error_message TEXT,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_approval
  ON public.email_delivery_logs(email_approval_id, created_at DESC);

-- RLS Policies (authenticated founder/team access; service role bypasses RLS)
ALTER TABLE public.zoho_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'zoho_connections',
    'zoho_accounts',
    'email_conversations',
    'email_messages',
    'email_sync_state',
    'email_approvals',
    'email_suppressions',
    'email_delivery_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Auth full access %I" ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "Auth full access %I" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      tbl, tbl
    );
  END LOOP;
END $$;

