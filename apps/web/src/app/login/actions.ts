'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { checkLoginRateLimit, recordFailedLoginAttempt, resetLoginRateLimit } from '@/lib/security/rate-limiter';
import { logAuditEvent } from '@/lib/audit';

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid business email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  returnUrl: z.string().optional(),
});

export type LoginActionState = {
  error?: string;
  fieldErrors?: {
    email?: string[];
    password?: string[];
  };
  lockedOut?: boolean;
};

export async function loginAction(
  prevState: LoginActionState | null,
  formData: FormData
): Promise<LoginActionState> {
  const headerList = headers();
  const clientIp =
    headerList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headerList.get('x-real-ip') ||
    '127.0.0.1';

  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
    returnUrl: formData.get('returnUrl') || '/dashboard',
  };

  // 1. Zod input validation
  const validated = LoginSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      fieldErrors: validated.error.flatten().fieldErrors,
    };
  }

  const { email, password, returnUrl } = validated.data;
  const rateLimitKey = `${clientIp}:${email.toLowerCase()}`;

  // 2. Brute-force rate limit pre-check
  const rateCheck = checkLoginRateLimit(rateLimitKey);
  if (rateCheck.isBlocked) {
    await logAuditEvent({
      actorType: 'system',
      actorId: clientIp,
      action: 'login_blocked_rate_limit',
      objectType: 'auth',
      objectId: email,
      result: 'blocked',
      metadata: { ip: clientIp, lockoutMinutes: rateCheck.lockoutRemainingMinutes },
    });

    return {
      error: `Too many failed login attempts. Please wait ${rateCheck.lockoutRemainingMinutes || 15} minute(s) before trying again.`,
      lockedOut: true,
    };
  }

  // 3. Supabase authentication
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    const postFailCheck = recordFailedLoginAttempt(rateLimitKey);

    await logAuditEvent({
      actorType: 'user',
      actorId: email,
      action: 'login_failed',
      objectType: 'auth',
      objectId: email,
      result: 'failure',
      metadata: { ip: clientIp, reason: error?.message || 'Invalid credentials' },
    });

    if (postFailCheck.isBlocked) {
      return {
        error: `Account temporarily locked due to repeated failed attempts. Please retry in ${postFailCheck.lockoutRemainingMinutes || 15} minutes.`,
        lockedOut: true,
      };
    }

    return {
      error: `Invalid email or password. (${postFailCheck.remainingAttempts} attempts remaining before temporary lockout)`,
    };
  }

  // 4. Success: Reset rate limiter & log success
  resetLoginRateLimit(rateLimitKey);

  await logAuditEvent({
    actorType: 'user',
    actorId: data.user.id,
    action: 'login_successful',
    objectType: 'auth',
    objectId: data.user.id,
    result: 'success',
    metadata: { email, ip: clientIp },
  });

  // 5. Safe redirect
  const safeReturn = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/dashboard';
  redirect(safeReturn);
}
