import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

const LOCATION_COORDS: Record<string, { lat: number; lon: number; radius: number }> = {
  coimbatore: { lat: 11.0168, lon: 76.9558, radius: 15000 },
  chennai: { lat: 13.0827, lon: 80.2707, radius: 15000 },
  bangalore: { lat: 12.9716, lon: 77.5946, radius: 15000 },
  tiruppur: { lat: 11.1085, lon: 77.3411, radius: 12000 },
  kangeyam: { lat: 11.0044, lon: 77.5587, radius: 10000 },
  dharapuram: { lat: 10.7303, lon: 77.5255, radius: 10000 },
  erode: { lat: 11.3410, lon: 77.7172, radius: 12000 },
  salem: { lat: 11.6643, lon: 78.1460, radius: 12000 },
};

const CATEGORY_TAGS: Record<string, { tag: string; label: string; orgType: 'local_business' | 'institution' }> = {
  restaurant: { tag: 'amenity=restaurant', label: 'Hospitality / Restaurant', orgType: 'local_business' },
  cafe: { tag: 'amenity=cafe', label: 'Hospitality / Cafe', orgType: 'local_business' },
  hotel: { tag: 'tourism=hotel', label: 'Hospitality / Hotel', orgType: 'local_business' },
  clinic: { tag: 'amenity=clinic', label: 'Healthcare / Clinic', orgType: 'local_business' },
  hospital: { tag: 'amenity=hospital', label: 'Healthcare / Hospital', orgType: 'local_business' },
  gym: { tag: 'leisure=fitness_centre', label: 'Fitness / Gym', orgType: 'local_business' },
  school: { tag: 'amenity=school', label: 'Education / School', orgType: 'institution' },
  college: { tag: 'amenity=college', label: 'Education / College', orgType: 'institution' },
  university: { tag: 'amenity=university', label: 'Education / University', orgType: 'institution' },
  coaching: { tag: 'amenity=tuition', label: 'Education / Coaching Centre', orgType: 'institution' },
};

export async function POST(req: NextRequest) {
  try {
    const { city = 'coimbatore', category = 'clinic', limit = 10 } = await req.json();

    const locKey = city.toLowerCase().trim();
    const catKey = category.toLowerCase().trim();

    const location = LOCATION_COORDS[locKey] || LOCATION_COORDS['coimbatore'];
    const catInfo = CATEGORY_TAGS[catKey] || CATEGORY_TAGS['clinic'];

    // Overpass QL Query
    const query = `
      [out:json][timeout:25];
      (
        node[${catInfo.tag}](around:${location.radius},${location.lat},${location.lon});
        way[${catInfo.tag}](around:${location.radius},${location.lat},${location.lon});
      );
      out tags ${limit};
    `;

    const res = await fetch(OVERPASS_API, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'Overpass query failed or timed out' }, { status: 502 });
    }

    const data = await res.json();
    const elements = data.elements || [];

    const supabase = createAdminClient();

    // Fetch existing normalised names for deduplication
    const { data: existingLeads } = await supabase.from('leads').select('normalised_name');
    const existingSet = new Set((existingLeads || []).map((l: any) => l.normalised_name));

    let addedCount = 0;
    const addedList: any[] = [];

    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name;
      if (!name || name.trim().length < 3) continue;

      const normName = name.toLowerCase().replace(/[^\w\s]/g, '').trim();
      if (existingSet.has(normName)) continue;

      const website = tags.website || tags['contact:website'] || null;
      const phone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;

      const websiteStatus = website ? 'verified' : 'not_found_in_checked_sources';
      const score = website ? 75 : 92; // Higher opportunity score if website is absent

      const { data: createdLead, error } = await supabase
        .from('leads')
        .insert({
          organisation_name: name,
          normalised_name: normName,
          organisation_type: catInfo.orgType,
          category: catInfo.label,
          location: `${city.charAt(0).toUpperCase() + city.slice(1)}, Tamil Nadu`,
          website_url: website,
          website_status: websiteStatus,
          score,
          pipeline_stage: 'discovered',
          next_action: 'Generate AI Research Brief & Pitch',
          contact_restriction: 'none',
        })
        .select()
        .single();

      if (!error && createdLead) {
        existingSet.add(normName);
        addedCount++;
        addedList.push(createdLead);

        // Record source
        await supabase.from('sources').insert({
          lead_id: createdLead.id,
          source_url: 'https://www.openstreetmap.org',
          source_type: 'openstreetmap_overpass',
          observed_fact: website
            ? `Website identified in OpenStreetMap registry: ${website}`
            : 'Physical registered location in OpenStreetMap registry with no discoverable website.',
          confidence: 'high',
        });

        // Record contact channel
        if (phone) {
          await supabase.from('contact_channels').insert({
            lead_id: createdLead.id,
            channel_type: 'phone',
            public_value: phone,
          });
        }
      }
    }

    // Log agent execution
    await supabase.from('audit_log').insert({
      actor_type: 'agent',
      actor_id: 'agent-business-discovery',
      action: 'discovery.batch_run',
      object_type: 'leads',
      object_id: 'batch',
      result: 'success',
      metadata_without_secrets: { city, category, added_count: addedCount },
    });

    return NextResponse.json({
      success: true,
      discovered_count: elements.length,
      ingested_count: addedCount,
      leads: addedList,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
