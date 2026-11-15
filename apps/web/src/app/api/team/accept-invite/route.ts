import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password, fullName } = body;

    if (!token || !password) {
      return NextResponse.json(
        { success: false, error: 'Invite token and password are required.' },
        { status: 400 }
      );
    }

    if (String(password).length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    const admin = createAdminClient();

    // Verify invitation token
    const { data: invite, error: inviteErr } = await admin
      .from('team_invitations')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (inviteErr || !invite) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INVITATION: Invitation token is invalid or does not exist.' },
        { status: 404 }
      );
    }

    if (invite.used_at) {
      return NextResponse.json(
        { success: false, error: 'EXPIRED_INVITATION: This invitation link has already been used.' },
        { status: 410 }
      );
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'EXPIRED_INVITATION: This invitation has expired. Request a new link from your admin.' },
        { status: 410 }
      );
    }

    const memberName = (fullName || invite.full_name || 'Team Member').trim();

    // Create user in Supabase Auth
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: invite.email,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        name: memberName,
        role: invite.role,
        department: invite.department,
      },
    });

    if (authErr) {
      // If user already exists in auth, update password and activate
      if (authErr.message.includes('already registered')) {
        const { data: userList } = await admin.auth.admin.listUsers();
        const existing = userList?.users?.find((u) => u.email?.toLowerCase() === invite.email.toLowerCase());
        if (existing) {
          await admin.auth.admin.updateUserById(existing.id, {
            password: String(password),
            email_confirm: true,
          });
          // Upsert profile
          await admin.from('profiles').upsert({
            id: existing.id,
            user_id: existing.id,
            name: memberName,
            email: invite.email,
            role: invite.role,
            department: invite.department,
            permissions: invite.custom_permissions || [],
            status: 'active',
            invited_by: invite.invited_by,
            updated_at: new Date().toISOString(),
          });
        }
      } else {
        throw new Error(authErr.message);
      }
    } else if (authData?.user) {
      // Create fresh profile linked to auth.users.id
      await admin.from('profiles').upsert({
        id: authData.user.id,
        user_id: authData.user.id,
        name: memberName,
        email: invite.email,
        role: invite.role,
        department: invite.department,
        permissions: invite.custom_permissions || [],
        status: 'active',
        invited_by: invite.invited_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Mark invitation as used
    await admin
      .from('team_invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id);

    await logAuditEvent({
      actorType: 'user',
      actorId: invite.email,
      action: 'team.invite_accepted',
      objectType: 'profiles',
      objectId: invite.email,
      result: 'success',
      metadata: {
        role: invite.role,
        department: invite.department,
      },
    });

    return NextResponse.json({
      success: true,
      email: invite.email,
      message: 'Account successfully created and activated. You may now sign in.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

