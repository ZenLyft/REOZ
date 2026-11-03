import { describe, it, expect } from 'vitest';
import { sanitizeMetadata } from '../../apps/web/src/lib/audit';

describe('Audit Log Sanitization (Zero Secret Leakage)', () => {
  it('strips plain password fields from metadata', () => {
    const raw = {
      email: 'founder@zenlyft.in',
      password: 'superSecretPassword123!',
      action: 'login',
    };

    const sanitized = sanitizeMetadata(raw);
    expect(sanitized.email).toBe('founder@zenlyft.in');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.action).toBe('login');
  });

  it('strips API keys, bot tokens, and auth headers', () => {
    const raw = {
      api_key: 'AIzaSyFakeKeyHere',
      bot_token: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      service_role_key: 'eyJhSecretRoleKey',
      safe_param: 'search_query_clinic',
    };

    const sanitized = sanitizeMetadata(raw);
    expect(sanitized.api_key).toBe('[REDACTED]');
    expect(sanitized.bot_token).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.service_role_key).toBe('[REDACTED]');
    expect(sanitized.safe_param).toBe('search_query_clinic');
  });

  it('recursively sanitizes nested objects and arrays', () => {
    const nested = {
      user: {
        profile: {
          user_secret: 'nestedSecret',
          displayName: 'Niresh',
        },
      },
      tokens: ['token1', 'token2'],
    };

    const sanitized = sanitizeMetadata(nested);
    const user = sanitized.user as Record<string, Record<string, unknown>>;
    expect(user.profile.user_secret).toBe('[REDACTED]');
    expect(user.profile.displayName).toBe('Niresh');
  });
});
