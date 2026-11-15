import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  enforcePermission,
  canAccessLead,
  canAccessDevTask,
  type UserProfile,
} from '../../apps/web/src/lib/security/rbac';

describe('REOZ Team Management, Invitation & Department Isolation Suites', () => {
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

  const salesMember: UserProfile = {
    id: 'sales-uuid-3',
    user_id: 'sales-auth-3',
    name: 'Anand Kumar',
    email: 'anand@zenlyft.in',
    role: 'SALES_EXECUTIVE',
    department: 'sales',
    status: 'active',
    permissions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const devMember: UserProfile = {
    id: 'dev-uuid-4',
    user_id: 'dev-auth-4',
    name: 'Karthik Raja',
    email: 'karthik@zenlyft.in',
    role: 'DEVELOPER',
    department: 'engineering',
    status: 'active',
    permissions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe('1. Admin Team Management & Invitation Access Controls', () => {
    it('allows SUPER_ADMIN to manage users, suspend members, and assign roles', () => {
      expect(hasPermission(superAdmin, 'users.create')).toBe(true);
      expect(hasPermission(superAdmin, 'users.suspend')).toBe(true);
      expect(hasPermission(superAdmin, 'users.assign_role')).toBe(true);
      expect(hasPermission(superAdmin, 'users.read')).toBe(true);
    });

    it('denies MARKETING and SALES_EXECUTIVE from creating or suspending team accounts', () => {
      expect(hasPermission(marketingMember, 'users.create')).toBe(false);
      expect(hasPermission(marketingMember, 'users.suspend')).toBe(false);
      expect(hasPermission(marketingMember, 'users.assign_role')).toBe(false);

      expect(hasPermission(salesMember, 'users.create')).toBe(false);
      expect(hasPermission(salesMember, 'users.suspend')).toBe(false);
      expect(hasPermission(salesMember, 'users.assign_role')).toBe(false);
    });

    it('denies DEVELOPER from team administration', () => {
      expect(hasPermission(devMember, 'users.create')).toBe(false);
      expect(hasPermission(devMember, 'users.suspend')).toBe(false);
      expect(hasPermission(devMember, 'users.assign_role')).toBe(false);
    });
  });

  describe('2. Lead Assignment & Data Isolation Controls', () => {
    it('allows SUPER_ADMIN to assign leads to authorized members', () => {
      expect(hasPermission(superAdmin, 'leads.assign')).toBe(true);
    });

    it('denies non-admin members from assigning or reassigning leads', () => {
      expect(hasPermission(marketingMember, 'leads.assign')).toBe(false);
      expect(hasPermission(salesMember, 'leads.assign')).toBe(false);
      expect(hasPermission(devMember, 'leads.assign')).toBe(false);
    });

    it('allows MARKETING member to access only their assigned lead and denies access to unassigned or other members leads', () => {
      const assignedLead = { id: 'lead-101', owner_id: marketingMember.id };
      const otherLead = { id: 'lead-102', owner_id: 'other-user-99' };
      const unassignedLead = { id: 'lead-103', owner_id: null };

      expect(canAccessLead(marketingMember, assignedLead)).toBe(true);
      expect(canAccessLead(marketingMember, otherLead)).toBe(false);
      expect(canAccessLead(marketingMember, unassignedLead)).toBe(false);
    });

    it('allows SALES_EXECUTIVE to access only their assigned lead', () => {
      const assignedLead = { id: 'lead-201', owner_id: salesMember.id };
      const otherLead = { id: 'lead-202', owner_id: marketingMember.id };

      expect(canAccessLead(salesMember, assignedLead)).toBe(true);
      expect(canAccessLead(salesMember, otherLead)).toBe(false);
    });

    it('SUPER_ADMIN can access all leads regardless of assignee', () => {
      expect(canAccessLead(superAdmin, { id: 'lead-1', owner_id: null })).toBe(true);
      expect(canAccessLead(superAdmin, { id: 'lead-2', owner_id: marketingMember.id })).toBe(true);
      expect(canAccessLead(superAdmin, { id: 'lead-3', owner_id: 'unknown-id' })).toBe(true);
    });

    it('DEVELOPER is completely blocked from accessing lead database records', () => {
      expect(canAccessLead(devMember, { id: 'lead-1', owner_id: devMember.id })).toBe(false);
      expect(canAccessLead(devMember, { id: 'lead-2', owner_id: null })).toBe(false);
    });
  });

  describe('3. Developer Workstation & Task Security', () => {
    it('allows DEVELOPER to view and update their assigned development tasks', () => {
      expect(hasPermission(devMember, 'development.read_assigned')).toBe(true);
      expect(hasPermission(devMember, 'development.update_assigned')).toBe(true);

      const assignedTask = { id: 'task-1', assigned_to: devMember.id };
      expect(canAccessDevTask(devMember, assignedTask)).toBe(true);
    });

    it('denies DEVELOPER from modifying tasks assigned to another developer', () => {
      const otherDevTask = { id: 'task-2', assigned_to: 'other-dev-id' };
      expect(canAccessDevTask(devMember, otherDevTask)).toBe(false);
    });

    it('SUPER_ADMIN can view and manage all development tasks', () => {
      expect(canAccessDevTask(superAdmin, { id: 'task-1', assigned_to: devMember.id })).toBe(true);
      expect(canAccessDevTask(superAdmin, { id: 'task-2', assigned_to: null })).toBe(true);
    });

    it('denies MARKETING and SALES_EXECUTIVE from accessing developer tasks', () => {
      expect(hasPermission(marketingMember, 'development.read_assigned')).toBe(false);
      expect(hasPermission(marketingMember, 'development.update_assigned')).toBe(false);
      expect(hasPermission(salesMember, 'development.read_assigned')).toBe(false);
    });
  });

  describe('4. Financial & Administrative Confidentiality Isolation', () => {
    it('grants financial visibility exclusively to SUPER_ADMIN', () => {
      expect(hasPermission(superAdmin, 'finance.read')).toBe(true);
      expect(hasPermission(marketingMember, 'finance.read')).toBe(false);
      expect(hasPermission(salesMember, 'finance.read')).toBe(false);
      expect(hasPermission(devMember, 'finance.read')).toBe(false);
    });

    it('enforcePermission throws 403 when marketing tries to read finances', () => {
      expect(() => enforcePermission(marketingMember, 'finance.read')).toThrowError(
        /ACCESS_DENIED/i
      );
    });

    it('grants system settings and integration keys exclusively to SUPER_ADMIN', () => {
      expect(hasPermission(superAdmin, 'system.settings')).toBe(true);
      expect(hasPermission(superAdmin, 'integrations.manage')).toBe(true);

      expect(hasPermission(marketingMember, 'system.settings')).toBe(false);
      expect(hasPermission(salesMember, 'system.settings')).toBe(false);
      expect(hasPermission(devMember, 'system.settings')).toBe(false);
    });

    it('strictly forbids lead export for all non-superadmin roles', () => {
      expect(hasPermission(superAdmin, 'leads.export')).toBe(true);
      expect(hasPermission(marketingMember, 'leads.export')).toBe(false);
      expect(hasPermission(salesMember, 'leads.export')).toBe(false);
      expect(hasPermission(devMember, 'leads.export')).toBe(false);
    });
  });
});
