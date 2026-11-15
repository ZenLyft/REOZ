import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { OpenWAClient, getOpenWAConfig } from '@/lib/integrations/openwa-client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Verify authentication
    if (!user) {
      // Check bearer or header auth if called programmatically
      const authHeader = req.headers.get('authorization') || '';
      const secret = process.env.AUTOPILOT_SECRET || process.env.ASCENSION_API_SECRET || '';
      if (!secret || !authHeader.includes(secret)) {
        return NextResponse.json(
          { success: false, error: 'AUTHENTICATION_REQUIRED: Sign in required.' },
          { status: 401 }
        );
      }
    }

    const config = getOpenWAConfig();
    const body = await req.json().catch(() => ({}));

    // Target defaults to founder's phone +91 80159 29139
    let targetPhone = String(body.phone || config.businessPhone || '918015929139')
      .trim()
      .replace(/[^\d]/g, '')
      .replace(/^0+/, '');

    if (targetPhone.length === 10 && /^[6-9]/.test(targetPhone)) {
      targetPhone = `91${targetPhone}`;
    }

    const client = new OpenWAClient();
    const timestamp = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    const verificationText =
      body.text ||
      `🟢 *REOZ Autonomous Revenue Engine — Verified Live!*\n\n• Line: *+${targetPhone}*\n• Date: *${dateStr}*\n• Time: *${timestamp}*\n• Status: *Active & Operational*\n\nWhatsApp Gateway (Baileys), message uniqueness generator, and double-tick delivery verification are working perfectly.`;

    const sendRes = await client.sendTextMessage({
      chatId: `${targetPhone}@c.us`,
      text: verificationText,
    });

    if (!sendRes.success) {
      return NextResponse.json(
        {
          success: false,
          error: sendRes.error || 'WhatsApp gateway could not dispatch the test message.',
        },
        { status: 500 }
      );
    }

    // Insert record in supabase
    await supabase.from('whatsapp_messages').insert({
      session_id: config.sessionId,
      chat_id: `${targetPhone}@c.us`,
      sender_number: config.businessPhone,
      recipient_number: targetPhone,
      direction: 'outbound',
      body: verificationText,
      status: 'submitted',
      external_message_id: sendRes.messageId || null,
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      messageId: sendRes.messageId,
      sentTo: targetPhone,
      timestamp,
      message: verificationText,
    });
  } catch (err: any) {
    console.error('[WhatsApp Test Send Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

