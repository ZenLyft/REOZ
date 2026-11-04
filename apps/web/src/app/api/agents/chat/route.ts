import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL_NAME = 'llama-3.3-70b-versatile';

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch live system context
    const { count: leadCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    const { count: approvalCount } = await supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const { data: topLeads } = await supabase.from('leads').select('organisation_name, category, location, score, pipeline_stage').order('score', { ascending: false }).limit(5);

    const contextSnippet = `
CURRENT REOZ DATABASE CONTEXT:
- Total Discovered Leads in DB: ${leadCount || 0}
- Pending Approvals Waiting for Founder: ${approvalCount || 0}
- Top Scored Leads: ${JSON.stringify(topLeads || [])}
`;

    // 2. Identify if command requires active tool execution
    const lower = message.toLowerCase();

    // Tool: Run Discovery
    if (lower.includes('find') || lower.includes('discover') || lower.includes('search')) {
      let targetCity = 'coimbatore';
      let targetCategory = 'clinic';

      const cities = ['tiruppur', 'kangeyam', 'dharapuram', 'coimbatore', 'erode', 'salem', 'chennai', 'bangalore'];
      for (const c of cities) {
        if (lower.includes(c)) {
          targetCity = c;
          break;
        }
      }

      const categories = ['restaurant', 'cafe', 'hotel', 'clinic', 'hospital', 'gym', 'college', 'school', 'coaching'];
      for (const cat of categories) {
        if (lower.includes(cat)) {
          targetCategory = cat;
          break;
        }
      }

      // Execute discovery tool internally
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
        response: `✅ **Discovery Executed for ${targetCategory.toUpperCase()} in ${targetCity.toUpperCase()}!**\n\n• Found: **${discData.discovered_count || 0}** real physical establishments from OpenStreetMap registry.\n• Ingested **${discData.ingested_count || 0}** new deduplicated prospects into your live database.\n• Check your **Leads** tab to see them immediately.`,
      });
    }

    // Tool: Query Groq LLM for Business Strategy / Briefs
    if (!GROQ_API_KEY) {
      return NextResponse.json({
        success: true,
        response: `Groq API Key is not configured. Database Context: ${leadCount} leads, ${approvalCount} pending approvals.`,
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
You have real-time access to the database. Be direct, authoritative, and focused on revenue operations.
${contextSnippet}
Respond in concise markdown with clear next actions.`,
          },
          { role: 'user', content: message },
        ],
      }),
    });

    const groqData = await groqResponse.json();
    const reply = groqData.choices?.[0]?.message?.content || 'Unable to generate response from Groq.';

    return NextResponse.json({
      success: true,
      response: reply,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

