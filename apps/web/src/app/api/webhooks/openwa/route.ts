import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  verifyOpenWASignature,
  getOpenWAConfig,
  formatWhatsAppChatId,
  classifyIncomingMessage,
} from '@/lib/integrations/openwa-client';
import { computeDraftHash } from '@/lib/crm/pricing-and-hash';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-openwa-signature');
    const eventType = req.headers.get('x-openwa-event') || 'unknown';
    const idempotencyKey = req.headers.get('x-openwa-idempotency-key') || '';
    const deliveryId = req.headers.get('x-openwa-delivery-id') || '';

    const config = getOpenWAConfig();

    // 1. Webhook Signature Verification
    // If webhook secret is configured, verify HMAC signature strictly
    const isSignatureValid = verifyOpenWASignature(
      rawBody,
      signature,
      config.webhookSecret || 'zenlyft-openwa-secure-secret-2026'
    );

    // If signature header is provided but invalid, reject with 401
    if (signature && !isSignatureValid) {
      console.warn('[OpenWA Webhook] 401 Unauthorized: Invalid HMAC signature');
      return new NextResponse('Invalid signature', { status: 401 });
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new NextResponse('Malformed JSON', { status: 400 });
    }

    const supabase = createClient();

    // 2. Idempotency Check & Ingestion Log
    if (idempotencyKey) {
      const { data: existingEvent } = await supabase
        .from('whatsapp_webhook_events')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingEvent) {
        return NextResponse.json({ success: true, duplicate: true, message: 'Already processed' });
      }

      await supabase.from('whatsapp_webhook_events').insert({
        session_id: payload.sessionId || config.sessionId,
        event_name: eventType,
        idempotency_key: idempotencyKey,
        delivery_id: deliveryId,
        signature_valid: isSignatureValid,
        payload,
        processed: true,
      });
    }

    // 3. Handle Message Received Event
    if (eventType === 'message.received' || payload.event === 'message.received') {
      const messageData = payload.data || payload;
      const body = messageData.body || '';
      const chatId = formatWhatsAppChatId(messageData.chatId || messageData.from || '');
      const rawNumber = chatId.replace(/@c\.us$/, '');
      const isFromMe = Boolean(messageData.fromMe);

      // Skip own echoes
      if (isFromMe) {
        return NextResponse.json({ success: true, skipped: 'fromMe' });
      }

      // Check CRM Lead by phone number
      const { data: lead } = await supabase
        .from('leads')
        .select('id, organisation_name, contact_restriction, pipeline_stage')
        .or(`location.ilike.%${rawNumber}%,website_url.ilike.%${rawNumber}%`)
        .maybeSingle();

      // Classify Incoming Message
      const aiAnalysis = classifyIncomingMessage(body);

      // Handle Opt-Out / Stop immediately
      if (aiAnalysis.is_opt_out) {
        if (lead) {
          await supabase
            .from('leads')
            .update({
              contact_restriction: 'opt_out',
              pipeline_stage: 'lost',
              loss_reason: 'WhatsApp customer opt-out request',
            })
            .eq('id', lead.id);

          // Cancel all scheduled followups
          await supabase
            .from('whatsapp_followups')
            .update({ status: 'cancelled_optout' })
            .eq('lead_id', lead.id)
            .eq('status', 'scheduled');
        }

        // Store message in whatsapp_messages
        await supabase.from('whatsapp_messages').insert({
          session_id: payload.sessionId || config.sessionId,
          lead_id: lead?.id || null,
          chat_id: chatId,
          sender_number: rawNumber,
          recipient_number: 'ZenLyft',
          direction: 'inbound',
          body,
          status: 'delivered',
          ai_classification: 'opt_out',
          ai_intent_summary: aiAnalysis.intent_summary,
        });

        // Audit Log
        await supabase.from('audit_log').insert({
          action: 'whatsapp.opt_out_received',
          entity: 'lead',
          entity_id: lead?.id || 'unknown',
          metadata: { number: rawNumber, message: body },
        });

        return NextResponse.json({ success: true, action: 'opt_out_recorded' });
      }

      // Normal Inbound Message: Prospect replied!
      // Cancel pending automated follow-ups because conversation has begun
      if (lead) {
        await supabase
          .from('whatsapp_followups')
          .update({ status: 'cancelled_replied' })
          .eq('lead_id', lead.id)
          .eq('status', 'scheduled');

        await supabase
          .from('leads')
          .update({
            pipeline_stage: 'contacted',
            next_action: `Customer replied: "${body.slice(0, 40)}..." -> Review suggested response`,
          })
          .eq('id', lead.id);
      }

      // Record Inbound Message
      await supabase.from('whatsapp_messages').insert({
        session_id: payload.sessionId || config.sessionId,
        lead_id: lead?.id || null,
        chat_id: chatId,
        sender_number: rawNumber,
        recipient_number: 'ZenLyft',
        direction: 'inbound',
        body,
        status: 'delivered',
        ai_classification: aiAnalysis.classification,
        ai_intent_summary: aiAnalysis.intent_summary,
        suggested_reply: aiAnalysis.suggested_reply,
      });

      // Prepare AI Outreach Draft & Route to Founder Approvals Queue
      // CRITICAL: NEVER auto-send to prospect; always require founder approval!
      const draftHash = computeDraftHash(aiAnalysis.suggested_reply, rawNumber);
      const { data: newDraft } = await supabase
        .from('outreach_drafts')
        .insert({
          lead_id: lead?.id || null,
          channel: 'whatsapp',
          draft: aiAnalysis.suggested_reply,
          approval_status: 'draft',
          approved_content_hash: draftHash,
          approved_recipient: rawNumber,
        })
        .select('id')
        .single();

      if (newDraft) {
        await supabase.from('approvals').insert({
          action_type: 'send_whatsapp_message',
          target_table: 'outreach_drafts',
          target_id: newDraft.id,
          proposed_by: 'agent',
          payload_hash: draftHash,
          recipient: rawNumber,
          reason: `Reply to incoming ${aiAnalysis.classification}: "${body.slice(0, 60)}"`,
          evidence: [
            { type: 'customer_inbound', text: body },
            { type: 'classification', intent: aiAnalysis.classification },
          ],
          cost_risk: '₹0 (Free-tier WhatsApp Session)',
          status: 'pending',
          expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
        });
      }

      return NextResponse.json({
        success: true,
        classification: aiAnalysis.classification,
        action: 'queued_for_founder_approval',
      });
    }

    // 4. Handle Message Ack / Delivery Update
    if (eventType === 'message.ack' || payload.event === 'message.ack') {
      const ackData = payload.data || payload;
      const messageId = ackData.id || ackData.messageId;
      const ack = Number(ackData.ack || 0);

      let deliveryStatus = 'sent';
      if (ack >= 3) deliveryStatus = 'read';
      else if (ack >= 2) deliveryStatus = 'delivered';

      if (messageId) {
        await supabase
          .from('whatsapp_messages')
          .update({
            status: deliveryStatus,
            delivery_ack: ack,
            delivered_at: ack >= 2 ? new Date().toISOString() : undefined,
            read_at: ack >= 3 ? new Date().toISOString() : undefined,
          })
          .eq('external_message_id', messageId);
      }

      return NextResponse.json({ success: true, updated_ack: ack });
    }

    // 5. Handle Session Status Changes
    if (eventType === 'session.status' || payload.event === 'session.status') {
      const sessionData = payload.data || payload;
      const sid = sessionData.sessionId || config.sessionId;
      const status = sessionData.status || 'unknown';

      await supabase
        .from('whatsapp_sessions')
        .update({
          status,
          phone: sessionData.phone || null,
          last_active_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sid);

      return NextResponse.json({ success: true, updated_session: sid, status });
    }

    return NextResponse.json({ success: true, event: eventType });
  } catch (err: any) {
    console.error('[OpenWA Webhook Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
