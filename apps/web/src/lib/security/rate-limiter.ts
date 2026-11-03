/**
 * Rate Limiter for Authentication & Sensitive Operations
 * Tracks failed attempts within sliding time windows to prevent brute-force attacks.
 */

interface RateLimitRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

const attemptsMap = new Map<string, RateLimitRecord>();

// Configuration defaults
const MAX_ATTEMPTS = parseInt(process.env.AUTH_MAX_FAILED_ATTEMPTS || '5', 10);
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const LOCKOUT_MS = parseInt(process.env.AUTH_LOCKOUT_MINUTES || '15', 10) * 60 * 1000;

export interface RateLimitCheckResult {
  isBlocked: boolean;
  remainingAttempts: number;
  lockoutRemainingMinutes?: number;
}

export function checkLoginRateLimit(identifier: string): RateLimitCheckResult {
  const now = Date.now();
  const record = attemptsMap.get(identifier);

  if (!record) {
    return {
      isBlocked: false,
      remainingAttempts: MAX_ATTEMPTS,
    };
  }

  // Check if currently locked out
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingMs = record.lockedUntil - now;
    return {
      isBlocked: true,
      remainingAttempts: 0,
      lockoutRemainingMinutes: Math.ceil(remainingMs / (60 * 1000)),
    };
  }

  // If lockout expired or window passed, reset
  if (now - record.firstAttemptAt > WINDOW_MS) {
    attemptsMap.delete(identifier);
    return {
      isBlocked: false,
      remainingAttempts: MAX_ATTEMPTS,
    };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - record.count);
  return {
    isBlocked: remaining <= 0,
    remainingAttempts: remaining,
  };
}

export function recordFailedLoginAttempt(identifier: string): RateLimitCheckResult {
  const now = Date.now();
  let record = attemptsMap.get(identifier);

  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    record = {
      count: 1,
      firstAttemptAt: now,
      lockedUntil: null,
    };
  } else {
    record.count += 1;
  }

  // Check if lockout threshold reached
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }

  attemptsMap.set(identifier, record);

  return checkLoginRateLimit(identifier);
}

export function resetLoginRateLimit(identifier: string): void {
  attemptsMap.delete(identifier);
}
