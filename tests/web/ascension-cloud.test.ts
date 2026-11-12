import { describe, expect, it } from 'vitest';
import {
  ASCENSION_DEPARTMENTS,
  fetchAscensionSnapshot,
} from '@/lib/integrations/ascension-client';
import { syncPipelineResultsToCrm } from '@/lib/integrations/ascension-sync';

describe('ZenLyft Ascension Cloud Control Plane Client', () => {
  it('defines all 59 specialist roles across 9 departments with 5 initial active roles', () => {
    expect(ASCENSION_DEPARTMENTS).toHaveLength(9);
    const total = ASCENSION_DEPARTMENTS.reduce((sum, d) => sum + d.targetHeadcount, 0);
    const active = ASCENSION_DEPARTMENTS.reduce((sum, d) => sum + d.initialActive, 0);
    expect(total).toBe(59);
    expect(active).toBe(5);
  });

  it('reports NOT_CONFIGURED honestly when ASCENSION_API_URL is unset', async () => {
    const prev = process.env.ASCENSION_API_URL;
    delete process.env.ASCENSION_API_URL;
    try {
      const snap = await fetchAscensionSnapshot();
      expect(snap.connectionStatus).toBe('NOT_CONFIGURED');
      expect(snap.apiUrlConfigured).toBe(false);
    } finally {
      if (prev !== undefined) process.env.ASCENSION_API_URL = prev;
    }
  });

  it('formats verified global leads safely for background CRM sync when DB env is absent', async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = await syncPipelineResultsToCrm(
        {
          qualified_leads: [
            {
              organisation_name: 'Imperial Hall London',
              city: 'London, United Kingdom',
              category: 'hostel',
              homs_score: 83,
              priority: 'HIGH',
              recommended_product: 'ZenLyft HOMS (₹35,000)',
              source_ref: 'https://www.openstreetmap.org/way/123',
            },
          ],
          pending_outreach_drafts: [
            {
              organisation_name: 'Imperial Hall London',
              channel: 'whatsapp',
              draft_message: 'Draft pitch',
            },
          ],
        },
        'Europe & UK'
      );
      expect(res.synced).toBe(false);
      expect(res.leads).toHaveLength(1);
      expect(res.leads[0].city).toBe('London, United Kingdom');
      expect(res.leads[0].draft_message).toBe('Draft pitch');
    } finally {
      if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });
});

