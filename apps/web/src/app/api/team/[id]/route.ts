import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSessionUserProfile, enforcePermission, normalizeUserRole } from '@/lib/security/rbac';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);
    const targetId = params.id;

    if (!targetId) {
      return NextResponse.json({ success: false, error: 'Member ID required.' }, { status: 400 });
    }

    const body = await req.json();
    const { status, role, department, permissions, revokeSession } = body;

    // Self-elevation prevention: A member cannot modify their own role, status, or permissions
    if (String(profile?.id) === String(targetId) || String(profile?.user_id) === String(targetId)) {
      if (role || permissions || status === 'active' || status === 'suspended') {
        return NextResponse.json(
          { success: false, error: 'SELF_MODIFICATION_BLOCKED: Members cannot alter their own role, status, or permissions.' },
          { status: 403 }
        );
      }
    }

    const admin = createAdminClient();
    const { data: targetProfile, error: fetchErr } = await admin
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();

    if (fetchErr || !targetProfile) {
      return NextResponse.json({ success: false, error: 'Member profile not found.' }, { status: 404 });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Handle Status Change (suspend / reactivate / deactivate)
    if (status && status !== targetProfile.status) {
      enforcePermission(profile, 'users.suspend');
      updatePayload.status = status;
      if (status === 'suspended') {
        updatePayload.suspended_at = new Date().toISOString();
      } else if (status === 'active') {
        updatePayload.suspended_at = null;
      }
    }

    // Handle Role Change
    if (role && role !== targetProfile.role) {
      enforcePermission(profile, 'users.assign_role');
      updatePayload.role = normalizeUserRole(role);
    }

    // Handle Department & Permissions
    if (department) {
      enforcePermission(profile, 'users.update');
      updatePayload.department = department;
    }

    if (Array.isArray(permissions)) {
      enforcePermission(profile, 'users.assign_role');
      updatePayload.permissions = permissions;
    }

    // Apply updates to profiles
    const { error: updateErr } = await admin
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetId);

    if (updateErr) throw new Error(updateErr.message);

    // If Revoking Sessions or Suspending: sign out auth user from all devices
    if (revokeSession || status === 'suspended' || status === 'deactivated') {
      try {
        if (targetProfile.user_id) {
          // Supabase Admin API to invalidate user sessions
          await (admin.auth.admin as any).signOut(targetProfile.user_id);
        }
      } catch (authSignOutErr: any) {
        console.warn('[Session Revoke Warning]:', authSignOutErr.message);
      }
    }

    await logAuditEvent({
      actorType: 'user',
      actorId: profile?.email || 'admin',
      action: status === 'suspended' ? 'team.user_suspended' : role ? 'team.role_changed' : 'team.user_updated',
      objectType: 'profiles',
      objectId: targetId,
      result: 'success',
      metadata: {
        targetEmail: targetProfile.email,
        updatedFields: Object.keys(updatePayload),
        actorEmail: profile?.email,
      },
    });

    return NextResponse.json({
      success: true,
      memberId: targetId,
      updated: updatePayload,
    });
  } catch (err: any) {
    const status = err.status || (err.code === 'FORBIDDEN' ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

