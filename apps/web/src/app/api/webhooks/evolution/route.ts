import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Evolution API payload structure
    const event = body.event || body.type;
    const data = body.data || body;

    // We only care about incoming messages (upsert)
    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      const messageKey = data?.key;
      const fromMe = messageKey?.fromMe;

      // Ignore our own outbound messages
      if (fromMe) {
        return NextResponse.json({ status: 'ignored_outbound' });
      }

      const remoteJid: string = messageKey?.remoteJid || '';
      // Format: "919876543210@s.whatsapp.net" -> "919876543210"
      const senderNumber = remoteJid.split('@')[0];
      const messageText =
        data?.message?.conversation ||
        data?.message?.extendedTextMessage?.text ||
        '[Media/Attachment]';

      if (!senderNumber) {
        return NextResponse.json({ status: 'missing_sender' });
      }

      const supabase = createAdminClient();

      // Look up lead by phone suffix (e.g. last 10 digits)
      const last10Digits = senderNumber.slice(-10);
      const { data: matchedLeads } = await supabase
        .from('leads')
        .select('id, organisation_name, pipeline_stage')
        .or(`phone.ilike.%${last10Digits}%,website_url.ilike.%${last10Digits}%`)
        .limit(1);

      const lead = matchedLeads?.[0];

      if (lead) {
        // Transition stage to 'replied' if previously contacted or discovered
        if (['contacted', 'discovered', 'qualified'].includes(lead.pipeline_stage)) {
          await supabase
            .from('leads')
            .update({
              pipeline_stage: 'replied',
              next_action: `Inbound WhatsApp reply received: "${messageText.slice(0, 100)}..."`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', lead.id);
        }

        // Audit Log
        await logAuditEvent({
          actorType: 'system',
          actorId: 'evolution-whatsapp-webhook',
          action: 'whatsapp.inbound_reply',
          objectType: 'leads',
          objectId: lead.id,
          result: 'success',
          metadata: {
            sender: senderNumber,
            text_snippet: messageText.slice(0, 200),
            push_name: data?.pushName,
            lead_name: lead.organisation_name,
          },
        });

        return NextResponse.json({
          status: 'success',
          matched_lead_id: lead.id,
          organisation: lead.organisation_name,
        });
      } else {
        // Log unmapped incoming reply
        await logAuditEvent({
          actorType: 'system',
          actorId: 'evolution-whatsapp-webhook',
          action: 'whatsapp.unmapped_inbound',
          objectType: 'leads',
          objectId: 'unknown',
          result: 'success',
          metadata: {
            sender: senderNumber,
            text_snippet: messageText.slice(0, 200),
            push_name: data?.pushName,
          },
        });

        return NextResponse.json({ status: 'unmapped_lead', sender: senderNumber });
      }
    }

    return NextResponse.json({ status: 'event_ignored', event });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[EVOLUTION WEBHOOK ERROR]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

