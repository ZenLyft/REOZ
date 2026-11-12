import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import {
  OpenWAClient,
  getOpenWAConfig,
  formatWhatsAppChatId,
} from '@/lib/integrations/openwa-client';
import { verifyApprovalRecordIntegrity } from '@/lib/crm/outreach-dossier-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'AUTHENTICATION_REQUIRED: Founder sign-in required to dispatch outreach.' },
        { status: 401 }
      );
    }

    const config = getOpenWAConfig();

    // 1. Emergency Stop Check
    const { data: settings } = await supabase
      .from('system_settings')
      .select('emergency_stop_active')
      .eq('id', 'zenlyft-global-settings')
      .maybeSingle();

    if (settings?.emergency_stop_active) {
      return NextResponse.json(
        {
          success: false,
          error: 'EMERGENCY_STOP_ACTIVE: Master Kill Switch is enabled. All outbound WhatsApp messages are halted.',
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { leadId, recipientNumber, text, approvalId, quotedMessageId } = body;

    if (!recipientNumber || !text || !approvalId) {
      return NextResponse.json(
        {
          success: false,
          error: 'AUTHORIZATION_REQUIRED: recipientNumber, text, and a verified approved approvalId are strictly required.',
        },
        { status: 400 }
      );
    }

    const cleanNumber = String(recipientNumber).trim().replace(/[^\d]/g, '');

    // 2. Do-Not-Contact & Opt-Out Verification
    if (leadId) {
      const { data: lead } = await supabase
        .from('leads')
        .select('contact_restriction, pipeline_stage')
        .eq('id', leadId)
        .maybeSingle();

      if (
        lead?.contact_restriction === 'opt_out' ||
        lead?.contact_restriction === 'do_not_contact' ||
        lead?.pipeline_stage === 'do_not_contact'
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'PROSPECT_OPTED_OUT: This prospect has requested no contact or has opted out.',
          },
          { status: 400 }
        );
      }
    }

    // 3. Mandatory Cryptographic Founder Approval Check (Canonical SHA-256 + Recipient Binding)
    const { data: approval } = await supabase
      .from('approvals')
      .select('id, payload_hash, status, recipient, target_id, evidence')
      .eq('id', approvalId)
      .maybeSingle();

    if (!approval) {
      return NextResponse.json(
        { success: false, error: 'Approval record not found.' },
        { status: 404 }
      );
    }

    if (approval.status !== 'approved') {
      return NextResponse.json(
        {
          success: false,
          error: `APPROVAL_REQUIRED: This message status is '${approval.status}'. Founder approval is strictly mandatory before sending.`,
        },
        { status: 403 }
      );
    }

    const { data: draft } = await supabase
      .from('outreach_drafts')
      .select('id, lead_id, channel, draft, approved_recipient')
      .eq('id', approval.target_id)
      .maybeSingle();

    const integrity = verifyApprovalRecordIntegrity({
      approval,
      draft: draft || {
        id: approval.target_id,
        lead_id: leadId,
        channel: 'whatsapp',
        draft: text,
      },
      targetRecipient: cleanNumber,
    });

    if (!integrity.valid || (draft && draft.draft !== text)) {
      return NextResponse.json(
        {
          success: false,
          error: `TAMPER_DETECTED: ${integrity.reason || 'Message draft or recipient was altered after founder approval. Approval is invalidated.'}`,
        },
        { status: 400 }
      );
    }

    // 4. Generate Idempotency Key
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${cleanNumber}::${text}::${approvalId}`)
      .digest('hex');

    // 5. Submit to OpenWA Gateway
    const client = new OpenWAClient();
    const chatId = formatWhatsAppChatId(cleanNumber);

    const sendResult = await client.sendTextMessage({
      chatId,
      text,
      idempotencyKey,
      quotedMessageId,
    });

    if (!sendResult.success) {
      // Record failed message in database
      await supabase.from('whatsapp_messages').insert({
        session_id: config.sessionId,
        lead_id: leadId || null,
        chat_id: chatId,
        sender_number: config.businessPhone,
        recipient_number: cleanNumber,
        direction: 'outbound',
        body: text,
        status: 'failed',
        error_reason: sendResult.error,
        approval_id: approvalId || null,
      });

      return NextResponse.json(
        {
          success: false,
          error: sendResult.error || 'OpenWA message dispatch failed',
          status: 'failed',
        },
        { status: 502 }
      );
    }

    // 6. Record successfully submitted message & mark approval dispatched
    const sentAt = new Date().toISOString();
    const { data: recordedMsg } = await supabase
      .from('whatsapp_messages')
      .insert({
        session_id: config.sessionId,
        lead_id: leadId || null,
        chat_id: chatId,
        sender_number: config.businessPhone,
        recipient_number: cleanNumber,
        direction: 'outbound',
        body: text,
        status: 'submitted',
        external_message_id: sendResult.messageId,
        approval_id: approvalId || null,
        approval_hash: approval.payload_hash,
        sent_at: sentAt,
      })
      .select('id')
      .single();

    await supabase
      .from('approvals')
      .update({ status: 'sent', decided_at: sentAt })
      .eq('id', approvalId);

    if (approval.target_id) {
      await supabase
        .from('outreach_drafts')
        .update({ approval_status: 'sent', sent_at: sentAt })
        .eq('id', approval.target_id);
    }

    // 7. Record in multi-channel conversations
    if (leadId) {
      await supabase.from('conversations').insert({
        lead_id: leadId,
        channel: 'whatsapp',
        direction: 'outbound',
        sender: 'ZenLyft Operations',
        recipient: cleanNumber,
        message_content: text,
        external_message_id: sendResult.messageId,
      });

      // Update lead status
      await supabase
        .from('leads')
        .update({
          pipeline_stage: 'contacted',
          next_action: 'Awaiting prospect response or scheduled follow-up',
        })
        .eq('id', leadId);
    }

    // 8. Audit Event
    await supabase.from('audit_log').insert({
      action: 'whatsapp.message_submitted',
      entity: 'lead',
      entity_id: leadId || cleanNumber,
      metadata: {
        recipient: cleanNumber,
        openwa_message_id: sendResult.messageId,
        approval_id: approvalId || null,
      },
    });

    return NextResponse.json({
      success: true,
      status: 'submitted',
      chatId,
      messageId: sendResult.messageId,
      dbMessageId: recordedMsg?.id,
    });
  } catch (err: any) {
    console.error('[OpenWA Send Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

