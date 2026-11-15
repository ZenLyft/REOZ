import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSessionUserProfile, enforcePermission, normalizeUserRole, type UserRole, type Department } from '@/lib/security/rbac';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);
    enforcePermission(profile, 'users.read');

    const admin = createAdminClient();
    const [{ data: profiles, error: pErr }, { data: invitations, error: iErr }] = await Promise.all([
      admin.from('profiles').select('*').order('created_at', { ascending: false }),
      admin.from('team_invitations').select('*').order('created_at', { ascending: false }),
    ]);

    if (pErr) throw new Error(pErr.message);

    return NextResponse.json({
      success: true,
      members: profiles || [],
      invitations: invitations || [],
    });
  } catch (err: any) {
    const status = err.status || (err.code === 'FORBIDDEN' ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);
    enforcePermission(profile, 'users.create');

    const body = await req.json();
    const { email, fullName, role, department, customPermissions } = body;

    if (!email || !fullName || !role) {
      return NextResponse.json(
        { success: false, error: 'email, fullName, and role are required.' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanRole = normalizeUserRole(role);
    const cleanDept = (department || 'operations') as Department;

    // Generate secure one-time invite token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const admin = createAdminClient();

    // Check if user or active invite already exists
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, email')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { success: false, error: `User with email ${cleanEmail} already has an active account.` },
        { status: 409 }
      );
    }

    // Upsert invitation record
    const { data: invite, error: inviteErr } = await admin
      .from('team_invitations')
      .upsert({
        email: cleanEmail,
        full_name: fullName.trim(),
        role: cleanRole,
        department: cleanDept,
        custom_permissions: Array.isArray(customPermissions) ? customPermissions : [],
        token_hash: tokenHash,
        invited_by: profile?.id,
        expires_at: expiresAt,
        used_at: null,
      }, { onConflict: 'email' })
      .select('id')
      .single();

    if (inviteErr) throw new Error(inviteErr.message);

    const origin = req.nextUrl.origin || 'https://zenlyft.in';
    const inviteLink = `${origin}/invite/${rawToken}`;

    await logAuditEvent({
      actorType: 'user',
      actorId: profile?.email || 'admin',
      action: 'team.user_invited',
      objectType: 'team_invitations',
      objectId: invite.id,
      result: 'success',
      metadata: {
        email: cleanEmail,
        role: cleanRole,
        department: cleanDept,
        invitedBy: profile?.email,
      },
    });

    return NextResponse.json({
      success: true,
      inviteId: invite.id,
      email: cleanEmail,
      inviteLink,
      expiresAt,
    });
  } catch (err: any) {
    const status = err.status || (err.code === 'FORBIDDEN' ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

