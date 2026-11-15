import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { enforceApiAuth } from '@/lib/security/api-auth';
import { researchAndPrepareOutreach } from '@/lib/ai/outreach-intelligence';
import { queueResearchOutreachApprovals } from '@/lib/crm/outreach-dossier-store';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const LOCATION_COORDS: Record<string, { lat: number; lon: number; radius: number }> = {
  coimbatore: { lat: 11.0168, lon: 76.9558, radius: 15000 },
  chennai: { lat: 13.0827, lon: 80.2707, radius: 18000 },
  bengaluru: { lat: 12.9716, lon: 77.5946, radius: 20000 },
  bangalore: { lat: 12.9716, lon: 77.5946, radius: 20000 },
  mumbai: { lat: 19.076, lon: 72.8777, radius: 20000 },
  pune: { lat: 18.5204, lon: 73.8567, radius: 15000 },
  hyderabad: { lat: 17.385, lon: 78.4867, radius: 18000 },
  delhi: { lat: 28.6139, lon: 77.209, radius: 22000 },
  'new delhi': { lat: 28.6139, lon: 77.209, radius: 22000 },
  noida: { lat: 28.5355, lon: 77.391, radius: 15000 },
  gurugram: { lat: 28.4595, lon: 77.0266, radius: 15000 },
  gurgaon: { lat: 28.4595, lon: 77.0266, radius: 15000 },
  ahmedabad: { lat: 23.0225, lon: 72.5714, radius: 18000 },
  surat: { lat: 21.1702, lon: 72.8311, radius: 15000 },
  kolkata: { lat: 22.5726, lon: 88.3639, radius: 18000 },
  jaipur: { lat: 26.9124, lon: 75.7873, radius: 15000 },
  lucknow: { lat: 26.8467, lon: 80.9462, radius: 15000 },
  kochi: { lat: 9.9312, lon: 76.2673, radius: 14000 },
  cochin: { lat: 9.9312, lon: 76.2673, radius: 14000 },
  thiruvananthapuram: { lat: 8.5241, lon: 76.9366, radius: 14000 },
  trivandrum: { lat: 8.5241, lon: 76.9366, radius: 14000 },
  tiruppur: { lat: 11.1085, lon: 77.3411, radius: 12000 },
  erode: { lat: 11.341, lon: 77.7172, radius: 12000 },
  salem: { lat: 11.6643, lon: 78.146, radius: 12000 },
  madurai: { lat: 9.9252, lon: 78.1198, radius: 14000 },
  tiruchirappalli: { lat: 10.7905, lon: 78.7047, radius: 14000 },
  trichy: { lat: 10.7905, lon: 78.7047, radius: 14000 },
  vellore: { lat: 12.9165, lon: 79.1325, radius: 12000 },
  mysuru: { lat: 12.2958, lon: 76.6394, radius: 14000 },
  mysore: { lat: 12.2958, lon: 76.6394, radius: 14000 },
  mangaluru: { lat: 12.9141, lon: 74.856, radius: 14000 },
  mangalore: { lat: 12.9141, lon: 74.856, radius: 14000 },
  visakhapatnam: { lat: 17.6868, lon: 83.2185, radius: 15000 },
  vijayawada: { lat: 16.5062, lon: 80.648, radius: 14000 },
  bhopal: { lat: 23.2599, lon: 77.4126, radius: 15000 },
  indore: { lat: 22.7196, lon: 75.8577, radius: 15000 },
  chandigarh: { lat: 30.7333, lon: 76.7794, radius: 14000 },
  patna: { lat: 25.5941, lon: 85.1376, radius: 15000 },
  bhubaneswar: { lat: 20.2961, lon: 85.8245, radius: 15000 },
  guwahati: { lat: 26.1445, lon: 91.7362, radius: 14000 },
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

async function resolveCoords(city: string): Promise<{ lat: number; lon: number; radius: number } | null> {
  const key = city.toLowerCase().trim();
  if (LOCATION_COORDS[key]) return LOCATION_COORDS[key];

  try {
    const query = `${encodeURIComponent(city)}, India`;
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      {
        headers: { 'User-Agent': 'ZenLyft-REOZ/2.0 (+https://zenlyft.in; contact@zenlyft.in)' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (Array.isArray(geoData) && geoData[0]?.lat && geoData[0]?.lon) {
        return { lat: Number(geoData[0].lat), lon: Number(geoData[0].lon), radius: 15000 };
      }
    }
  } catch {
    // Non-fatal geocoding error
  }

  return null;
}

export async function POST(req: NextRequest) {
  const authBlock = await enforceApiAuth(req);
  if (authBlock) return authBlock;

  try {
    const { city = 'Coimbatore', category = 'college', limit = 10 } = await req.json();

    const catKey = String(category).toLowerCase().trim();
    const location = await resolveCoords(String(city || 'Coimbatore'));

    if (!location) {
      return NextResponse.json(
        {
          success: false,
          error: `GEOLOCATION_FAILED: Could not resolve '${city}' within India. Please provide an Indian city, district, or region.`,
        },
        { status: 400 }
      );
    }

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
      const email = tags.email || tags['contact:email'] || null;
      const sourceRef =
        el.type && el.id
          ? `https://www.openstreetmap.org/${el.type}/${el.id}`
          : 'https://www.openstreetmap.org';

      const websiteStatus = website ? 'verified' : 'not_found_in_checked_sources';
      const initialDossier = await researchAndPrepareOutreach(
        {
          company_name: String(name),
          industry: catInfo.label,
          category: catInfo.label,
          location: String(city).trim() || 'Global',
          website_url: website,
          website_status: websiteStatus,
          public_phone: phone,
          public_email: email,
          research_sources: [sourceRef, ...(website ? [website] : [])],
          observed_facts: [
            website
              ? `Website identified in OpenStreetMap registry: ${website}`
              : 'Physical registered location in OpenStreetMap registry with no discoverable website.',
          ],
        },
        { inspectWebsite: Boolean(website) }
      );

      if (initialDossier.status === 'NOT_A_FIT') continue;

      const score = initialDossier.lead_score;

      const { data: createdLead, error } = await supabase
        .from('leads')
        .insert({
          organisation_name: name,
          normalised_name: normName,
          organisation_type: catInfo.orgType,
          category: initialDossier.research_profile.sub_industry || catInfo.label,
          location: String(city).trim() || 'Global',
          website_url: website,
          website_status: websiteStatus,
          service_interest: initialDossier.service_match.recommended_solution,
          score,
          pipeline_stage: score >= 60 ? 'qualified' : 'discovered',
          next_action: `Founder Approval Pending — ${initialDossier.service_match.recommended_solution}`,
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
          source_url: sourceRef,
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
        if (email) {
          await supabase.from('contact_channels').insert({
            lead_id: createdLead.id,
            channel_type: 'email',
            public_value: email,
          });
        }

        const boundDossier = await researchAndPrepareOutreach(
          {
            lead_id: createdLead.id,
            company_name: String(name),
            industry: catInfo.label,
            category: catInfo.label,
            location: String(city).trim() || 'Global',
            website_url: website,
            website_status: websiteStatus,
            public_phone: phone,
            public_email: email,
            research_sources: initialDossier.research_profile.research_sources,
            observed_facts: initialDossier.research_profile.public_business_observations,
            business_description: initialDossier.research_profile.business_description,
            services_offered: initialDossier.research_profile.services_offered,
          },
          { inspectWebsite: false }
        );

        await queueResearchOutreachApprovals({
          supabase,
          leadId: createdLead.id,
          dossier: boundDossier,
        });
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
