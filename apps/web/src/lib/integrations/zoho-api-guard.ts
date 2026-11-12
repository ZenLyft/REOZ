import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { buildAscensionHeaders, getAscensionConfig } from '@/lib/integrations/ascension-client';

const rateWindowMap = new Map<string, { count: number; windowStart: number }>();

export function checkEndpointRateLimit(
  bucketKey: string,
  maxRequests = 30,
  windowMs = 60_000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateWindowMap.get(bucketKey);
  if (!entry || now - entry.windowStart > windowMs) {
    rateWindowMap.set(bucketKey, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000));
    return { allowed: false, retryAfterSec };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export async function requireFounderSession(
  req: NextRequest,
  options: { requireFounderRole?: boolean; rateBucket?: string; maxRequests?: number } = {}
): Promise<
  | { ok: true; userId: string; userEmail: string; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; response: NextResponse }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'AUTHENTICATION_REQUIRED: Founder login required.' },
        { status: 401 }
      ),
    };
  }

  const bucket = `${options.rateBucket || req.nextUrl.pathname}:${user.id}`;
  const rate = checkEndpointRateLimit(bucket, options.maxRequests ?? 40, 60_000);
  if (!rate.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'RATE_LIMIT_EXCEEDED: Too many requests. Please wait briefly.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
      ),
    };
  }

  const admin = createAdminClient();
  if (options.requireFounderRole) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role, status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile && (profile.status !== 'active' || profile.role !== 'founder')) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'FORBIDDEN: Only active Founder accounts may perform this action.' },
          { status: 403 }
        ),
      };
    }
  }

  return { ok: true, userId: user.id, userEmail: user.email || 'founder', admin };
}

export async function proxyAscensionZohoIfLocalUnconfigured(params: {
  path: string;
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  forceRemote?: boolean;
}): Promise<{ proxied: boolean; status?: number; json?: any }> {
  const hasLocalCreds = Boolean(
    process.env.ZOHO_CLIENT_ID?.trim() && process.env.ZOHO_CLIENT_SECRET?.trim()
  );
  if (hasLocalCreds && !params.forceRemote) {
    return { proxied: false };
  }

  const { apiUrl } = getAscensionConfig();
  if (!apiUrl) {
    return { proxied: false };
  }

  try {
    const res = await fetch(`${apiUrl}${params.path}`, {
      method: params.method || 'GET',
      headers: buildAscensionHeaders(),
      body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { rawText: text };
    }
    return { proxied: true, status: res.status, json };
  } catch {
    return { proxied: false };
  }
}

