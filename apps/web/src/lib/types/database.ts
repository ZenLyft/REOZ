export type UserRole = 'founder' | 'team_member';
export type ActorType = 'user' | 'agent' | 'system';
export type OrgType = 'local_business' | 'institution';

export type WebsiteStatus =
  | 'not_found_in_checked_sources'
  | 'verified'
  | 'unavailable_at_check'
  | 'appears_outdated'
  | 'needs_review'
  | 'not_enough_evidence';

export type PipelineStage =
  | 'discovered'
  | 'qualified'
  | 'contacted'
  | 'replied'
  | 'proposal'
  | 'won'
  | 'lost'
  | 'not_a_fit'
  | 'do_not_contact'
  | 'on_hold';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ApprovalStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'sent'
  | 'cancelled';

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'suspended' | 'deactivated';
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_type: ActorType;
  actor_id: string;
  action: string;
  object_type: string;
  object_id: string;
  timestamp: string;
  result: 'success' | 'failure' | 'blocked';
  metadata_without_secrets: Record<string, unknown>;
}

export interface SystemSetting {
  key: string;
  value: Record<string, unknown>;
  description?: string;
  updated_at: string;
}
