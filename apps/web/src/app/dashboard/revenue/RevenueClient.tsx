'use client';

import { useState } from 'react';
import Link from 'next/link';

interface PaymentRecord {
  id: string;
  amount_received_inr: number;
  received_at: string;
  payment_reference: string;
}

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  amount_inr: number;
  status: string;
  due_date: string;
  issued_at: string;
  paid_at?: string | null;
  clients?: { organisation_name: string } | null;
  projects?: { name: string; service_line: string } | null;
  payments?: PaymentRecord[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  service_line: string;
  contracted_value_inr: number;
  clients?: { organisation_name: string } | null;
}

interface RevenueClientProps {
  initialInvoices: InvoiceRecord[];
  projects: ProjectSummary[];
  qualifiedLeadCount: number;
}

export function RevenueClient({
  initialInvoices,
  projects,
  qualifiedLeadCount,
}: RevenueClientProps) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(initialInvoices);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [newInvProjectId, setNewInvProjectId] = useState(projects[0]?.id || '');
  const [newInvAmount, setNewInvAmount] = useState('17500');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const contractedValue = projects.reduce((sum, p) => sum + (p.contracted_value_inr || 0), 0);
  const invoicedValue = invoices.reduce((sum, inv) => sum + (inv.amount_inr || 0), 0);
  const verifiedCollectedCash = invoices.reduce((sum, inv) => {
    const paySum = (inv.payments || []).reduce((pAcc, p) => pAcc + (p.amount_received_inr || 0), 0);
    if (paySum > 0) return sum + paySum;
    return inv.status === 'paid' ? sum + (inv.amount_inr || 0) : sum;
  }, 0);
  const unpaidBalance = Math.max(0, invoicedValue - verifiedCollectedCash);

  async function handleIssueInvoice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_invoice',
          project_id: newInvProjectId,
          amount_inr: parseInt(newInvAmount, 10) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.invoice) {
        setNotice({ type: 'error', text: data.error || 'Could not issue invoice.' });
        return;
      }
      setInvoices((prev) => [data.invoice, ...prev]);
      setIsInvoiceModalOpen(false);
      setNotice({
        type: 'success',
        text: `Issued real invoice ${data.invoice.invoice_number} for ₹${data.invoice.amount_inr.toLocaleString('en-IN')}.`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInvoiceId || !paymentRef.trim()) {
      setNotice({ type: 'error', text: 'Select an invoice and enter a verified UPI/bank ref.' });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_payment',
          invoice_id: selectedInvoiceId,
          payment_reference: paymentRef.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.invoice) {
        setNotice({ type: 'error', text: data.error || 'Failed to verify payment.' });
        return;
      }

      setInvoices((prev) => prev.map((i) => (i.id === data.invoice.id ? data.invoice : i)));
      setIsPaymentModalOpen(false);
      setPaymentRef('');
      setNotice({
        type: 'success',
        text: `Payment recorded against ${data.invoice.invoice_number} and added to Verified Cash Collected.`,
      });
    } finally {
      setBusy(false);
    }
  }

  const pendingInvoices = invoices.filter((i) => i.status !== 'paid');

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center justify-between ${notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
            }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-4 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Real Accounting Tiers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
            Qualified Leads
          </span>
          <div className="mt-1.5 text-2xl font-black text-[#11100E] tabular-nums">
            {qualifiedLeadCount}
          </div>
          <span className="text-xs text-[#5A554C]">Ready to pitch / close</span>
        </div>

        <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
            Contracted Scope
          </span>
          <div className="mt-1.5 text-2xl font-black text-[#11100E] tabular-nums">
            ₹{contractedValue.toLocaleString('en-IN')}
          </div>
          <span className="text-xs text-[#5A554C]">{projects.length} active client project(s)</span>
        </div>

        <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C6A3B]">
            Receivable / Unpaid
          </span>
          <div className="mt-1.5 text-2xl font-black text-[#8C6A3B] tabular-nums">
            ₹{unpaidBalance.toLocaleString('en-IN')}
          </div>
          <span className="text-xs text-[#5A554C]">
            {pendingInvoices.length} open invoice(s)
          </span>
        </div>

        <div className="rounded-2xl border border-[#11100E] bg-[#11100E] p-5 shadow-sm text-[#FAF6EE]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#C8B9A0]">
            Verified Cash Collected
          </span>
          <div className="mt-1.5 text-2xl font-black text-[#FAF6EE] tabular-nums">
            ₹{verifiedCollectedCash.toLocaleString('en-IN')}
          </div>
          <span className="text-xs text-[#D6CCB9]">Bank / UPI reconciled only</span>
        </div>
      </div>

      {/* Invoices Table Card */}
      <div className="rounded-2xl border border-[#E5DDD0] bg-[#FFFDF9] p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EFE7DA] pb-4">
          <div>
            <h2 className="text-base font-bold text-[#11100E]">Live Invoices & Payments</h2>
            <p className="text-xs text-[#5A554C] mt-0.5">
              Every rupee here comes strictly from real rows in Supabase `invoices` and `payments`.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {projects.length > 0 && (
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(true)}
                className="rounded-xl border border-[#DDD4C4] bg-[#F4EEE3] px-4 py-2 text-xs font-bold text-[#11100E] hover:bg-[#EAE1D2]"
              >
                + Issue Invoice
              </button>
            )}
            <button
              type="button"
              disabled={pendingInvoices.length === 0}
              onClick={() => {
                setSelectedInvoiceId(pendingInvoices[0]?.id || '');
                setIsPaymentModalOpen(true);
              }}
              className="rounded-xl bg-[#11100E] px-4 py-2 text-xs font-bold text-[#FAF6EE] hover:bg-[#272420] disabled:opacity-40"
            >
              + Record Payment
            </button>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm font-bold text-[#11100E]">No Invoices Issued Yet</p>
            <p className="text-xs text-[#5A554C]">
              Onboard your first winning client on the Projects tab to auto-issue their advance invoice.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard/projects"
                className="inline-block rounded-xl bg-[#11100E] px-5 py-2 text-xs font-bold text-[#FAF6EE] hover:bg-[#272420]"
              >
                Go to Client Onboarding &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DDD0] text-[11px] font-bold uppercase tracking-wider text-[#7C756A]">
                  <th className="py-3 px-3">Invoice #</th>
                  <th className="py-3 px-3">Client</th>
                  <th className="py-3 px-3">Service</th>
                  <th className="py-3 px-3">Amount (₹)</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3">Payment Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE7DA]">
                {invoices.map((inv) => {
                  const refText = inv.payments?.[0]?.payment_reference || '—';
                  return (
                    <tr key={inv.id} className="hover:bg-[#FAF6EE]">
                      <td className="py-3 px-3 font-mono font-bold text-[#11100E]">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#11100E]">
                        {inv.clients?.organisation_name || 'Client'}
                      </td>
                      <td className="py-3 px-3 text-[#5A554C]">
                        {inv.projects?.service_line || inv.projects?.name || 'Service'}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#11100E]">
                        ₹{(inv.amount_inr || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${inv.status === 'paid'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[#5A554C]">{inv.due_date}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#5A554C]">{refText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Issue Invoice Modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#11100E]/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleIssueInvoice}
            className="w-full max-w-sm rounded-2xl border border-[#DDD4C4] bg-[#FFFDF9] p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-black text-[#11100E]">Issue New Client Invoice</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#11100E]">Client Project</label>
                <select
                  value={newInvProjectId}
                  onChange={(e) => setNewInvProjectId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-[#11100E]"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.clients?.organisation_name || p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-[#11100E]">Invoice Amount (INR ₹)</label>
                <input
                  type="number"
                  min={100}
                  required
                  value={newInvAmount}
                  onChange={(e) => setNewInvAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-[#11100E]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="rounded-xl border border-[#DDD4C4] px-4 py-2 text-xs font-bold text-[#5A554C]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[#11100E] px-4 py-2 text-xs font-bold text-[#FAF6EE]"
              >
                {busy ? 'Issuing...' : 'Issue Invoice'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#11100E]/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-sm rounded-2xl border border-[#DDD4C4] bg-[#FFFDF9] p-6 shadow-2xl space-y-4"
          >
            <div>
              <h3 className="text-base font-black text-[#11100E]">Record Verified Payment</h3>
              <p className="mt-1 text-xs text-[#5A554C]">
                Enter the verified bank or UPI reference received.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#11100E]">Open Invoice</label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-[#11100E]"
                >
                  {pendingInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} — {inv.clients?.organisation_name || 'Client'} (₹
                      {inv.amount_inr.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-[#11100E]">UPI / Wire Reference *</label>
                <input
                  type="text"
                  required
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. UPI/63124891024/HDFC"
                  className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2 text-[#11100E]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="rounded-xl border border-[#DDD4C4] px-4 py-2 text-xs font-bold text-[#5A554C]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-[#FAF6EE] hover:bg-emerald-800"
              >
                {busy ? 'Saving...' : 'Confirm Cash Collected'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
