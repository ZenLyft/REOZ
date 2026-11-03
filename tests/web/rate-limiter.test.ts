import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  resetLoginRateLimit,
} from '../../apps/web/src/lib/security/rate-limiter';

describe('Authentication Rate Limiter', () => {
  const testIp = '192.168.1.100:test@zenlyft.in';

  beforeEach(() => {
    resetLoginRateLimit(testIp);
  });

  it('allows initial login attempt with full remaining quota', () => {
    const status = checkLoginRateLimit(testIp);
    expect(status.isBlocked).toBe(false);
    expect(status.remainingAttempts).toBe(5);
  });

  it('decrements remaining attempts on failed login', () => {
    const status1 = recordFailedLoginAttempt(testIp);
    expect(status1.remainingAttempts).toBe(4);
    expect(status1.isBlocked).toBe(false);

    const status2 = recordFailedLoginAttempt(testIp);
    expect(status2.remainingAttempts).toBe(3);
    expect(status2.isBlocked).toBe(false);
  });

  it('enforces lockout after exceeding max attempts (5)', () => {
    for (let i = 0; i < 4; i++) {
      recordFailedLoginAttempt(testIp);
    }
    const finalAttempt = recordFailedLoginAttempt(testIp);
    expect(finalAttempt.isBlocked).toBe(true);
    expect(finalAttempt.remainingAttempts).toBe(0);
    expect(finalAttempt.lockoutRemainingMinutes).toBeGreaterThan(0);

    // Subsequent check must also return blocked
    const checkAgain = checkLoginRateLimit(testIp);
    expect(checkAgain.isBlocked).toBe(true);
  });

  it('resets lockout on explicit reset (successful login)', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedLoginAttempt(testIp);
    }
    expect(checkLoginRateLimit(testIp).isBlocked).toBe(true);

    resetLoginRateLimit(testIp);
    const postReset = checkLoginRateLimit(testIp);
    expect(postReset.isBlocked).toBe(false);
    expect(postReset.remainingAttempts).toBe(5);
  });
});
