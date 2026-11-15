import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface ApiAuthResult {
  authenticated: boolean;
  actorType: 'founder' | 'cron' | 'service';
  actorId: string;
  error?: string;
}

/**
 * Validates request authorization:
 * 1. Authenticated founder session via Supabase Auth Cookie (JWT).
 * 2. Authorized bearer token in Authorization: Bearer <secret> or X-API-Key: <secret>.
 * Strict Fail-Closed Security: Rejects with 401 if credentials/secrets are missing or mismatched.
 */
export async function verifyApiCaller(req: NextRequest): Promise<ApiAuthResult> {
  // 1. Check Bearer Token or X-API-Key against valid environment secrets
  const authHeader = req.headers.get('authorization') || '';
  const apiKeyHeader = req.headers.get('x-api-key') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const tokenToVerify = bearerToken || apiKeyHeader.trim();

  const validSecrets = [
    process.env.AUTOPILOT_SECRET,
    process.env.CRON_SECRET,
    process.env.ASCENSION_API_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((s): s is string => Boolean(s && s.trim().length >= 16));

  if (tokenToVerify && validSecrets.length > 0) {
    const matched = validSecrets.some((secret) => tokenToVerify === secret.trim());
    if (matched) {
      return {
        authenticated: true,
        actorType: 'service',
        actorId: 'system_service_key',
      };
    }
  }

  // 2. Check Founder Session via Supabase Auth Cookie
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (user && !userErr) {
      return {
        authenticated: true,
        actorType: 'founder',
        actorId: user.id,
      };
    }
  } catch {
    // Fail-closed on session inspection failure
  }

  return {
    authenticated: false,
    actorType: 'founder',
    actorId: 'anonymous',
    error: 'Unauthorized: Founder session or valid bearer token required.',
  };
}

/**
 * Gatekeeper for Next.js API route handlers.
 * Returns null if authorized, or a 401 NextResponse if unauthorized.
 */
export async function enforceApiAuth(req: NextRequest): Promise<NextResponse | null> {
  const result = await verifyApiCaller(req);
  if (!result.authenticated) {
    return NextResponse.json(
      { success: false, error: result.error || 'Unauthorized: Access restricted to ZenLyft Founder.' },
      { status: 401 }
    );
  }
  return null;
}

