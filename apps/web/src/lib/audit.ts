import { createAdminClient } from './supabase/server';
import type { ActorType } from './types/database';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'service_role_key',
  'anon_key',
  'bot_token',
]);

/**
 * Sanitizes metadata objects by deeply stripping known sensitive keys.
 */
export function sanitizeMetadata(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return {};
  }

  if (Array.isArray(data)) {
    return { list: data.map(sanitizeMetadata) };
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret')) {
      sanitized[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      sanitized[key] = sanitizeMetadata(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

export interface LogAuditParams {
  actorType: ActorType;
  actorId: string;
  action: string;
  objectType: string;
  objectId: string;
  result: 'success' | 'failure' | 'blocked';
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent({
  actorType,
  actorId,
  action,
  objectType,
  objectId,
  result,
  metadata = {},
}: LogAuditParams): Promise<void> {
  const sanitizedMeta = sanitizeMetadata(metadata);

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('audit_log').insert({
      actor_type: actorType,
      actor_id: actorId,
      action,
      object_type: objectType,
      object_id: objectId,
      result,
      metadata_without_secrets: sanitizedMeta,
    });

    if (error) {
      console.error('[AUDIT LOG ERROR] Failed to record audit log:', error.message);
    }
  } catch (err) {
    // Audit logging should never crash the main application, but should report to server console
    console.error('[AUDIT LOG EXCEPTION]:', err);
  }
}
