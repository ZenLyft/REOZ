import { describe, expect, it } from 'vitest';
import {
  ASCENSION_DEPARTMENTS,
  fetchAscensionSnapshot,
} from '@/lib/integrations/ascension-client';

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
});

