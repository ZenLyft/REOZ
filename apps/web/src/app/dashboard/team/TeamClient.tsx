'use client';

import React, { useState, useEffect } from 'react';
import type { UserRole, Department, Permission, UserStatus } from '@/lib/security/rbac';

interface TeamMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  department: Department;
  status: UserStatus;
  permissions?: Permission[];
  suspended_at?: string | null;
  created_at: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department: Department;
  token_hash: string;
  expires_at: string;
  used_at?: string | null;
  created_at: string;
}

export function TeamClient({ currentUserRole }: { currentUserRole: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('MARKETING');
  const [inviteDept, setInviteDept] = useState<Department>('marketing');
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'founder';

  useEffect(() => {
    fetchTeamData();
  }, []);

  async function fetchTeamData() {
    setLoading(true);
    try {
      const res = await fetch('/api/team');
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to load team data' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error communicating with Team API.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleSuspend(member: TeamMember) {
    const nextStatus = member.status === 'suspended' ? 'active' : 'suspended';
    const confirmMsg =
      nextStatus === 'suspended'
        ? `Are you sure you want to suspend ${member.name} (${member.email})? Their active sessions will be terminated immediately.`
        : `Reactivate account for ${member.name}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, revokeSession: true }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice({
          type: 'success',
          text: `Account for ${member.name} is now ${nextStatus.toUpperCase()}. Active sessions revoked.`,
        });
        fetchTeamData();
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to update member status' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error updating member status.' });
    }
  }

  async function handleRevokeSession(member: TeamMember) {
    if (!window.confirm(`Revoke all active sessions for ${member.name}? They will be forced to log in again.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revokeSession: true }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice({
          type: 'success',
          text: `All active sessions revoked for ${member.name}.`,
        });
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to revoke sessions' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error revoking sessions.' });
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;

    setIsSubmitting(true);
    setNotice(null);

    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: inviteName,
          email: inviteEmail,
          role: inviteRole,
          department: inviteDept,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCreatedInviteLink(data.inviteLink);
        setNotice({
          type: 'success',
          text: `Invitation generated successfully for ${data.email}!`,
        });
        fetchTeamData();
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to create invitation' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error creating invitation.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || m.role === roleFilter;
    const matchesDept = deptFilter === 'ALL' || m.department === deptFilter;
    return matchesSearch && matchesRole && matchesDept;
  });

  if (!isSuperAdmin) {
    return (
      <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-8 rounded-2xl text-center max-w-lg mx-auto shadow-sm space-y-3">
        <span className="text-3xl">🔒</span>
        <h2 className="text-lg font-black text-[#151B2B]">Restricted Access</h2>
        <p className="text-xs text-[#525A6B]">
          Team Workspace & Account Administration is reserved exclusively for the Founder / Super Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FFFFFF] border border-[#E4E7EC] p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-[#151B2B] flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-600 animate-pulse" />
              Team Workspace & Access Control
            </h1>
            <span className="text-[11px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#ECEFF3] text-[#151B2B] border border-[#D0D5DD]">
              Admin Gate: Active
            </span>
          </div>
          <p className="mt-1 text-xs text-[#525A6B]">
            Provision team member accounts, assign department roles, manage permissions, and enforce session security.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowInviteModal(true);
            setCreatedInviteLink(null);
            setInviteName('');
            setInviteEmail('');
          }}
          className="px-4 py-2 text-xs font-bold bg-[#151B2B] hover:bg-[#2B313C] text-white rounded-xl transition-colors shadow-sm flex items-center gap-2 shrink-0 self-start sm:self-auto"
        >
          <span>+</span>
          <span>Invite Team Member</span>
        </button>
      </div>

      {/* Action Notice Alert */}
      {notice && (
        <div
          className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between shadow-sm border ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          <span className="font-semibold">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-bold opacity-60 hover:opacity-100 ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-[#FFFFFF] p-4 rounded-xl border border-[#E4E7EC]">
        <input
          type="text"
          placeholder="Search members by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-xs border border-[#D0D5DD] rounded-lg bg-[#F5F6F8] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#151B2B]"
        />

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-[#D0D5DD] rounded-lg bg-[#F5F6F8] text-[#151B2B]"
          >
            <option value="ALL">All Roles</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="MARKETING">Marketing</option>
            <option value="DEVELOPER">Developer</option>
            <option value="SALES_EXECUTIVE">Sales Executive</option>
          </select>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-[#D0D5DD] rounded-lg bg-[#F5F6F8] text-[#151B2B]"
          >
            <option value="ALL">All Departments</option>
            <option value="executive">Executive</option>
            <option value="marketing">Marketing</option>
            <option value="engineering">Engineering</option>
            <option value="sales">Sales</option>
            <option value="operations">Operations</option>
          </select>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-[#FFFFFF] border border-[#E4E7EC] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-[#E4E7EC] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#151B2B]">
            Active Team Roster ({filteredMembers.length})
          </h2>
          <span className="text-xs text-[#525A6B]">
            {loading ? 'Refreshing...' : 'Live Synced with Supabase'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F5F6F8] border-b border-[#E4E7EC] text-[#525A6B] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Member Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]">
              {filteredMembers.map((m) => (
                <tr key={m.id} className="hover:bg-[#F9FAFB] transition-colors">
                  <td className="py-3.5 px-4 font-bold text-[#151B2B]">{m.name}</td>
                  <td className="py-3.5 px-4 font-mono text-[#525A6B]">{m.email}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        m.role === 'SUPER_ADMIN' || m.role === 'founder'
                          ? 'bg-purple-100 text-purple-900 border border-purple-200'
                          : m.role === 'MARKETING'
                            ? 'bg-blue-100 text-blue-900 border border-blue-200'
                            : m.role === 'DEVELOPER'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                              : 'bg-amber-100 text-amber-900 border border-amber-200'
                      }`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 capitalize font-medium text-[#151B2B]">{m.department || 'Operations'}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        m.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800'
                          : m.status === 'suspended'
                            ? 'bg-red-100 text-red-900'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleToggleSuspend(m)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                        m.status === 'suspended'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                      }`}
                    >
                      {m.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(m)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#F5F6F8] text-[#151B2B] border border-[#D0D5DD] hover:bg-[#ECEFF3] transition-colors"
                    >
                      Revoke Sessions
                    </button>
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#525A6B]">
                    No team members found matching your search and filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations Section */}
      {invitations.length > 0 && (
        <div className="bg-[#FFFFFF] border border-[#E4E7EC] rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-[#151B2B] flex items-center gap-2">
            <span>✉️</span>
            <span>Pending Secure Invitations ({invitations.filter((i) => !i.used_at).length})</span>
          </h3>

          <div className="divide-y divide-[#E4E7EC] border border-[#E4E7EC] rounded-xl overflow-hidden">
            {invitations.map((inv) => (
              <div key={inv.id} className="p-4 bg-[#F9FAFB] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-[#151B2B]">{inv.full_name}</strong>
                    <span className="font-mono text-[#525A6B]">({inv.email})</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-800">
                      {inv.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#667085] mt-0.5">
                    Expires: {new Date(inv.expires_at).toLocaleDateString()} at{' '}
                    {new Date(inv.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                    Status: <span className={inv.used_at ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>{inv.used_at ? 'Redeemed' : 'Pending Activation'}</span>
                  </p>
                </div>

                {!inv.used_at && (
                  <span className="text-[11px] font-mono text-[#525A6B] bg-[#ECEFF3] px-2.5 py-1 rounded">
                    Token: {inv.token_hash.slice(0, 10)}... (One-time)
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-[#FFFFFF] rounded-2xl p-6 max-w-md w-full shadow-xl border border-[#E4E7EC] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E4E7EC] pb-3">
              <h3 className="text-base font-bold text-[#151B2B]">Invite Team Member</h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-lg font-bold text-[#525A6B] hover:text-[#151B2B]"
              >
                &times;
              </button>
            </div>

            {createdInviteLink ? (
              <div className="space-y-3 py-2">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                  <p className="font-bold">✅ One-Time Invitation Generated!</p>
                  <p className="mt-1">
                    Send this activation link to <strong>{inviteEmail}</strong>. Link expires in 24 hours.
                  </p>
                </div>

                <div className="p-3 bg-[#F5F6F8] rounded-xl border border-[#D0D5DD] font-mono text-xs break-all select-all">
                  {createdInviteLink}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(createdInviteLink);
                    setNotice({ type: 'success', text: 'Activation link copied to clipboard!' });
                  }}
                  className="w-full py-2 bg-[#151B2B] text-white rounded-xl text-xs font-bold hover:bg-[#2B313C]"
                >
                  Copy Activation Link
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#151B2B] mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Priya Sharma"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#151B2B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#151B2B] mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="priya@zenlyft.in"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#151B2B]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#151B2B] mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl bg-white"
                    >
                      <option value="MARKETING">Marketing</option>
                      <option value="DEVELOPER">Developer</option>
                      <option value="SALES_EXECUTIVE">Sales Executive</option>
                      <option value="SUPER_ADMIN">Super Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#151B2B] mb-1">Department</label>
                    <select
                      value={inviteDept}
                      onChange={(e) => setInviteDept(e.target.value as Department)}
                      className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl bg-white"
                    >
                      <option value="marketing">Marketing</option>
                      <option value="engineering">Engineering</option>
                      <option value="sales">Sales</option>
                      <option value="executive">Executive</option>
                      <option value="operations">Operations</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-[#525A6B] hover:text-[#151B2B]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-bold bg-[#151B2B] hover:bg-[#2B313C] text-white rounded-xl disabled:opacity-50"
                  >
                    {isSubmitting ? 'Generating...' : 'Generate Invite Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

