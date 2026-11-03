import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await logAuditEvent({
      actorType: 'user',
      actorId: user.id,
      action: 'user_signout',
      objectType: 'auth',
      objectId: user.id,
      result: 'success',
      metadata: { email: user.email },
    });

    await supabase.auth.signOut();
  }

  const url = new URL('/login', request.url);
  return NextResponse.redirect(url, { status: 302 });
}
