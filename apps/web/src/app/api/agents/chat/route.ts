import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL_NAME = 'llama-3.3-70b-versatile';

function extractTargetCity(message: string): string {
  const inMatch = message.match(/\bin\s+([a-zA-Z\s-]{2,30})(?:$|,|\.|for|\?)/i);
  if (inMatch?.[1]) {
    return inMatch[1].trim();
  }
  return 'London';
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const [{ count: leadCount }, { count: approvalCount }, { data: topLeads }, { data: paidPayments }, { count: projectCount }] =
      await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase
          .from('leads')
          .select('organisation_name, category, location, score, pipeline_stage')
          .order('score', { ascending: false })
          .limit(5),
        supabase.from('payments').select('amount_received_inr'),
        supabase.from('projects').select('*', { count: 'exact', head: true }),
      ]);

    const verifiedCashInr = (paidPayments || []).reduce(
      (sum: number, p: { amount_received_inr: number }) => sum + (p.amount_received_inr || 0),
      0
    );

    const contextSnippet = `
CURRENT REOZ LIVE DATABASE CONTEXT:
- Total Discovered Leads in DB: ${leadCount || 0}
- Pending Founder Approvals: ${approvalCount || 0}
- Active Onboarded Client Projects: ${projectCount || 0}
- Verified Cash Collected (INR): ₹${verifiedCashInr.toLocaleString('en-IN')}
- Top Scored Leads: ${JSON.stringify(topLeads || [])}
`;

    const lower = message.toLowerCase();

    if (lower.includes('find') || lower.includes('discover') || lower.includes('search')) {
      const targetCity = extractTargetCity(message);
      let targetCategory = 'college';

      const categories = ['hostel', 'college', 'university', 'school', 'clinic', 'hospital', 'hotel', 'restaurant', 'cafe', 'gym', 'coaching'];
      for (const cat of categories) {
        if (lower.includes(cat)) {
          targetCategory = cat;
          break;
        }
      }

      const host = req.headers.get('host') || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';

      const discRes = await fetch(`${protocol}://${host}/api/agents/discovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: targetCity, category: targetCategory, limit: 10 }),
      });

      const discData = await discRes.json();

      return NextResponse.json({
        success: true,
        action_executed: 'business_discovery',
        response: `Discovery executed for **${targetCategory.toUpperCase()}** in **${targetCity.toUpperCase()}**.\n\n• Found: **${discData.discovered_count || 0}** physical organisations from OpenStreetMap\n• Saved: **${discData.ingested_count || 0}** new deduplicated leads to your CRM\n• Open **Leads** or **Find Clients** to review and outreach.`,
      });
    }

    if (!GROQ_API_KEY) {
      return NextResponse.json({
        success: true,
        response: `Groq API key is missing in environment.\n\nLive DB Status: **${leadCount || 0}** leads, **${approvalCount || 0}** pending approvals, **${projectCount || 0}** active projects, **₹${verifiedCashInr.toLocaleString('en-IN')}** verified cash.`,
      });
    }

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `You are the Chief AI Orchestrator of REOZ for ZenLyft founder Niresh Senthoor.
Use ONLY verified facts from the live database context below. Never invent revenue or leads.
${contextSnippet}
Respond in concise, actionable markdown focused on closing paying clients globally.`,
          },
          { role: 'user', content: message },
        ],
      }),
    });

    const groqData = await groqResponse.json();
    const reply = groqData.choices?.[0]?.message?.content || 'Unable to generate response right now.';

    return NextResponse.json({
      success: true,
      response: reply,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Command failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
