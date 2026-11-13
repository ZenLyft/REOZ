import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { OpenWAClient, getOpenWAConfig } from '@/lib/integrations/openwa-client';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();
    const config = getOpenWAConfig();
    const client = new OpenWAClient();

    // Check emergency stop in system_settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('emergency_stop_active, autonomy_level')
      .eq('id', 'zenlyft-global-settings')
      .maybeSingle();

    const emergencyStop = Boolean(settings?.emergency_stop_active);

    // Query live OpenWA server
    const sessionInfo = await client.getSession(config.sessionId);
    let qrCode: string | null = null;
    let pairingCode: string | null = null;
    let status = sessionInfo?.status || 'disconnected';
    let activePhone = sessionInfo?.phone || config.businessPhone;
    let pushName = sessionInfo?.pushName || null;

    if (sessionInfo) {
      if ((sessionInfo as any).pairingCode) {
        pairingCode = (sessionInfo as any).pairingCode;
      }
      if (sessionInfo.qrCode) {
        qrCode = sessionInfo.qrCode;
      } else if (sessionInfo.status === 'qr_ready' || sessionInfo.status === 'initializing') {
        const qrRes = await client.getQRCode(config.sessionId);
        qrCode = qrRes.qrCode;
        if (qrRes.status && qrRes.status !== 'unknown') {
          status = qrRes.status as any;
        }
      }

      // Update database record from live session info
      await supabase.from('whatsapp_sessions').upsert({
        id: config.sessionId,
        name: 'ZenLyft Business Acquisition (Dedicated)',
        status: emergencyStop ? 'emergency_stopped' : status,
        phone: activePhone,
        push_name: pushName,
        qr_code: qrCode,
        engine: 'baileys',
        is_active: !emergencyStop && status === 'ready',
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      // Edge / Cloud fallback: Read persistent gateway session directly from Supabase
      const { data: dbSession } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('id', config.sessionId)
        .maybeSingle();

      if (dbSession) {
        status = dbSession.status || 'disconnected';
        qrCode = dbSession.qr_code || null;
        if (dbSession.phone) activePhone = dbSession.phone;
        if (dbSession.push_name) pushName = dbSession.push_name;
        if (dbSession.last_error?.startsWith('PAIRING_CODE:')) {
          pairingCode = dbSession.last_error.replace('PAIRING_CODE:', '').trim();
        }
      }
    }

    return NextResponse.json({
      success: true,
      sessionId: config.sessionId,
      status: emergencyStop ? 'emergency_stopped' : status,
      phone: activePhone,
      pushName,
      qrCode,
      pairingCode,
      emergencyStopActive: emergencyStop,
      engine: 'baileys',
      openwaBaseUrl: config.baseUrl,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      status: 'disconnected',
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const config = getOpenWAConfig();
    const client = new OpenWAClient();

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'start'; // 'start' | 'create'

    if (action === 'create') {
      await client.createSession(config.sessionId);
    }

    const startRes = await client.startSession(config.sessionId);
    return NextResponse.json({ success: true, result: startRes });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const config = getOpenWAConfig();
    const client = new OpenWAClient();

    const res = await client.stopSession(config.sessionId);
    const supabase = createClient();

    await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected', is_active: false })
      .eq('id', config.sessionId);

    return NextResponse.json({ success: true, result: res });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

