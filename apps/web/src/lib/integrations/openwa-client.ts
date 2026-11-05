import crypto from 'crypto';

// 11 Canonical Classifications defined in Master Specification
export type MessageClassification =
  | 'interested'
  | 'requesting_info'
  | 'asking_pricing'
  | 'requesting_demo'
  | 'wants_meeting'
  | 'not_interested'
  | 'not_right_contact'
  | 'opt_out'
  | 'support_request'
  | 'general_enquiry'
  | 'unclear';

export interface AIClassificationResult {
  classification: MessageClassification;
  confidence: number;
  intent_summary: string;
  is_opt_out: boolean;
  recommended_action: string;
  suggested_reply: string;
}

/**
 * Classifies incoming WhatsApp message using deterministic keyword analysis
 * and AI rule matching across ZenLyft's approved service portfolio.
 */
export function classifyIncomingMessage(body: string): AIClassificationResult {
  const text = (body || '').toLowerCase().trim();

  // 1. Strict Opt-Out / Do-Not-Contact Detection
  const optOutKeywords = [
    'stop',
    'unsubscribe',
    'opt out',
    'opt-out',
    'remove me',
    'don\'t message',
    'dont message',
    'do not message',
    'never contact',
    'spam',
  ];
  if (optOutKeywords.some((k) => text === k || text.startsWith(`${k} `) || text.includes(` ${k}`))) {
    return {
      classification: 'opt_out',
      confidence: 0.99,
      intent_summary: 'Prospect explicitly requested communication cessation / opt-out.',
      is_opt_out: true,
      recommended_action: 'Immediately halt all communication, mark DNC, and cancel scheduled followups.',
      suggested_reply: 'Understood. We have removed your number from our contact list. You will not receive any further messages.',
    };
  }

  // 2. Demo / Presentation Request
  if (text.includes('demo') || text.includes('demonstration') || text.includes('preview') || text.includes('show me how')) {
    return {
      classification: 'requesting_demo',
      confidence: 0.95,
      intent_summary: 'Prospect requested a live product demonstration or visual preview.',
      is_opt_out: false,
      recommended_action: 'Coordinate interactive walkthrough or send verified product demo link.',
      suggested_reply: 'Thank you for your interest! We would be delighted to demonstrate how our platform works. What day and time suits your team best for a quick 15-minute walkthrough?',
    };
  }

  // 3. Meeting / Discussion Request
  if (text.includes('meeting') || text.includes('call') || text.includes('discuss') || text.includes('schedule') || text.includes('zoom') || text.includes('google meet')) {
    return {
      classification: 'wants_meeting',
      confidence: 0.92,
      intent_summary: 'Prospect is open to or requesting an introductory meeting or call.',
      is_opt_out: false,
      recommended_action: 'Propose founder availability for discovery conversation.',
      suggested_reply: 'Thank you! Niresh (our Founder & CEO) would be glad to connect with you directly. Are you available tomorrow at 3:00 PM IST or 5:00 PM IST for a brief chat?',
    };
  }

  // 4. Pricing / Commercial Terms
  if (text.includes('price') || text.includes('cost') || text.includes('how much') || text.includes('charges') || text.includes('rate') || text.includes('quotation') || text.includes('quote')) {
    return {
      classification: 'asking_pricing',
      confidence: 0.90,
      intent_summary: 'Prospect is asking about investment, packages, or pricing structure.',
      is_opt_out: false,
      recommended_action: 'Share approved catalogue commercial floor without fabricated discounts.',
      suggested_reply: 'Our standard approved project suites start from ₹9,999 for foundational business setups and ₹17,999 for full growth booking portals, including deployment and WhatsApp integrations. To give you an exact scope, which specific capabilities are top priority for your organization?',
    };
  }

  // 5. Not Interested / Decline
  if (text.includes('not interested') || text.includes('no need') || text.includes('not looking') || text.includes('no thanks') || text.includes('already have')) {
    return {
      classification: 'not_interested',
      confidence: 0.92,
      intent_summary: 'Prospect politely declined current interest or indicated existing vendor.',
      is_opt_out: false,
      recommended_action: 'Acknowledge gracefully with polite closure; pause outbound sequence.',
      suggested_reply: 'Thank you for letting us know! We appreciate your time and wish you continued success with your operations. Feel free to reach out if requirements evolve in the future.',
    };
  }

  // 6. Wrong Contact
  if (text.includes('wrong number') || text.includes('wrong person') || text.includes('not the owner') || text.includes('left the company') || text.includes('i don\'t work')) {
    return {
      classification: 'not_right_contact',
      confidence: 0.95,
      intent_summary: 'Recipient indicates they are not the appropriate stakeholder for this organization.',
      is_opt_out: false,
      recommended_action: 'Update contact record and request introduction to correct decision maker.',
      suggested_reply: 'Our apologies for any confusion! Thank you for clarifying. Could you kindly share the best contact or department in your organization that manages technical systems or digital operations?',
    };
  }

  // 7. General Information Request
  if (text.includes('what is') || text.includes('how does') || text.includes('tell me more') || text.includes('details') || text.includes('brochure') || text.includes('info')) {
    return {
      classification: 'requesting_info',
      confidence: 0.88,
      intent_summary: 'Prospect is asking for general information or capabilities overview.',
      is_opt_out: false,
      recommended_action: 'Provide concise summary of ZenLyft solutions matched to their sector.',
      suggested_reply: 'ZenLyft provides enterprise-grade digital systems—including custom education ERPs, hostel outpass managers, automated business workflows, and high-performance booking portals. Which area would bring the most immediate value to your daily operations?',
    };
  }

  // 8. Positive Interest
  if (text.includes('yes') || text.includes('interested') || text.includes('sure') || text.includes('ok') || text.includes('sounds good') || text.includes('great')) {
    return {
      classification: 'interested',
      confidence: 0.85,
      intent_summary: 'Prospect expressed positive sentiment or openness to continue.',
      is_opt_out: false,
      recommended_action: 'Advance pipeline stage and submit proposal / meeting proposal for founder approval.',
      suggested_reply: 'Glad to hear that! To tailor our discussion specifically for your organization, what is the biggest operational or digital bottleneck your team is currently facing?',
    };
  }

  // 9. Support Request
  if (text.includes('issue') || text.includes('bug') || text.includes('error') || text.includes('down') || text.includes('help')) {
    return {
      classification: 'support_request',
      confidence: 0.80,
      intent_summary: 'Prospect is reporting a technical issue or seeking operational support.',
      is_opt_out: false,
      recommended_action: 'Escalate to engineering team immediately.',
      suggested_reply: 'Thank you for reaching out. Our engineering team has logged this alert and is reviewing it right now. Could you please share a screenshot or error message if available?',
    };
  }

  // Default: General Enquiry / Unclear
  return {
    classification: 'general_enquiry',
    confidence: 0.70,
    intent_summary: 'General message requiring founder context review.',
    is_opt_out: false,
    recommended_action: 'Founder review required before preparing tailored reply.',
    suggested_reply: 'Thank you for your message! Our founder Niresh will review this directly and get back to you shortly.',
  };
}

export interface OpenWAConfig {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  webhookSecret?: string;
}

export interface OpenWASessionInfo {
  id: string;
  name: string;
  status:
    | 'created'
    | 'initializing'
    | 'qr_ready'
    | 'authenticating'
    | 'ready'
    | 'disconnected'
    | 'action_required'
    | 'failed';
  phone?: string | null;
  pushName?: string | null;
  qrCode?: string | null;
  lastActive?: string | null;
  lastError?: string | null;
  restriction?: any;
  engineLoaded?: boolean;
}

export interface SendTextMessageParams {
  chatId: string; // e.g. "919340000000@c.us"
  text: string;
  idempotencyKey?: string;
  quotedMessageId?: string;
}

export interface SendTextMessageResult {
  success: boolean;
  messageId?: string;
  chatId: string;
  status: 'queued' | 'submitted' | 'sent' | 'failed';
  error?: string;
}

/**
 * Returns the configured OpenWA connection parameters from environment.
 */
export function getOpenWAConfig(): OpenWAConfig {
  const baseUrl = (
    process.env.OPENWA_API_URL ||
    process.env.NEXT_PUBLIC_OPENWA_API_URL ||
    'http://localhost:2785/api'
  ).replace(/\/+$/, '');

  const apiKey = process.env.OPENWA_API_KEY || '';
  const sessionId = process.env.OPENWA_SESSION_ID || 'zenlyft-wa-01';
  const webhookSecret = process.env.OPENWA_WEBHOOK_SECRET || 'zenlyft-openwa-secure-secret-2026';

  return {
    baseUrl,
    apiKey,
    sessionId,
    webhookSecret,
  };
}

/**
 * Verifies OpenWA Webhook HMAC-SHA256 signature in constant time.
 * OpenWA computes: `sha256=<hex>` over raw request bytes.
 */
export function verifyOpenWASignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const cleanHeader = signatureHeader.trim();
  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
    .digest('hex');

  const expectedHeader = `sha256=${expectedHex}`;

  const headerBuf = Buffer.from(cleanHeader, 'utf8');
  const expectedBuf = Buffer.from(expectedHeader, 'utf8');

  if (headerBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}

/**
 * Formats a phone number into WhatsApp standard Chat ID (e.g., 919876543210 -> 919876543210@c.us)
 */
export function formatWhatsAppChatId(phoneOrJid: string): string {
  const clean = phoneOrJid.trim();
  if (clean.includes('@c.us') || clean.includes('@g.us')) {
    return clean;
  }
  // Strip all non-digits and leading zeros
  const digits = clean.replace(/\D/g, '').replace(/^0+/, '');
  return `${digits}@c.us`;
}

/**
 * OpenWA REST API Client
 */
export class OpenWAClient {
  private config: OpenWAConfig;

  constructor(customConfig?: Partial<OpenWAConfig>) {
    this.config = {
      ...getOpenWAConfig(),
      ...customConfig,
    };
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  /**
   * Fetch current session info & connection status
   * GET /api/sessions/{sessionId}
   */
  async getSession(sessionId?: string): Promise<OpenWASessionInfo | null> {
    const sid = sessionId || this.config.sessionId;
    try {
      const res = await fetch(`${this.config.baseUrl}/sessions/${encodeURIComponent(sid)}`, {
        method: 'GET',
        headers: this.headers,
        cache: 'no-store',
      });

      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`OpenWA error ${res.status}: ${await res.text()}`);
      }

      return await res.json();
    } catch (err: any) {
      console.warn(`[OpenWA] getSession(${sid}) failed:`, err.message);
      return null;
    }
  }

  /**
   * Fetch session QR code if awaiting scan
   * GET /api/sessions/{sessionId}/qr
   */
  async getQRCode(sessionId?: string): Promise<{ qrCode: string | null; status: string }> {
    const sid = sessionId || this.config.sessionId;
    try {
      const res = await fetch(`${this.config.baseUrl}/sessions/${encodeURIComponent(sid)}/qr`, {
        method: 'GET',
        headers: this.headers,
        cache: 'no-store',
      });

      if (!res.ok) {
        return { qrCode: null, status: 'error' };
      }

      const data = await res.json();
      return {
        qrCode: data.qrCode || null,
        status: data.status || 'unknown',
      };
    } catch (err: any) {
      return { qrCode: null, status: 'unreachable' };
    }
  }

  /**
   * Create a new session
   * POST /api/sessions
   */
  async createSession(name: string, config?: Record<string, any>): Promise<any> {
    const res = await fetch(`${this.config.baseUrl}/sessions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        name,
        config: config || {
          autoRejectCalls: false,
          maxReconnectAttempts: 5,
          reconnectBaseDelay: 5000,
        },
      }),
    });

    if (!res.ok && res.status !== 409) {
      throw new Error(`Create session failed (${res.status}): ${await res.text()}`);
    }

    return await res.json();
  }

  /**
   * Start a session engine
   * POST /api/sessions/{sessionId}/start
   */
  async startSession(sessionId?: string): Promise<any> {
    const sid = sessionId || this.config.sessionId;
    const res = await fetch(`${this.config.baseUrl}/sessions/${encodeURIComponent(sid)}/start`, {
      method: 'POST',
      headers: this.headers,
    });

    if (!res.ok && res.status !== 400) {
      throw new Error(`Start session failed (${res.status}): ${await res.text()}`);
    }

    return await res.json();
  }

  /**
   * Stop a session
   * POST /api/sessions/{sessionId}/stop
   */
  async stopSession(sessionId?: string): Promise<any> {
    const sid = sessionId || this.config.sessionId;
    const res = await fetch(`${this.config.baseUrl}/sessions/${encodeURIComponent(sid)}/stop`, {
      method: 'POST',
      headers: this.headers,
    });

    return await res.json();
  }

  /**
   * Send a text message to a WhatsApp chat
   * POST /api/sessions/{sessionId}/messages/send-text
   * Note: This strictly enforces OpenWA's documented endpoint and idempotency header!
   */
  async sendTextMessage(
    params: SendTextMessageParams,
    sessionId?: string
  ): Promise<SendTextMessageResult> {
    const sid = sessionId || this.config.sessionId;
    const chatId = formatWhatsAppChatId(params.chatId);

    const headers: Record<string, string> = {
      ...this.headers,
    };

    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }

    try {
      const res = await fetch(
        `${this.config.baseUrl}/sessions/${encodeURIComponent(sid)}/messages/send-text`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chatId,
            text: params.text,
            quotedMessageId: params.quotedMessageId,
            linkPreview: false,
          }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          chatId,
          status: 'failed',
          error: `OpenWA error (${res.status}): ${errorText}`,
        };
      }

      const data = await res.json();
      return {
        success: true,
        messageId: data.id || data.messageId || params.idempotencyKey,
        chatId,
        status: 'submitted',
      };
    } catch (err: any) {
      return {
        success: false,
        chatId,
        status: 'failed',
        error: err.message || 'Network error communicating with OpenWA gateway',
      };
    }
  }

  /**
   * Register or update the webhook URL with OpenWA
   * POST /api/sessions/{sessionId}/webhooks
   */
  async registerWebhook(
    webhookUrl: string,
    secret: string,
    sessionId?: string
  ): Promise<any> {
    const sid = sessionId || this.config.sessionId;
    const res = await fetch(`${this.config.baseUrl}/sessions/${encodeURIComponent(sid)}/webhooks`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        url: webhookUrl,
        secret,
        events: [
          'message.received',
          'message.sent',
          'message.ack',
          'message.failed',
          'session.status',
          'session.qr',
          'session.authenticated',
          'session.disconnected',
        ],
        retryCount: 3,
      }),
    });

    if (!res.ok) {
      throw new Error(`Register webhook failed (${res.status}): ${await res.text()}`);
    }

    return await res.json();
  }
}
