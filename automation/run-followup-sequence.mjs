/**
 * REOZ 3.0 — Revenue Follow-Up Accelerator Engine
 * Targets delivered leads with high-conversion second touchpoints.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runFollowupWave() {
  console.log('🚀 Starting REOZ Revenue Follow-Up Wave...');

  // 1. Fetch leads currently in 'contacted' stage
  const { data: contactedLeads, error: leadErr } = await supabase
    .from('leads')
    .select('id, organisation_name, category, location, recommended_service, pipeline_stage, contact_restriction')
    .eq('pipeline_stage', 'contacted')
    .is('contact_restriction', null)
    .limit(50);

  if (leadErr || !contactedLeads || contactedLeads.length === 0) {
    console.log('No eligible leads currently in contacted stage.');
    return;
  }

  console.log(`Found ${contactedLeads.length} leads in 'contacted' stage. Checking outreach history...`);

  let queuedCount = 0;

  for (const lead of contactedLeads) {
    // Check their phone
    const { data: channels } = await supabase
      .from('contact_channels')
      .select('public_value')
      .eq('lead_id', lead.id)
      .limit(1);

    const rawPhone = channels?.[0]?.public_value;
    if (!rawPhone) continue;

    let cleanPhone = rawPhone.replace(/\D/g, '').replace(/^0+/, '');
    if (cleanPhone.length === 10 && /^[6-9]/.test(cleanPhone)) {
      cleanPhone = `91${cleanPhone}`;
    }

    // Check if they already have an unanswered follow-up
    const { data: existingMsgs } = await supabase
      .from('whatsapp_messages')
      .select('id, body, created_at')
      .eq('recipient_number', cleanPhone)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false });

    // If already sent 2 or more messages, don't spam
    if (existingMsgs && existingMsgs.length >= 2) {
      continue;
    }

    const isInstitutional = lead.category?.toLowerCase().includes('college') || 
                            lead.category?.toLowerCase().includes('school') ||
                            lead.category?.toLowerCase().includes('hostel');

    let followupText = '';
    if (isInstitutional) {
      followupText = `Vanakkam! Niresh from ZenLyft here. Just following up regarding ${lead.organisation_name}. We've prepared a 1-page technical brief on HOMS (Hostel Outpass Management) showing how wardens approve student gate passes in 1 tap without paperwork. Would you like me to share the PDF preview with your administration here? (Reply 'STOP' to opt out).`;
    } else {
      followupText = `Vanakkam! Niresh from ZenLyft here. Quick follow-up regarding ${lead.organisation_name}: we recently set up a 1-tap WhatsApp consultation flow for a Coimbatore business that increased patient/client inquiries by 40%. We can deliver a similar system for ${lead.organisation_name} within 48 hours for ₹17,999. Would you be open to a 60-second video demo? (Reply 'STOP' to opt out).`;
    }

    // Queue message
    const { error: qErr } = await supabase.from('whatsapp_messages').insert({
      session_id: 'zenlyft-wa-01',
      lead_id: lead.id,
      chat_id: `${cleanPhone}@c.us`,
      sender_number: '918015929139',
      recipient_number: cleanPhone,
      direction: 'outbound',
      body: followupText,
      status: 'queued',
      approval_id: null,
    });

    if (!qErr) {
      queuedCount++;
      console.log(`✓ Queued Follow-Up for ${lead.organisation_name} (+${cleanPhone})`);
    }
  }

  console.log(`\n🎉 Follow-Up Wave Complete: ${queuedCount} high-converting follow-ups queued into WhatsApp gateway.`);
}

runFollowupWave();
