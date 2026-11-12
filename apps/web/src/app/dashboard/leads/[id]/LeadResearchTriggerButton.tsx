'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { regenerateLeadOutreachAction } from '@/app/dashboard/approvals/actions';

export function LeadResearchTriggerButton({
  leadId,
  hasExistingDossier,
}: {
  leadId: string;
  hasExistingDossier: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setFeedback(null);
    const res = await regenerateLeadOutreachAction(leadId);
    setLoading(false);

    if (res.success) {
      setFeedback(
        `Research dossier updated (Quality ${res.qualityScore}/100). Queued ${res.queuedChannels?.join(' & ') || 'draft'} for approval.`
      );
      router.refresh();
    } else {
      setFeedback(`Error: ${res.error || 'Could not generate research.'}`);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={handleRun}
          className="rounded-xl bg-[#151B2B] px-4 py-2 text-xs font-bold text-white hover:bg-[#2B313C] disabled:opacity-60"
        >
          {loading
            ? 'Analyzing Prospect...'
            : hasExistingDossier
            ? 'Refresh Research & Regenerate Drafts'
            : 'Run Business Intelligence & Generate Drafts'}
        </button>
        <Link
          href="/dashboard/approvals"
          className="rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2 text-xs font-bold text-[#151B2B] hover:bg-[#ECEFF3]"
        >
          Open Approval Inbox &rarr;
        </Link>
      </div>
      {feedback && (
        <p className="text-xs font-semibold text-[#EA580C]">{feedback}</p>
      )}
    </div>
  );
}

