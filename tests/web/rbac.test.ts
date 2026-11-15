import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  enforcePermission,
  canAccessLead,
  canAccessDevTask,
  normalizeUserRole,
  type UserProfile,
} from '../../apps/web/src/lib/security/rbac';

describe('REOZ RBAC & Permission Security Engine', () => {
  const superAdmin: UserProfile = {
    id: 'admin-uuid-1',
    user_id: 'admin-auth-1',
    name: 'Niresh Senthoor',
    email: 'ceo@zenlyft.in',
    role: 'SUPER_ADMIN',
    department: 'executive',
    status: 'active',
    permissions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const marketingMember: UserProfile = {
    id: 'mkt-uuid-2',
    user_id: 'mkt-auth-2',
    name: 'Priya Sharma',
    email: 'priya@zenlyft.in',
    role: 'MARKETING',
    department: 'marketing',
    status: 'active',
    permissions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const devMember: UserProfile = {
    id: 'dev-uuid-3',
    user_id: 'dev-auth-3',
    name: 'Karthik Raja',
    email: 'karthik@zenlyft.in',
    role: 'DEVELOPER',
    department: 'engineering',
    status: 'active',
    permissions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const suspendedMember: UserProfile = {
    ...marketingMember,
    id: 'suspended-uuid-4',
    status: 'suspended',
    suspended_at: new Date().toISOString(),
  };

  describe('1. Role-Based Permissions & Deny-by-Default', () => {
    it('grants SUPER_ADMIN full access across all capabilities', () => {
      expect(hasPermission(superAdmin, 'users.create')).toBe(true);
      expect(hasPermission(superAdmin, 'users.assign_role')).toBe(true);
      expect(hasPermission(superAdmin, 'leads.read_all')).toBe(true);
      expect(hasPermission(superAdmin, 'leads.assign')).toBe(true);
      expect(hasPermission(superAdmin, 'campaigns.approve')).toBe(true);
      expect(hasPermission(superAdmin, 'finance.read')).toBe(true);
      expect(hasPermission(superAdmin, 'system.settings')).toBe(true);
      expect(hasPermission(superAdmin, 'audit.read')).toBe(true);
    });

    it('grants MARKETING baseline permissions for assigned leads and campaigns', () => {
      expect(hasPermission(marketingMember, 'leads.read_assigned')).toBe(true);
      expect(hasPermission(marketingMember, 'leads.update_assigned')).toBe(true);
      expect(hasPermission(marketingMember, 'campaigns.create')).toBe(true);
      expect(hasPermission(marketingMember, 'campaigns.submit')).toBe(true);
    });

    it('denies MARKETING from viewing company finances, unassigned leads, and settings', () => {
      expect(hasPermission(marketingMember, 'leads.read_all')).toBe(false);
      expect(hasPermission(marketingMember, 'leads.export')).toBe(false);
      expect(hasPermission(marketingMember, 'finance.read')).toBe(false);
      expect(hasPermission(marketingMember, 'campaigns.approve')).toBe(false);
      expect(hasPermission(marketingMember, 'users.create')).toBe(false);
      expect(hasPermission(marketingMember, 'system.settings')).toBe(false);
    });

    it('grants DEVELOPER baseline permissions for assigned tasks', () => {
      expect(hasPermission(devMember, 'development.read_assigned')).toBe(true);
      expect(hasPermission(devMember, 'development.update_assigned')).toBe(true);
    });

    it('denies DEVELOPER from accessing leads, finance, and marketing campaigns', () => {
      expect(hasPermission(devMember, 'leads.read_all')).toBe(false);
      expect(hasPermission(devMember, 'leads.read_assigned')).toBe(false);
      expect(hasPermission(devMember, 'campaigns.create')).toBe(false);
      expect(hasPermission(devMember, 'finance.read')).toBe(false);
      expect(hasPermission(devMember, 'system.settings')).toBe(false);
    });

    it('denies ALL permissions for suspended users immediately', () => {
      expect(hasPermission(suspendedMember, 'leads.read_assigned')).toBe(false);
      expect(hasPermission(suspendedMember, 'campaigns.submit')).toBe(false);
    });
  });

  describe('2. Custom Permissions and Anti-Elevation Rules', () => {
    it('allows non-critical custom permissions to be granted', () => {
      const customDev: UserProfile = {
        ...devMember,
        permissions: ['development.read_assigned', 'development.update_assigned'],
      };
      expect(hasPermission(customDev, 'development.read_assigned')).toBe(true);
    });

    it('strictly prevents custom permissions from granting SUPER_ADMIN-only capabilities', () => {
      const maliciousMarketing: UserProfile = {
        ...marketingMember,
        // Attempting to self-grant approval or user management
        permissions: ['campaigns.approve', 'users.assign_role', 'finance.read'],
      };
      expect(hasPermission(maliciousMarketing, 'campaigns.approve')).toBe(false);
      expect(hasPermission(maliciousMarketing, 'users.assign_role')).toBe(false);
      expect(hasPermission(maliciousMarketing, 'finance.read')).toBe(false);
    });
  });

  describe('3. Object-Level Access Control (IDOR Prevention)', () => {
    const lead1 = { id: 'lead-1', owner_id: 'mkt-uuid-2' }; // Assigned to Priya
    const lead2 = { id: 'lead-2', owner_id: 'other-user-uuid' }; // Assigned to someone else
    const unassignedLead = { id: 'lead-3', owner_id: null };

    it('allows SUPER_ADMIN to access any lead', () => {
      expect(canAccessLead(superAdmin, lead1)).toBe(true);
      expect(canAccessLead(superAdmin, lead2)).toBe(true);
      expect(canAccessLead(superAdmin, unassignedLead)).toBe(true);
    });

    it('allows MARKETING member to access ONLY leads assigned to them', () => {
      expect(canAccessLead(marketingMember, lead1)).toBe(true);
      expect(canAccessLead(marketingMember, lead2)).toBe(false);
      expect(canAccessLead(marketingMember, unassignedLead)).toBe(false);
    });

    it('denies DEVELOPER from accessing any lead', () => {
      expect(canAccessLead(devMember, lead1)).toBe(false);
      expect(canAccessLead(devMember, lead2)).toBe(false);
    });

    const task1 = { id: 'task-1', assigned_to: 'dev-uuid-3' };
    const task2 = { id: 'task-2', assigned_to: 'other-dev' };

    it('allows DEVELOPER to access assigned dev task and denies unassigned', () => {
      expect(canAccessDevTask(devMember, task1)).toBe(true);
      expect(canAccessDevTask(devMember, task2)).toBe(false);
    });
  });

  describe('4. Enforce Permission Exceptions', () => {
    it('throws 403 FORBIDDEN when user lacks required permission', () => {
      expect(() => enforcePermission(marketingMember, 'finance.read')).toThrowError(
        /ACCESS_DENIED: Missing mandatory permission 'finance.read'/
      );
    });

    it('passes cleanly when user possesses required permission', () => {
      expect(() => enforcePermission(superAdmin, 'finance.read')).not.toThrow();
      expect(() => enforcePermission(marketingMember, 'campaigns.submit')).not.toThrow();
    });
  });

  describe('5. Role Normalization', () => {
    it('normalizes legacy and mixed-case roles', () => {
      expect(normalizeUserRole('founder')).toBe('SUPER_ADMIN');
      expect(normalizeUserRole('FOUNDER')).toBe('SUPER_ADMIN');
      expect(normalizeUserRole('team_member')).toBe('MARKETING');
      expect(normalizeUserRole('developer')).toBe('DEVELOPER');
      expect(normalizeUserRole('sales_executive')).toBe('SALES_EXECUTIVE');
    });
  });
});

