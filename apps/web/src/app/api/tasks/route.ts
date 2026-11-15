import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSessionUserProfile, enforcePermission, hasPermission, normalizeUserRole } from '@/lib/security/rbac';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);
    enforcePermission(profile, 'development.read_assigned');

    const admin = createAdminClient();
    let query = admin.from('dev_tasks').select('*').order('created_at', { ascending: false });

    // If not super admin, restrict strictly to tasks assigned to this developer
    const isSuperAdmin = normalizeUserRole(profile?.role || '') === 'SUPER_ADMIN';
    if (!isSuperAdmin) {
      query = query.or(`assigned_to.eq.${profile?.id},assigned_to.eq.${profile?.user_id}`);
    }

    const { data: tasks, error } = await query;
    if (error) {
      // If table empty or query succeeds with empty list
      return NextResponse.json({ success: true, tasks: [] });
    }

    return NextResponse.json({
      success: true,
      tasks: tasks || [],
      developer: {
        id: profile?.id,
        name: profile?.name,
        role: profile?.role,
      },
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
    enforcePermission(profile, 'development.update_assigned');

    const body = await req.json();
    const { title, description, taskType, priority, deadline, projectId } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'Task title is required.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: newTask, error } = await admin
      .from('dev_tasks')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        task_type: taskType || 'feature',
        priority: priority || 'medium',
        status: 'todo',
        assigned_to: profile?.id,
        created_by: profile?.id,
        deadline: deadline || null,
        project_id: projectId || null,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await logAuditEvent({
      actorType: 'user',
      actorId: profile?.email || 'dev',
      action: taskType === 'deployment' ? 'dev.deployment_requested' : 'dev.task_created',
      objectType: 'dev_tasks',
      objectId: newTask.id,
      result: 'success',
      metadata: {
        title,
        taskType,
        priority,
      },
    });

    return NextResponse.json({ success: true, task: newTask });
  } catch (err: any) {
    const status = err.status || (err.code === 'FORBIDDEN' ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

