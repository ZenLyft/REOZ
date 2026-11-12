import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { completeZohoOAuthCallback } from '@/lib/integrations/zoho-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const oauthError = url.searchParams.get('error');
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const accountsServer = url.searchParams.get('accounts-server');
  const location = url.searchParams.get('location');

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

  if (oauthError) {
    const desc = url.searchParams.get('error_description') || oauthError;
    const redirectUrl = new URL('/dashboard/settings', url.origin);
    redirectUrl.searchParams.set('zoho_error', desc);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code || !state) {
    const redirectUrl = new URL('/dashboard/settings', url.origin);
    redirectUrl.searchParams.set('zoho_error', 'Missing OAuth authorization code or CSRF state.');
    return NextResponse.redirect(redirectUrl);
  }

  const res = await completeZohoOAuthCallback(admin, {
    code,
    state,
    accountsServer,
    location,
    actorUserId: user?.id || null,
  });

  const redirectUrl = new URL(res.returnTo || '/dashboard/settings', url.origin);
  if (res.success) {
    redirectUrl.searchParams.set('zoho', 'connected');
    if (res.selectedSenderEmail) {
      redirectUrl.searchParams.set('sender', res.selectedSenderEmail);
    }
  } else {
    redirectUrl.searchParams.set('zoho_error', res.error || 'Zoho OAuth verification failed.');
  }
  return NextResponse.redirect(redirectUrl);
}

