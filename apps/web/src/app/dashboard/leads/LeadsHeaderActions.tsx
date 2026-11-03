'use client';

import { useState } from 'react';
import { CreateLeadModal } from './CreateLeadModal';
import { CsvImportModal } from './CsvImportModal';
import { ExistingLeadRef } from '@/lib/crm/leads';
import { useRouter } from 'next/navigation';

interface LeadsHeaderActionsProps {
  existingLeads: ExistingLeadRef[];
}

export function LeadsHeaderActions({ existingLeads }: LeadsHeaderActionsProps) {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCsvOpen, setIsCsvOpen] = useState(false);

  function handleRefresh() {
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setIsCsvOpen(true)}
        className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 hover:text-white"
      >
        📥 Import CSV
      </button>

      <button
        onClick={() => setIsAddOpen(true)}
        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500"
      >
        + Add Prospect
      </button>

      <CreateLeadModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onLeadCreated={handleRefresh}
      />

      <CsvImportModal
        isOpen={isCsvOpen}
        onClose={() => setIsCsvOpen(false)}
        onImportComplete={handleRefresh}
        existingLeads={existingLeads}
      />
    </div>
  );
}

