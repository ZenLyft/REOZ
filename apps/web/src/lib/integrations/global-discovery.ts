import { syncPipelineResultsToCrm, type PipelineQualifiedLead, type PipelineOutreachDraft } from './ascension-sync';
import { ALL_INDIA_STATES_AND_HUBS } from '@/lib/ai/zenlyft-client-engine';
import {
  researchAndPrepareOutreach,
  type OutreachIntelligenceDossier,
} from '@/lib/ai/outreach-intelligence';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const REGION_HUBS: Record<string, string[]> = {
  ...ALL_INDIA_STATES_AND_HUBS,
  global: ['Bengaluru', 'Chennai', 'Mumbai', 'London', 'Singapore', 'Dubai'],
  north_america: ['New York', 'Toronto', 'Austin', 'Chicago'],
  europe: ['London', 'Berlin', 'Amsterdam', 'Dublin'],
  middle_east: ['Dubai', 'Abu Dhabi', 'Riyadh', 'Cape Town'],
  apac: ['Bengaluru', 'Chennai', 'Singapore', 'Tokyo', 'Sydney'],
  latam: ['Sao Paulo', 'Mexico City', 'Bogota', 'Santiago'],
};

const KNOWN_CITY_COORDS: Record<string, { lat: number; lon: number; radius: number }> = {
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
  amsterdam: { lat: 52.3676, lon: 4.9041, radius: 12000 },
  dublin: { lat: 53.3498, lon: -6.2603, radius: 12000 },
  austin: { lat: 30.2672, lon: -97.7431, radius: 15000 },
  chicago: { lat: 41.8781, lon: -87.6298, radius: 15000 },
  riyadh: { lat: 24.7136, lon: 46.6753, radius: 15000 },
  'abu dhabi': { lat: 24.4539, lon: 54.3773, radius: 15000 },
  'cape town': { lat: -33.9249, lon: 18.4241, radius: 15000 },
  'sao paulo': { lat: -23.5505, lon: -46.6333, radius: 15000 },
  'mexico city': { lat: 19.4326, lon: -99.1332, radius: 15000 },
  bogota: { lat: 4.711, lon: -74.0721, radius: 15000 },
  santiago: { lat: -33.4489, lon: -70.6693, radius: 15000 },
  paris: { lat: 48.8566, lon: 2.3522, radius: 15000 },
  melbourne: { lat: -37.8136, lon: 144.9631, radius: 15000 },
};

/** Safely parses a fetch Response as JSON without throwing on HTML error pages. */
export async function safeParseJson<T = Record<string, unknown>>(
  res: Response
): Promise<{ ok: boolean; status: number; data: T | null; rawText: string }> {
  const rawText = await res.text();
  try {
    const parsed = JSON.parse(rawText) as T;
    return { ok: res.ok, status: res.status, data: parsed, rawText };
  } catch {
    return { ok: false, status: res.status, data: null, rawText };
  }
}

export async function resolveCityCoordinates(
  city: string
): Promise<{ lat: number; lon: number; radius: number }> {
  const key = city.toLowerCase().trim();
  if (KNOWN_CITY_COORDS[key]) return KNOWN_CITY_COORDS[key];

  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
      {
        headers: { 'User-Agent': 'ZenLyft-REOZ/1.0 (+https://zenlyft.in)' },
        signal: AbortSignal.timeout(5000),
      }
    );
    const parsed = await safeParseJson<Array<{ lat?: string; lon?: string }>>(geoRes);
    if (parsed.ok && Array.isArray(parsed.data) && parsed.data[0]?.lat && parsed.data[0]?.lon) {
      return { lat: Number(parsed.data[0].lat), lon: Number(parsed.data[0].lon), radius: 15000 };
    }
  } catch {
    // Fallback below
  }

  return KNOWN_CITY_COORDS.london;
}

export function resolveDiscoveryCity(regionOrCity: string): string {
  const raw = String(regionOrCity || 'global').trim();
  const normalized = raw.toLowerCase();
  const hubs = REGION_HUBS[normalized];
  if (hubs && hubs.length > 0) {
    // Rotate across regional hub cities deterministically by hour so repeated sweeps cover new cities
    const hourIdx = Math.floor(Date.now() / (60 * 60 * 1000)) % hubs.length;
    return hubs[hourIdx];
  }
  return raw || 'London';
}

interface OverpassElement {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
}

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(9000),
      });
      const parsed = await safeParseJson<{ elements?: OverpassElement[] }>(res);
      if (parsed.ok && Array.isArray(parsed.data?.elements)) {
        return parsed.data.elements;
      }
    } catch {
      continue;
    }
  }
  return [];
}

export interface GlobalDiscoveryResult {
  city: string;
  qualified_leads: Array<{
    organisation_name: string;
    location: string;
    category: string;
    homs_score: number;
    recommended_package: string;
    whatsapp_draft: string;
    email_subject?: string;
    email_draft?: string;
    website_url: string | null;
    quality_score?: number;
    industry_class?: string;
  }>;
  crm_sync: {
    saved_leads: number;
    skipped_duplicates: number;
    created_approvals: number;
    first_cold_auto_sent: number;
  };
}

function classifyOsmCategory(tags: Record<string, string>): { category: string; industry: string } {
  if (tags.tourism === 'hostel') return { category: 'Hostel / Student Housing', industry: 'Education' };
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic') {
    return { category: 'Hospital / Healthcare', industry: 'Healthcare' };
  }
  if (tags.leisure === 'fitness_centre') {
    return { category: 'Fitness Centre / Gym', industry: 'Fitness' };
  }
  if (tags.amenity === 'college' || tags.amenity === 'university') {
    return { category: 'College / Educational Institution', industry: 'Education' };
  }
  return { category: 'Commercial Organization', industry: 'Business' };
}

/**
 * Discovers real institutions & businesses worldwide using OpenStreetMap (Nominatim + Overpass),
 * executes per-prospect Business Intelligence research via researchAndPrepareOutreach(),
 * and queues Founder-approved WhatsApp + Email drafts into Supabase (never auto-sends).
 */
export async function runGlobalOsmDiscovery(options: {
  regionOrCity: string;
  limit?: number;
}): Promise<GlobalDiscoveryResult> {
  const city = resolveDiscoveryCity(options.regionOrCity);
  const coords = await resolveCityCoordinates(city);
  const boundedLimit = Math.max(3, Math.min(12, Number(options.limit) || 6));

  const overpassQuery = `
    [out:json][timeout:20];
    (
      node["tourism"="hostel"](around:${coords.radius},${coords.lat},${coords.lon});
      way["tourism"="hostel"](around:${coords.radius},${coords.lat},${coords.lon});
      node["amenity"="college"](around:${coords.radius},${coords.lat},${coords.lon});
      way["amenity"="college"](around:${coords.radius},${coords.lat},${coords.lon});
      node["amenity"="university"](around:${coords.radius},${coords.lat},${coords.lon});
      node["amenity"="hospital"](around:${coords.radius},${coords.lat},${coords.lon});
      node["leisure"="fitness_centre"](around:${coords.radius},${coords.lat},${coords.lon});
    );
    out tags ${boundedLimit * 3};
  `;

  const elements = await queryOverpass(overpassQuery);
  const seen = new Set<string>();
  const qualified: PipelineQualifiedLead[] = [];
  const drafts: PipelineOutreachDraft[] = [];
  const dossierByOrg = new Map<string, OutreachIntelligenceDossier>();

  for (const el of elements) {
    const tags = el.tags || {};
    const name = (tags.name || '').trim();
    if (name.length < 3) continue;

    const norm = name.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);

    const { category, industry } = classifyOsmCategory(tags);
    const website = tags.website || tags['contact:website'] || null;
    const phone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;
    const email = tags.email || tags['contact:email'] || null;
    const sourceRef =
      el.type && el.id
        ? `https://www.openstreetmap.org/${el.type}/${el.id}`
        : 'https://www.openstreetmap.org';

    const dossier = await researchAndPrepareOutreach(
      {
        company_name: name,
        industry,
        category,
        location: city,
        website_url: website,
        public_phone: phone,
        public_email: email,
        research_sources: [sourceRef, ...(website ? [website] : [])],
        observed_facts: [
          `Verified ${category} listing in ${city} via OpenStreetMap.`,
          ...(website ? [`Official website listed: ${website}`] : ['Website URL not listed in OpenStreetMap record.']),
        ],
      },
      { inspectWebsite: Boolean(website) }
    );

    if (dossier.status === 'NOT_A_FIT' || dossier.status === 'SUPPRESSED') {
      continue;
    }

    dossierByOrg.set(name, dossier);
    const priority = dossier.lead_score >= 75 ? 'HIGH' : dossier.lead_score >= 55 ? 'MEDIUM' : 'LOW';

    qualified.push({
      organisation_name: name,
      category,
      city,
      source_ref: sourceRef,
      website_url: website,
      public_phone: phone,
      public_email: email,
      homs_score: dossier.lead_score,
      priority,
      recommended_product: dossier.service_match.recommended_solution,
      dossier,
    });

    drafts.push({
      organisation_name: name,
      channel: 'whatsapp',
      draft_message: dossier.whatsapp_draft,
      subject: dossier.email_subject,
      email_draft: dossier.email_draft,
    });

    if (qualified.length >= boundedLimit) break;
  }

  const sync = await syncPipelineResultsToCrm(
    {
      qualified_leads: qualified,
      pending_outreach_drafts: drafts,
    },
    city
  );

  return {
    city,
    qualified_leads: sync.leads.map((l, idx) => {
      const dossier = dossierByOrg.get(l.organisation_name);
      return {
        organisation_name: l.organisation_name,
        location: l.city,
        category: l.category,
        homs_score: l.homs_score,
        recommended_package: l.recommended_product,
        whatsapp_draft: l.draft_message || drafts[idx]?.draft_message || '',
        email_subject: dossier?.email_subject,
        email_draft: dossier?.email_draft,
        website_url: qualified[idx]?.website_url || null,
        quality_score: dossier?.quality_evaluation.score,
        industry_class: dossier?.industry_class,
      };
    }),
    crm_sync: {
      saved_leads: sync.savedLeadsCount,
      skipped_duplicates: sync.skippedDuplicates,
      created_approvals: sync.queuedApprovalsCount,
      first_cold_auto_sent: 0,
    },
  };
}

