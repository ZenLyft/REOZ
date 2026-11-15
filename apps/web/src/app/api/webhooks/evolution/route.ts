import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Evolution API Webhook Endpoint (DEPRECATED & DISABLED)
 * Replaced entirely by the native Baileys Dedicated WhatsApp Gateway (/api/webhooks/openwa).
 * Fail-closed with HTTP 410 Gone to prevent unauthorized ingestion.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'GONE: Evolution API integration has been retired. All WhatsApp operations are handled securely by the native Baileys Gateway.',
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      status: 'deprecated',
      message: 'Evolution API webhook is disabled. Use native Baileys Gateway.',
    },
    { status: 410 }
  );
}
