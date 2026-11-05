/**
 * ZenLyft REOZ - Evolution API v2 WhatsApp Client
 * Integrates open-source Evolution API (Baileys-powered WhatsApp engine)
 * GitHub: https://github.com/evolution-foundation/evolution-api
 */

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

export function getEvolutionConfig(): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL || process.env.NEXT_PUBLIC_EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'zenlyft-reoz';

  if (!baseUrl || !apiKey) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    instanceName,
  };
}

export interface ConnectionStateResult {
  configured: boolean;
  state: 'open' | 'connecting' | 'close' | 'offline' | 'unconfigured';
  instanceName: string;
  qrCodeBase64?: string | null;
  pairingCode?: string | null;
  error?: string | null;
}

/**
 * Checks connection state with Evolution API
 */
export async function getEvolutionConnectionState(customInstance?: string): Promise<ConnectionStateResult> {
  const config = getEvolutionConfig();
  if (!config) {
    return {
      configured: false,
      state: 'unconfigured',
      instanceName: customInstance || 'zenlyft-reoz',
      error: 'EVOLUTION_API_URL or EVOLUTION_API_KEY environment variable is missing.',
    };
  }

  const instance = customInstance || config.instanceName;

  try {
    const res = await fetch(`${config.baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: {
        apikey: config.apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (res.status === 404) {
      // Instance does not exist yet, attempt to create it
      const createRes = await fetch(`${config.baseUrl}/instance/create`, {
        method: 'POST',
        headers: {
          apikey: config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceName: instance,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        return {
          configured: true,
          state: 'close',
          instanceName: instance,
          qrCodeBase64: createData.qrcode?.base64 || null,
          pairingCode: createData.pairingCode || null,
        };
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      return {
        configured: true,
        state: 'offline',
        instanceName: instance,
        error: `Evolution API returned ${res.status}: ${errText.slice(0, 150)}`,
      };
    }

    const data = await res.json();
    const rawState = data?.instance?.state || data?.state || 'close';

    // If disconnected, fetch QR code
    let qrBase64: string | null = null;
    let pairingCode: string | null = null;

    if (rawState !== 'open') {
      try {
        const qrRes = await fetch(`${config.baseUrl}/instance/connect/${encodeURIComponent(instance)}`, {
          method: 'GET',
          headers: { apikey: config.apiKey },
          cache: 'no-store',
        });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          qrBase64 = qrData.base64 || qrData.qrcode?.base64 || null;
          pairingCode = qrData.pairingCode || qrData.code || null;
        }
      } catch {
        // Ignored, state will remain 'close'
      }
    }

    return {
      configured: true,
      state: rawState === 'open' ? 'open' : rawState === 'connecting' ? 'connecting' : 'close',
      instanceName: instance,
      qrCodeBase64: qrBase64,
      pairingCode,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      state: 'offline',
      instanceName: instance,
      error: `Could not connect to Evolution API at ${config.baseUrl}: ${message}`,
    };
  }
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a real WhatsApp text message via Evolution API
 */
export async function sendEvolutionWhatsAppMessage(
  recipientPhone: string,
  messageText: string,
  customInstance?: string
): Promise<SendMessageResult> {
  const config = getEvolutionConfig();
  if (!config) {
    return {
      success: false,
      error: 'Evolution API not configured. Please set EVOLUTION_API_URL and EVOLUTION_API_KEY in environment variables.',
    };
  }

  const instance = customInstance || config.instanceName;

  // Clean phone number (e.g. "+91 98765 43210" -> "919876543210")
  let cleanNumber = recipientPhone.replace(/\D/g, '');
  if (cleanNumber.length === 10) {
    cleanNumber = `91${cleanNumber}`; // default to India country code
  }

  try {
    const res = await fetch(`${config.baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: {
        apikey: config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: messageText,
        delay: 1500, // natural typing presence
        linkPreview: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Evolution API send failed (${res.status}): ${errText.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      messageId: data?.key?.id || data?.id || 'sent',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to communicate with Evolution API: ${message}`,
    };
  }
}

