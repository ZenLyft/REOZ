import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const LOCATION_COORDS: Record<string, { lat: number; lon: number; radius: number }> = {
  london: { lat: 51.5074, lon: -0.1278, radius: 15000 },
  'new york': { lat: 40.7128, lon: -74.006, radius: 15000 },
  singapore: { lat: 1.3521, lon: 103.8198, radius: 15000 },
  dubai: { lat: 25.2048, lon: 55.2708, radius: 15000 },
  toronto: { lat: 43.6532, lon: -79.3832, radius: 15000 },
  sydney: { lat: -33.8688, lon: 151.2093, radius: 15000 },
  coimbatore: { lat: 11.0168, lon: 76.9558, radius: 15000 },
  chennai: { lat: 13.0827, lon: 80.2707, radius: 15000 },
  bengaluru: { lat: 12.9716, lon: 77.5946, radius: 15000 },
  bangalore: { lat: 12.9716, lon: 77.5946, radius: 15000 },
  mumbai: { lat: 19.076, lon: 72.8777, radius: 15000 },
  tiruppur: { lat: 11.1085, lon: 77.3411, radius: 12000 },
  erode: { lat: 11.341, lon: 77.7172, radius: 12000 },
  salem: { lat: 11.6643, lon: 78.146, radius: 12000 },
  tokyo: { lat: 35.6762, lon: 139.6503, radius: 15000 },
  berlin: { lat: 52.52, lon: 13.405, radius: 15000 },
};

const CATEGORY_TAGS: Record<string, { tag: string; label: string; orgType: 'local_business' | 'institution' }> = {
  hostel: { tag: 'tourism=hostel', label: 'Hospitality / Student Hostel', orgType: 'institution' },
  college: { tag: 'amenity=college', label: 'Education / College', orgType: 'institution' },
  university: { tag: 'amenity=university', label: 'Education / University', orgType: 'institution' },
  school: { tag: 'amenity=school', label: 'Education / School', orgType: 'institution' },
  coaching: { tag: 'amenity=tuition', label: 'Education / Coaching Centre', orgType: 'institution' },
  clinic: { tag: 'amenity=clinic', label: 'Healthcare / Clinic', orgType: 'local_business' },
  hospital: { tag: 'amenity=hospital', label: 'Healthcare / Hospital', orgType: 'local_business' },
  hotel: { tag: 'tourism=hotel', label: 'Hospitality / Hotel', orgType: 'local_business' },
  restaurant: { tag: 'amenity=restaurant', label: 'Hospitality / Restaurant', orgType: 'local_business' },
  cafe: { tag: 'amenity=cafe', label: 'Hospitality / Cafe', orgType: 'local_business' },
  gym: { tag: 'leisure=fitness_centre', label: 'Fitness / Gym', orgType: 'local_business' },
};

async function resolveCoords(city: string): Promise<{ lat: number; lon: number; radius: number }> {
  const key = city.toLowerCase().trim();
  if (LOCATION_COORDS[key]) return LOCATION_COORDS[key];

  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'ZenLyft-REOZ/1.0 (+https://zenlyft.in)' } }
    );
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (Array.isArray(geoData) && geoData[0]?.lat && geoData[0]?.lon) {
        return { lat: Number(geoData[0].lat), lon: Number(geoData[0].lon), radius: 15000 };
      }
    }
  } catch {
    // Fallback below
  }

  return LOCATION_COORDS.london;
}

export async function POST(req: NextRequest) {
  try {
    const { city = 'London', category = 'college', limit = 10 } = await req.json();

    const catKey = String(category).toLowerCase().trim();
    const location = await resolveCoords(String(city || 'London'));
    const catInfo = CATEGORY_TAGS[catKey] || CATEGORY_TAGS.college;
    const boundedLimit = Math.max(1, Math.min(25, Number(limit) || 10));

    const query = `
      [out:json][timeout:25];
      (
        node[${catInfo.tag}](around:${location.radius},${location.lat},${location.lon});
        way[${catInfo.tag}](around:${location.radius},${location.lat},${location.lon});
      );
      out tags ${boundedLimit};
    `;

    let elements: any[] = [];
    for (const mirror of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(mirror, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (res.ok) {
          const data = await res.json();
          elements = data.elements || [];
          break;
        }
      } catch {
        continue;
      }
    }

    const supabase = createAdminClient();
    const { data: existingLeads } = await supabase.from('leads').select('normalised_name');
    const existingSet = new Set((existingLeads || []).map((l: { normalised_name: string }) => l.normalised_name));

    let addedCount = 0;
    const addedList: any[] = [];

    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name;
      if (!name || String(name).trim().length < 3) continue;

      const normName = String(name).toLowerCase().replace(/[^\w\s]/g, '').trim();
      if (existingSet.has(normName)) continue;

      const website = tags.website || tags['contact:website'] || null;
      const phone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;

      const websiteStatus = website ? 'verified' : 'not_found_in_checked_sources';
      const score = website ? 75 : 92;

      const { data: createdLead, error } = await supabase
        .from('leads')
        .insert({
          organisation_name: name,
          normalised_name: normName,
          organisation_type: catInfo.orgType,
          category: catInfo.label,
          location: String(city).trim() || 'Global',
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

        await supabase.from('sources').insert({
          lead_id: createdLead.id,
          source_url: 'https://www.openstreetmap.org',
          source_type: 'openstreetmap_overpass',
          observed_fact: website
            ? `Website identified in OpenStreetMap registry: ${website}`
            : 'Physical registered location in OpenStreetMap registry with no discoverable website.',
          confidence: 'high',
        });

        if (phone) {
          await supabase.from('contact_channels').insert({
            lead_id: createdLead.id,
            channel_type: 'phone',
            public_value: phone,
          });
        }
      }
    }

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Discovery failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
