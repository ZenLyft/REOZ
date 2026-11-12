export interface AscensionDepartmentMeta {
  id: string;
  name: string;
  managerAgentId: string;
  targetHeadcount: number;
  initialActive: number;
}

export const ASCENSION_DEPARTMENTS: AscensionDepartmentMeta[] = [
  { id: 'executive_office', name: 'Executive Office', managerAgentId: 'asc-01', targetHeadcount: 5, initialActive: 1 },
  { id: 'market_intelligence', name: 'Market Intelligence', managerAgentId: 'asc-06', targetHeadcount: 8, initialActive: 1 },
  { id: 'lead_generation', name: 'Lead Generation', managerAgentId: 'asc-14', targetHeadcount: 10, initialActive: 2 },
  { id: 'sales_bd', name: 'Sales & Business Development', managerAgentId: 'asc-24', targetHeadcount: 8, initialActive: 1 },
  { id: 'marketing', name: 'Marketing', managerAgentId: 'asc-32', targetHeadcount: 6, initialActive: 0 },
  { id: 'engineering_product', name: 'Engineering & Product', managerAgentId: 'asc-38', targetHeadcount: 8, initialActive: 0 },
  { id: 'finance_admin', name: 'Finance & Administration', managerAgentId: 'asc-46', targetHeadcount: 4, initialActive: 0 },
  { id: 'research_innovation', name: 'Research & Innovation', managerAgentId: 'asc-50', targetHeadcount: 5, initialActive: 0 },
  { id: 'quality_security_compliance', name: 'Quality, Security & Compliance', managerAgentId: 'asc-55', targetHeadcount: 5, initialActive: 0 },
];

export type AscensionCloudConnectionStatus = 'CONNECTED' | 'OFFLINE' | 'NOT_CONFIGURED';

export interface AscensionHealthSnapshot {
  connectionStatus: AscensionCloudConnectionStatus;
  apiUrlConfigured: boolean;
  error?: string;
  health?: Record<string, unknown>;
  registry?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  memoryFacts?: Array<Record<string, unknown>>;
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await res.text()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getAscensionConfig() {
  return {
    apiUrl: (process.env.ASCENSION_API_URL || '').trim().replace(/\/+$/, ''),
    apiSecret: (process.env.ASCENSION_API_SECRET || '').trim(),
  };
}

export function buildAscensionHeaders(): Record<string, string> {
  const { apiSecret } = getAscensionConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiSecret) {
    headers.Authorization = `Bearer ${apiSecret}`;
  }
  return headers;
}

export async function fetchAscensionSnapshot(): Promise<AscensionHealthSnapshot> {
  const { apiUrl } = getAscensionConfig();
  if (!apiUrl) {
    return {
      connectionStatus: 'NOT_CONFIGURED',
      apiUrlConfigured: false,
      error: 'ASCENSION_API_URL is not configured yet. Deploy Dockerfile.ascension to Hugging Face Spaces (16 GB free) or Oracle Always Free and set ASCENSION_API_URL.',
    };
  }

  try {
    const headers = buildAscensionHeaders();
    const [healthRes, regRes, metricsRes, memRes] = await Promise.all([
      fetch(`${apiUrl}/health`, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) }),
      fetch(`${apiUrl}/api/v1/workforce/registry`, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) }),
      fetch(`${apiUrl}/api/v1/metrics`, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) }),
      fetch(`${apiUrl}/api/v1/memory/facts?limit=12`, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) }),
    ]);

    if (!healthRes.ok) {
      return {
        connectionStatus: 'OFFLINE',
        apiUrlConfigured: true,
        error: `Ascension backend returned HTTP ${healthRes.status}`,
      };
    }

    const healthJson = await parseJsonSafe(healthRes);
    if (!healthJson) {
      return {
        connectionStatus: 'OFFLINE',
        apiUrlConfigured: true,
        error: 'Ascension backend is waking up (non-JSON response).',
      };
    }

    const regJson = regRes.ok ? await parseJsonSafe(regRes) : null;
    const metricsJson = metricsRes.ok ? await parseJsonSafe(metricsRes) : null;
    const memJson = memRes.ok ? await parseJsonSafe(memRes) : null;

    return {
      connectionStatus: 'CONNECTED',
      apiUrlConfigured: true,
      health: healthJson,
      registry: regJson || undefined,
      metrics: metricsJson || undefined,
      memoryFacts: Array.isArray(memJson?.facts) ? (memJson.facts as Array<Record<string, unknown>>) : [],
    };
  } catch (err) {
    return {
      connectionStatus: 'OFFLINE',
      apiUrlConfigured: true,
      error: err instanceof Error ? err.message : 'Unable to reach Ascension cloud backend',
    };
  }
}

