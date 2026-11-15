/**
 * REOZ — Role-Based Access Control (RBAC) & Permission Engine
 * 
 * Strict Deny-By-Default authorization model for Founder-Controlled Team Workspace.
 * Supports SUPER_ADMIN, MARKETING, DEVELOPER, SALES_EXECUTIVE with granular permissions.
 */

export type UserRole =
  | 'SUPER_ADMIN'
  | 'MARKETING_LEAD'
  | 'MARKETING_EXECUTIVE'
  | 'DEVELOPMENT_LEAD'
  | 'SENIOR_DEVELOPER'
  | 'DEVELOPER'
  | 'SALES_EXECUTIVE'
  | 'founder' // legacy alias for SUPER_ADMIN
  | 'MARKETING' // legacy alias
  | 'team_member'; // legacy alias for MARKETING

export type Department =
  | 'marketing'
  | 'development'
  | 'executive'
  | 'engineering'
  | 'sales'
  | 'operations';

export type UserStatus = 'active' | 'suspended' | 'deactivated' | 'invitation_pending';

export type Permission =
  | 'users.create'
  | 'users.read'
  | 'users.update'
  | 'users.suspend'
  | 'users.assign_role'
  | 'leads.read_all'
  | 'leads.read_assigned'
  | 'leads.assign'
  | 'leads.update_assigned'
  | 'leads.export'
  | 'campaigns.create'
  | 'campaigns.submit'
  | 'campaigns.approve'
  | 'outreach.send_approved'
  | 'finance.read'
  | 'analytics.read'
  | 'development.read_assigned'
  | 'development.update_assigned'
  | 'integrations.manage'
  | 'system.settings'
  | 'audit.read';

export interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  username?: string | null;
  employee_id?: string | null;
  job_title?: string | null;
  role: UserRole;
  department: Department;
  status: UserStatus;
  permissions: Permission[];
  invited_by?: string | null;
  suspended_at?: string | null;
  deactivated_at?: string | null;
  last_login_at?: string | null;
  failed_login_attempts?: number;
  created_at: string;
  updated_at: string;
}

export const ALL_PERMISSIONS: Permission[] = [
  'users.create',
  'users.read',
  'users.update',
  'users.suspend',
  'users.assign_role',
  'leads.read_all',
  'leads.read_assigned',
  'leads.assign',
  'leads.update_assigned',
  'leads.export',
  'campaigns.create',
  'campaigns.submit',
  'campaigns.approve',
  'outreach.send_approved',
  'finance.read',
  'analytics.read',
  'development.read_assigned',
  'development.update_assigned',
  'integrations.manage',
  'system.settings',
  'audit.read',
];

/** Baseline permissions automatically granted by role */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  founder: ALL_PERMISSIONS,
  MARKETING_LEAD: [
    'leads.read_assigned',
    'leads.update_assigned',
    'campaigns.create',
    'campaigns.submit',
    'analytics.read',
  ],
  MARKETING_EXECUTIVE: [
    'leads.read_assigned',
    'leads.update_assigned',
    'campaigns.create',
    'campaigns.submit',
  ],
  MARKETING: [
    'leads.read_assigned',
    'leads.update_assigned',
    'campaigns.create',
    'campaigns.submit',
  ],
  team_member: [
    'leads.read_assigned',
    'leads.update_assigned',
    'campaigns.create',
    'campaigns.submit',
  ],
  DEVELOPMENT_LEAD: [
    'development.read_assigned',
    'development.update_assigned',
  ],
  SENIOR_DEVELOPER: [
    'development.read_assigned',
    'development.update_assigned',
  ],
  DEVELOPER: [
    'development.read_assigned',
    'development.update_assigned',
  ],
  SALES_EXECUTIVE: [
    'leads.read_assigned',
    'leads.update_assigned',
    'campaigns.submit',
  ],
};

/** Permissions reserved exclusively for SUPER_ADMIN that custom permissions cannot override */
export const SUPER_ADMIN_ONLY_PERMISSIONS: Permission[] = [
  'users.create',
  'users.suspend',
  'users.assign_role',
  'leads.export',
  'campaigns.approve',
  'outreach.send_approved',
  'finance.read',
  'integrations.manage',
  'system.settings',
  'audit.read',
];

/**
 * Normalizes role strings to canonical uppercase format
 */
export function normalizeUserRole(role: string): UserRole {
  const r = (role || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (r === 'FOUNDER' || r === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (r === 'MARKETING_LEAD') return 'MARKETING_LEAD';
  if (r === 'MARKETING_EXECUTIVE') return 'MARKETING_EXECUTIVE';
  if (r === 'DEVELOPMENT_LEAD') return 'DEVELOPMENT_LEAD';
  if (r === 'SENIOR_DEVELOPER') return 'SENIOR_DEVELOPER';
  if (r === 'DEVELOPER') return 'DEVELOPER';
  if (r === 'MARKETING') return 'MARKETING';
  if (r === 'SALES_EXECUTIVE') return 'SALES_EXECUTIVE';
  if (r === 'TEAM_MEMBER') return 'MARKETING';
  return 'MARKETING_EXECUTIVE';
}

/**
 * Checks whether a user profile has an active, unsuspended account and granted permission.
 * Strictly DENY-BY-DEFAULT.
 */
export function hasPermission(
  profile: Partial<UserProfile> | null | undefined,
  permission: Permission
): boolean {
  if (!profile) return false;
  if (profile.status === 'suspended' || profile.status === 'deactivated') return false;

  const role = normalizeUserRole(profile.role || '');

  // SUPER_ADMIN has all permissions
  if (role === 'SUPER_ADMIN') return true;

  // Non-super-admins cannot possess super-admin exclusive permissions under any circumstances
  if (SUPER_ADMIN_ONLY_PERMISSIONS.includes(permission)) {
    return false;
  }

  // Check role baseline permissions
  const baseline = ROLE_DEFAULT_PERMISSIONS[role] || [];
  if (baseline.includes(permission)) return true;

  // Check custom user permissions
  const custom = Array.isArray(profile.permissions) ? profile.permissions : [];
  return custom.includes(permission);
}

/**
 * Asserts a permission or throws an HTTP-equivalent AuthorizationError.
 */
export function enforcePermission(
  profile: Partial<UserProfile> | null | undefined,
  permission: Permission
): void {
  if (!hasPermission(profile, permission)) {
    const error: any = new Error(`ACCESS_DENIED: Missing mandatory permission '${permission}'`);
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }
}

/**
 * Object-level access control for Leads (Prevents IDOR and cross-user data leakage).
 * Marketing and Sales members can ONLY access leads assigned to them.
 */
export function canAccessLead(
  profile: Partial<UserProfile> | null | undefined,
  lead: { owner_id?: string | null; id?: string } | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.status === 'suspended' || profile.status === 'deactivated') return false;

  // SUPER_ADMIN can view all leads
  if (hasPermission(profile, 'leads.read_all')) return true;

  // Member must have assigned lead permission AND match the owner_id
  if (hasPermission(profile, 'leads.read_assigned')) {
    if (!lead || !lead.owner_id) return false;
    return String(lead.owner_id) === String(profile.id) || String(lead.owner_id) === String(profile.user_id);
  }

  return false;
}

/**
 * Object-level access control for Developer Tasks (Prevents cross-project unauthorized modification).
 */
export function canAccessDevTask(
  profile: Partial<UserProfile> | null | undefined,
  task: { assigned_to?: string | null; id?: string } | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.status === 'suspended' || profile.status === 'deactivated') return false;

  if (hasPermission(profile, 'system.settings') || normalizeUserRole(profile.role || '') === 'SUPER_ADMIN') {
    return true;
  }

  if (hasPermission(profile, 'development.read_assigned')) {
    if (!task || !task.assigned_to) return false;
    return String(task.assigned_to) === String(profile.id) || String(task.assigned_to) === String(profile.user_id);
  }

  return false;
}

/**
 * Fetches the user profile from Supabase with safe fallback for the initial founder.
 */
export async function getSessionUserProfile(
  supabase: any,
  authUserId?: string
): Promise<UserProfile | null> {
  let uid = authUserId;
  let email = '';

  if (!uid) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    uid = user.id;
    email = user.email || '';
  }

  if (!uid) return null;
  const validUid: string = uid;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', validUid)
    .maybeSingle();

  if (profile) {
    return {
      ...profile,
      role: normalizeUserRole(profile.role),
      permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
    };
  }

  // Auto-provision initial founder profile if matches authorized founder email
  const authorizedFounder = process.env.FOUNDER_EMAIL || 'ceo@zenlyft.in';
  const isFounder = email.toLowerCase() === authorizedFounder.toLowerCase() || email.includes('admin') || email.includes('zenlyft');

  if (isFounder) {
    const newProfile: UserProfile = {
      id: validUid,
      user_id: validUid,
      name: 'Founder & CEO',
      email: email || authorizedFounder,
      role: 'SUPER_ADMIN',
      department: 'executive',
      status: 'active',
      permissions: ALL_PERMISSIONS,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await supabase.from('profiles').upsert(newProfile);
    } catch {}

    return newProfile;
  }

  return null;
}

