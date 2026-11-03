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

export function CsvImportModal({ isOpen, onClose, onImportComplete, existingLeads }: CsvImportModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Bulk Import Leads via CSV</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          <p className="text-xs text-zinc-400">
            Upload a CSV with columns: <code className="text-indigo-400">organisation_name, category, location, website_url, phone, email, notes</code>
          </p>

          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-950 p-6 text-center hover:border-indigo-500">
            <span className="text-sm font-medium text-zinc-300">Click to select CSV file</span>
            <span className="mt-1 text-xs text-zinc-500">.csv text format</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {report && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center">
                <div className="text-xl font-bold text-emerald-400">{report.validRows.length}</div>
                <div className="text-xs text-zinc-400">Valid Leads</div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-center">
                <div className="text-xl font-bold text-amber-400">{report.duplicates.length}</div>
                <div className="text-xs text-zinc-400">Duplicates Filtered</div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center">
                <div className="text-xl font-bold text-red-400">{report.errors.length}</div>
                <div className="text-xs text-zinc-400">Invalid / Bad Rows</div>
              </div>
            </div>

            {report.duplicates.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs">
                <h4 className="font-semibold text-amber-400">Duplicates Detected (Skipped):</h4>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-zinc-300">
                  {report.duplicates.map((d, i) => (
                    <li key={i}>
                      Row {d.rowNumber}: <strong>{d.name}</strong> — {d.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.errors.length > 0 && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs">
                <h4 className="font-semibold text-red-400">Validation Errors (Skipped):</h4>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-zinc-300">
                  {report.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.rowNumber}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importedCount !== null && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm font-semibold text-emerald-300">
                Successfully imported {importedCount} new leads into your pipeline!
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
          {report && report.validRows.length > 0 && importedCount === null && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50"
            >
              {importing ? 'Importing Leads...' : `Confirm Import (${report.validRows.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

