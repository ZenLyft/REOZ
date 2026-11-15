import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSessionUserProfile, enforcePermission, canAccessDevTask } from '@/lib/security/rbac';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const profile = await getSessionUserProfile(supabase);
    enforcePermission(profile, 'development.update_assigned');

    const taskId = params.id;
    const body = await req.json();
    const { status, description } = body;

    const admin = createAdminClient();
    const { data: task, error: fetchErr } = await admin
      .from('dev_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    if (fetchErr || !task) {
      return NextResponse.json({ success: false, error: 'Task not found.' }, { status: 404 });
    }

    // Object-level authorization check
    if (!canAccessDevTask(profile, task)) {
      return NextResponse.json(
        { success: false, error: 'ACCESS_DENIED: You are not authorized to update tasks assigned to other developers.' },
        { status: 403 }
      );
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updates.status = status;
    }
    if (description) {
      updates.description = description;
    }

    const { error: updateErr } = await admin
      .from('dev_tasks')
      .update(updates)
      .eq('id', taskId);

    if (updateErr) throw new Error(updateErr.message);

    await logAuditEvent({
      actorType: 'user',
      actorId: profile?.email || 'dev',
      action: 'dev.task_updated',
      objectType: 'dev_tasks',
      objectId: taskId,
      result: 'success',
      metadata: {
        newStatus: status,
        taskTitle: task.title,
      },
    });

    return NextResponse.json({ success: true, taskId, updates });
  } catch (err: any) {
    const status = err.status || (err.code === 'FORBIDDEN' ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

