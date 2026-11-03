import { LeadCreateInput, LeadCreateSchema, normalizeOrgName, extractDomain, normalizePhone, checkDuplicateLead, ExistingLeadRef } from './leads';

export interface CsvRowResult {
  rowNumber: number;
  data?: LeadCreateInput;
  duplicate?: {
    type: 'exact_domain' | 'exact_phone' | 'near_name';
    matchedWith: string;
  };
  error?: string;
}

export interface CsvImportReport {
  totalRows: number;
  validRows: LeadCreateInput[];
  duplicates: Array<{ rowNumber: number; name: string; reason: string }>;
  errors: Array<{ rowNumber: number; raw: Record<string, string>; error: string }>;
}

export function parseCsvContent(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rawValues = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const rowObj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = rawValues[idx] || '';
    });
    rows.push(rowObj);
  }
  return rows;
}

export function validateAndProcessCsv(
  rows: Record<string, string>[],
  existingLeads: ExistingLeadRef[]
): CsvImportReport {
  const report: CsvImportReport = {
    totalRows: rows.length,
    validRows: [],
    duplicates: [],
    errors: [],
  };

  const stagedLeads: ExistingLeadRef[] = [...existingLeads];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // account for header line + 1-based index

    // Map common header variants
    const name = (row['organisation_name'] || row['business_name'] || row['name'] || row['company'] || '').trim();
    const category = (row['category'] || row['industry'] || row['type'] || 'General Business').trim();
    const location = (row['location'] || row['city'] || row['address'] || '').trim();
    const website = (row['website_url'] || row['website'] || row['url'] || '').trim();
    const phone = (row['phone'] || row['mobile'] || row['contact_phone'] || '').trim();
    const email = (row['email'] || row['contact_email'] || '').trim();
    const evidenceNote = (row['evidence_note'] || row['notes'] || 'Imported via CSV batch').trim();

    const candidateData = {
      organisation_name: name,
      organisation_type: (row['organisation_type'] === 'institution' ? 'institution' : 'local_business') as 'local_business' | 'institution',
      category,
      location,
      website_url: website,
      website_status: 'not_enough_evidence' as const,
      status_evidence_note: evidenceNote,
      service_interest: row['service_interest'] || 'Web Development & Automation',
      public_phone: phone,
      public_email: email,
      source_url: website || '',
      contact_restriction: (row['contact_restriction'] === 'do_not_contact' ? 'do_not_contact' : 'none') as 'none' | 'do_not_contact' | 'opt_out',
    };

    const validation = LeadCreateSchema.safeParse(candidateData);
    if (!validation.success) {
      report.errors.push({
        rowNumber,
        raw: row,
        error: validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
      return;
    }

    // Deduplication check
    const dupCheck = checkDuplicateLead(
      { name, website_url: website, phone },
      stagedLeads
    );

    if (dupCheck.type !== 'none') {
      report.duplicates.push({
        rowNumber,
        name,
        reason: `Matched existing lead "${dupCheck.matchedLead.organisation_name}" by ${dupCheck.type}`,
      });
      return;
    }

    // Valid lead
    report.validRows.push(validation.data);
    stagedLeads.push({
      id: `staged-${rowNumber}`,
      organisation_name: name,
      normalised_name: normalizeOrgName(name),
      website_domain: extractDomain(website),
      phone: normalizePhone(phone),
    });
  });

  return report;
}
