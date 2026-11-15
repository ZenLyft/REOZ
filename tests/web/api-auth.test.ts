import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyApiCaller, enforceApiAuth } from '@/lib/security/api-auth';

describe('Zero-Trust API Security Gate — verifyApiCaller & enforceApiAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.AUTOPILOT_SECRET = 'zenlyft-autopilot-production-secret-2026';
    process.env.CRON_SECRET = 'zenlyft-cron-secure-token-production-2026';
  });

  it('rejects unauthenticated requests lacking founder session and bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents/discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const authResult = await verifyApiCaller(req);
    expect(authResult.authenticated).toBe(false);
    expect(authResult.actorId).toBe('anonymous');

    const blockedResponse = await enforceApiAuth(req);
    expect(blockedResponse).not.toBeNull();
    expect(blockedResponse?.status).toBe(401);

    const body = await blockedResponse?.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Unauthorized');
  });

  it('accepts valid Bearer token matching authorized environment secret', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents/discovery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer zenlyft-autopilot-production-secret-2026',
      },
    });

    const authResult = await verifyApiCaller(req);
    expect(authResult.authenticated).toBe(true);
    expect(authResult.actorType).toBe('service');

    const blockedResponse = await enforceApiAuth(req);
    expect(blockedResponse).toBeNull();
  });

  it('accepts valid X-API-Key header matching authorized environment secret', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'zenlyft-cron-secure-token-production-2026',
      },
    });

    const authResult = await verifyApiCaller(req);
    expect(authResult.authenticated).toBe(true);
    expect(authResult.actorType).toBe('service');

    const blockedResponse = await enforceApiAuth(req);
    expect(blockedResponse).toBeNull();
  });

  it('rejects tampered or unauthorized bearer tokens', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents/discovery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer attacker-fake-token-attempt',
      },
    });

    const authResult = await verifyApiCaller(req);
    expect(authResult.authenticated).toBe(false);

    const blockedResponse = await enforceApiAuth(req);
    expect(blockedResponse?.status).toBe(401);
  });

  it('fails closed when secrets are empty or too short (<16 chars)', async () => {
    process.env.AUTOPILOT_SECRET = 'short';
    process.env.CRON_SECRET = '';

    const req = new NextRequest('http://localhost:3000/api/agents/discovery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer short',
      },
    });

    const authResult = await verifyApiCaller(req);
    expect(authResult.authenticated).toBe(false);

    const blockedResponse = await enforceApiAuth(req);
    expect(blockedResponse?.status).toBe(401);
  });
});

