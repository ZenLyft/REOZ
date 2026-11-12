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
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => setIsCsvOpen(true)}
        className="rounded-xl border border-[#D0D5DD] bg-[#ECEFF3] px-4 py-2.5 text-xs font-bold text-[#151B2B] hover:bg-[#E2E6EC]"
      >
        Import CSV
      </button>

      <button
        type="button"
        onClick={() => setIsAddOpen(true)}
        className="rounded-xl bg-[#FF6B35] px-4 py-2.5 text-xs font-bold text-[#F5F6F8] hover:bg-[#E05220] shadow-sm"
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
        existingLeads={existingLeadRefsProp(existingLeads)}
      />
    </div>
  );
}

function existingLeadRefsProp(list: ExistingLeadRef[]) {
  return list;
}
