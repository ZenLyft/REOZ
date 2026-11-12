'use client';

import { useState } from 'react';
import { parseCsvContent, validateAndProcessCsv, CsvImportReport } from '@/lib/crm/csv-importer';
import { createLeadAction } from './actions';
import { ExistingLeadRef } from '@/lib/crm/leads';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  existingLeads: ExistingLeadRef[];
}

export function CsvImportModal({
  isOpen,
  onClose,
  onImportComplete,
  existingLeads,
}: CsvImportModalProps) {
  const [report, setReport] = useState<CsvImportReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  if (!isOpen) return null;

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsedRows = parseCsvContent(text);
      const generatedReport = validateAndProcessCsv(parsedRows, existingLeads);
      setReport(generatedReport);
      setImportedCount(null);
    };
    reader.readAsText(file);
  }

  async function handleConfirmImport() {
    if (!report || report.validRows.length === 0) return;
    setImporting(true);

    let count = 0;
    for (const validLead of report.validRows) {
      const res = await createLeadAction(validLead);
      if (res.success) count++;
    }

    setImporting(false);
    setImportedCount(count);
    onImportComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#151B2B]/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#D0D5DD] bg-[#FFFFFF] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#ECEFF3] pb-4">
          <h2 className="text-lg font-black text-[#151B2B]">Bulk Import Leads via CSV</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[#525A6B] hover:bg-[#ECEFF3] hover:text-[#151B2B]"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          <p className="text-xs text-[#525A6B]">
            Columns:{' '}
            <code className="font-mono text-[#151B2B]">
              organisation_name, category, location, website_url, phone, email, notes
            </code>
          </p>

          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#D0D5DD] bg-[#F5F6F8] p-6 text-center hover:border-[#151B2B]">
            <span className="text-sm font-bold text-[#151B2B]">Click to select CSV file</span>
            <span className="mt-1 text-xs text-[#667085]">.csv text format</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {report && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                <div className="text-xl font-black text-emerald-800">{report.validRows.length}</div>
                <div className="text-xs text-[#525A6B]">Valid Leads</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                <div className="text-xl font-black text-amber-800">{report.duplicates.length}</div>
                <div className="text-xs text-[#525A6B]">Duplicates Filtered</div>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                <div className="text-xl font-black text-red-800">{report.errors.length}</div>
                <div className="text-xs text-[#525A6B]">Invalid Rows</div>
              </div>
            </div>

            {report.duplicates.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs">
                <h4 className="font-bold text-amber-900">Duplicates Skipped:</h4>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[#525A6B]">
                  {report.duplicates.map((d, i) => (
                    <li key={i}>
                      Row {d.rowNumber}: <strong>{d.name}</strong> — {d.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.errors.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs">
                <h4 className="font-bold text-red-900">Validation Errors:</h4>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[#525A6B]">
                  {report.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.rowNumber}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importedCount !== null && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-800">
                Successfully imported {importedCount} new leads into CRM.
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-[#ECEFF3] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#D0D5DD] px-4 py-2.5 text-sm font-bold text-[#525A6B] hover:bg-[#ECEFF3]"
          >
            Close
          </button>
          {report && report.validRows.length > 0 && importedCount === null && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              className="rounded-xl bg-[#151B2B] px-5 py-2.5 text-sm font-bold text-[#F5F6F8] hover:bg-[#2B313C] disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Confirm Import (${report.validRows.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
