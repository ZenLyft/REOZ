/**
 * ZenLyft REOZ — Native WhatsApp Baileys Gateway Service
 * 
 * Runs a standalone, lightweight WhatsApp Web socket connection using @whiskeysockets/baileys.
 * Exposes the standard OpenWA REST API endpoints on port 2785 and syncs directly with Supabase.
 * Supports both QR Code Scanning and Phone Number Pairing Codes (+91 80159 29139).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import qrcode from 'qrcode';
import pino from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.resolve(__dirname, '../data/whatsapp-auth');
const PORT = process.env.PORT || 2785;
const SESSION_ID = process.env.OPENWA_SESSION_ID || 'zenlyft-wa-01';
const BUSINESS_PHONE = (process.env.OPENWA_BUSINESS_PHONE || '918015929139').replace(/\D/g, '');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let currentStatus = 'initializing';
let currentQrDataUrl = null;
let currentPairingCode = null;
let pushName = null;
let activePhone = BUSINESS_PHONE;
let isStarting = false;

async function syncSessionToSupabase(patch) {
  if (!supabase) return;
  try {
    await supabase.from('whatsapp_sessions').upsert({
      id: SESSION_ID,
      name: 'ZenLyft Business Acquisition (Dedicated)',
      engine: 'baileys',
      phone: activePhone,
      updated_at: new Date().toISOString(),
      ...patch,
    });
  } catch (err) {
    console.error('[Supabase Sync Error]:', err.message);
  }
}

async function startWhatsAppSocket(forcePairingCode = false) {
  if (isStarting) return;
  isStarting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[Baileys] Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const logger = pino({ level: 'silent' });

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentStatus = 'qr_ready';
        try {
          currentQrDataUrl = await qrcode.toDataURL(qr, { margin: 2, scale: 6 });
          console.log('\n================================================================');
          console.log('>>> WHATSAPP QR CODE READY! Scan in WhatsApp -> Linked Devices <<<');
          console.log('================================================================\n');
        } catch (e) {
          console.error('[QR Generation Error]:', e);
        }

        await syncSessionToSupabase({
          status: 'qr_ready',
          qr_code: currentQrDataUrl,
          is_active: false,
          last_error: currentPairingCode ? `PAIRING_CODE:${currentPairingCode}` : null,
        });

        // If explicitly requested or not yet registered, pairing code can be requested
        if (forcePairingCode && !state.creds.registered) {
          try {
            console.log(`[Pairing Code] Requesting 8-digit code for +${BUSINESS_PHONE}...`);
            const code = await sock.requestPairingCode(BUSINESS_PHONE);
            currentPairingCode = code;
            console.log('\n================================================================');
            console.log(`>>> WHATSAPP PAIRING CODE FOR +${BUSINESS_PHONE}: ${code} <<<`);
            console.log('>>> Open WhatsApp -> Linked Devices -> Link with phone number <<<');
            console.log('================================================================\n');

            await syncSessionToSupabase({
              status: 'qr_ready',
              qr_code: currentQrDataUrl,
              is_active: false,
              last_error: `PAIRING_CODE:${code}`,
            });
          } catch (codeErr) {
            console.error('[Pairing Code Error]:', codeErr.message);
          }
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[Baileys Connection Closed]: Status code ${statusCode}, shouldReconnect: ${shouldReconnect}`);

        currentStatus = 'disconnected';
        currentQrDataUrl = null;
        currentPairingCode = null;

        await syncSessionToSupabase({
          status: 'disconnected',
          qr_code: null,
          is_active: false,
        });

        isStarting = false;
        if (shouldReconnect) {
          setTimeout(() => startWhatsAppSocket(false), 5000);
        } else {
          console.log('[Baileys] Session logged out. Removing auth directory for fresh start...');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch {}
          setTimeout(() => startWhatsAppSocket(true), 3000);
        }
      } else if (connection === 'open') {
        console.log('\n================================================================');
        console.log(`>>> WHATSAPP CONNECTED & READY! Active Line: +${sock.user?.id?.split(':')[0] || activePhone} <<<`);
        console.log('================================================================\n');

        currentStatus = 'ready';
        currentQrDataUrl = null;
        currentPairingCode = null;
        pushName = sock.user?.name || 'ZenLyft REOZ';
        if (sock.user?.id) {
          activePhone = sock.user.id.split(':')[0].split('@')[0];
        }

        await syncSessionToSupabase({
          status: 'ready',
          is_active: true,
          phone: activePhone,
          push_name: pushName,
          qr_code: null,
          last_active_at: new Date().toISOString(),
        });

        isStarting = false;

        // Start checking for queued messages from Cloudflare Edge / Web App
        startOutboundQueuePoller();
      }
    });

    // Inbound Messages & Webhook Processing
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid || '';
        const senderDigits = remoteJid.replace(/\D/g, '');
        if (!senderDigits) continue;

        const body =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          '[Media / Attachment]';

        console.log(`[Inbound WhatsApp from +${senderDigits}]: "${body}"`);

        if (supabase) {
          try {
            const chatId = `${senderDigits}@c.us`;
            // 1. Record inbound message
            await supabase.from('whatsapp_messages').insert({
              session_id: SESSION_ID,
              chat_id: chatId,
              sender_number: senderDigits,
              recipient_number: activePhone,
              direction: 'inbound',
              body,
              status: 'delivered',
              external_message_id: msg.key.id,
            });

            // 2. Link to lead if phone matches last 10 digits
            const last10 = senderDigits.slice(-10);
            const { data: matchedLeads } = await supabase
              .from('leads')
              .select('id, organisation_name, pipeline_stage')
              .or(`phone.ilike.%${last10}%,website_url.ilike.%${last10}%`)
              .limit(1);

            const lead = matchedLeads?.[0];
            if (lead) {
              await supabase
                .from('leads')
                .update({
                  pipeline_stage: 'replied',
                  next_action: `Inbound WhatsApp reply received: "${body.slice(0, 100)}..."`,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', lead.id);

              console.log(`[Inbound Linked] Lead ${lead.organisation_name} moved to 'replied' stage.`);
            }

            // 3. Log audit event
            await supabase.from('audit_log').insert({
              actor_type: 'webhook',
              actor_id: senderDigits,
              action: 'whatsapp.inbound_reply',
              object_type: 'whatsapp_messages',
              object_id: msg.key.id || senderDigits,
              result: 'success',
              metadata_without_secrets: {
                sender: senderDigits,
                preview: body.slice(0, 120),
                matched_lead_id: lead?.id || null,
              },
            });

            // Send founder instant alert on their WhatsApp
            try {
              const selfJid = `${activePhone}@s.whatsapp.net`;
              await sock.sendMessage(selfJid, {
                text: `🔥 *REOZ Inbound Reply Alert!*\n\n• From: *+${senderDigits}* (${lead?.organisation_name || 'Prospect'})\n• Message: "${body}"\n• Action: Lead moved to 'replied' in CRM.\n\nOpen REOZ: https://zenlyft.in/dashboard/whatsapp`,
              });
            } catch {}
          } catch (dbErr) {
            console.error('[Inbound DB Save Error]:', dbErr.message);
          }
        }
      }
    });

  } catch (err) {
    console.error('[Baileys Startup Error]:', err);
    currentStatus = 'failed';
    isStarting = false;
    await syncSessionToSupabase({ status: 'failed', last_error: err.message });
  }
}

let queuePollerInterval = null;
function startOutboundQueuePoller() {
  if (!supabase || queuePollerInterval) return;

  console.log('[Queue Worker] Outbound queue poller activated (polling Supabase every 2s)...');

  queuePollerInterval = setInterval(async () => {
    if (currentStatus !== 'ready' || !sock) return;

    try {
      const { data: queuedMessages } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('status', 'queued')
        .eq('direction', 'outbound')
        .order('created_at', { ascending: true })
        .limit(4);

      for (const msg of queuedMessages || []) {
        const cleanDigits = (msg.recipient_number || '').replace(/\D/g, '');
        if (!cleanDigits || cleanDigits.length < 8) {
          await supabase
            .from('whatsapp_messages')
            .update({ status: 'failed', error_reason: 'Invalid phone number digits' })
            .eq('id', msg.id);
          continue;
        }

        const jid = `${cleanDigits}@s.whatsapp.net`;
        console.log(`\n[Queue Worker] Dispatching queued WhatsApp message to ${jid} (${msg.body?.length} chars)...`);

        try {
          const sentMsg = await sock.sendMessage(jid, { text: msg.body });
          const now = new Date().toISOString();

          await supabase
            .from('whatsapp_messages')
            .update({
              status: 'submitted',
              external_message_id: sentMsg?.key?.id || null,
              sent_at: now,
            })
            .eq('id', msg.id);

          if (msg.approval_id) {
            await supabase
              .from('approvals')
              .update({ status: 'sent', decided_at: now })
              .eq('id', msg.approval_id);
          }

          if (msg.lead_id) {
            await supabase
              .from('leads')
              .update({ pipeline_stage: 'contacted', updated_at: now })
              .eq('id', msg.lead_id);
          }

          console.log(`[Queue Worker] Dispatched successfully! (Message ID: ${sentMsg?.key?.id})\n`);

          // Send founder instant WhatsApp alert on their own phone
          try {
            const selfJid = `${activePhone}@s.whatsapp.net`;
            await sock.sendMessage(selfJid, {
              text: `🔔 *REOZ Outbound Sent!*\n\n• To: *+${cleanDigits}*\n• Message: "${msg.body?.slice(0, 120)}..."\n• Status: ✅ Delivered\n• Time: ${new Date().toLocaleTimeString('en-IN')}`,
            });
          } catch {}
        } catch (sendErr) {
          console.error(`[Queue Worker Error Sending to ${jid}]:`, sendErr.message);
          await supabase
            .from('whatsapp_messages')
            .update({ status: 'failed', error_reason: sendErr.message })
            .eq('id', msg.id);
        }
      }
    } catch (err) {
      // Non-fatal polling error
    }
  }, 2000);
}

// REST API Gateway Server (OpenWA compatible)
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Idempotency-Key');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const jsonResponse = (data, statusCode = 200) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const getBody = () =>
    new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
    });

  try {
    // 1. Health check
    if (pathname === '/health' || pathname === '/api/health') {
      return jsonResponse({
        status: 'ok',
        engine: 'baileys',
        session: SESSION_ID,
        connection: currentStatus,
        phone: activePhone,
      });
    }

    // 2. Session info (OpenWA GET /api/sessions/{sessionId})
    if (pathname === `/api/sessions/${SESSION_ID}` || pathname === `/sessions/${SESSION_ID}`) {
      return jsonResponse({
        id: SESSION_ID,
        name: 'ZenLyft Business Acquisition (Dedicated)',
        status: currentStatus,
        phone: activePhone,
        pushName,
        qrCode: currentQrDataUrl,
        pairingCode: currentPairingCode,
        engine: 'baileys',
      });
    }

    // 3. QR Code endpoint (OpenWA GET /api/sessions/{sessionId}/auth/qr)
    if (
      pathname === `/api/sessions/${SESSION_ID}/auth/qr` ||
      pathname === `/sessions/${SESSION_ID}/auth/qr`
    ) {
      return jsonResponse({
        success: true,
        status: currentStatus,
        qrCode: currentQrDataUrl,
      });
    }

    // 4. Request Pairing Code (POST /api/sessions/{sessionId}/auth/pairing-code)
    if (
      (pathname === `/api/sessions/${SESSION_ID}/auth/pairing-code` ||
        pathname === `/sessions/${SESSION_ID}/auth/pairing-code`) &&
      method === 'POST'
    ) {
      const body = await getBody();
      const phoneToPair = (body.phoneNumber || activePhone).replace(/\D/g, '');
      if (!sock) {
        return jsonResponse({ success: false, error: 'Socket not initialized' }, 500);
      }
      try {
        const code = await sock.requestPairingCode(phoneToPair);
        currentPairingCode = code;
        return jsonResponse({ success: true, pairingCode: code, phone: phoneToPair });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // 5. Send Text Message (OpenWA POST /api/sessions/{sessionId}/messages/send-text)
    if (
      (pathname === `/api/sessions/${SESSION_ID}/messages/send-text` ||
        pathname === `/sessions/${SESSION_ID}/messages/send-text`) &&
      method === 'POST'
    ) {
      if (currentStatus !== 'ready' || !sock) {
        return jsonResponse(
          {
            success: false,
            error: `WhatsApp socket is not connected (current status: ${currentStatus}). Please link WhatsApp first.`,
          },
          503
        );
      }

      const body = await getBody();
      const { chatId, text } = body;

      if (!chatId || !text) {
        return jsonResponse({ success: false, error: 'chatId and text are required' }, 400);
      }

      const cleanDigits = chatId.replace(/\D/g, '');
      const jid = `${cleanDigits}@s.whatsapp.net`;

      console.log(`[Outbound WhatsApp to ${jid}]: Sending text (${text.length} chars)...`);
      const sentMsg = await sock.sendMessage(jid, { text });

      return jsonResponse({
        success: true,
        messageId: sentMsg.key.id,
        chatId,
        status: 'submitted',
      });
    }

    // 404 for unknown endpoints
    return jsonResponse({ error: 'Endpoint not found', path: pathname }, 404);
  } catch (err) {
    console.error('[API Handler Error]:', err);
    return jsonResponse({ error: err.message }, 500);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n================================================================`);
  console.log(`ZenLyft REOZ — Baileys WhatsApp Gateway listening on port ${PORT}`);
  console.log(`REST API: http://localhost:${PORT}/api/sessions/${SESSION_ID}`);
  console.log(`Health:   http://localhost:${PORT}/health`);
  console.log(`Session:  ${SESSION_ID} | Dedicated Line: +${BUSINESS_PHONE}`);
  console.log(`================================================================\n`);

  // Start WhatsApp Socket
  startWhatsAppSocket(true);
});
