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
        <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
            Qualified Leads
          </span>
          <div className="mt-1.5 text-2xl font-black text-[#151B2B] tabular-nums">
            {qualifiedLeadCount}
          </div>
          <span className="text-xs text-[#525A6B]">Ready to pitch / close</span>
        </div>

        <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
            Contracted Scope
          </span>
          <div className="mt-1.5 text-2xl font-black text-[#151B2B] tabular-nums">
            ₹{contractedValue.toLocaleString('en-IN')}
          </div>
          <span className="text-xs text-[#525A6B]">{projects.length} active client project(s)</span>
        </div>

        <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B35]">
            Receivable / Unpaid
          </span>
          <div className="mt-1.5 text-2xl font-black text-[#FF6B35] tabular-nums">
            ₹{unpaidBalance.toLocaleString('en-IN')}
          </div>
          <span className="text-xs text-[#525A6B]">
            {pendingInvoices.length} open invoice(s)
          </span>
        </div>

        <div className="rounded-2xl border-2 border-[#FF6B35] bg-[#151B2B] p-5 shadow-sm text-[#F5F6F8]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF8A5B]">
            Verified Cash Collected
          </span>
          <div className="mt-1.5 text-2xl font-black text-[#F5F6F8] tabular-nums">
            ₹{verifiedCollectedCash.toLocaleString('en-IN')}
          </div>
          <span className="text-xs text-[#CBD5E1]">Bank / UPI reconciled only</span>
        </div>
      </div>

      {/* Invoices Table Card */}
      <div className="rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#ECEFF3] pb-4">
          <div>
            <h2 className="text-base font-bold text-[#151B2B]">Live Invoices & Payments</h2>
            <p className="text-xs text-[#525A6B] mt-0.5">
              Every rupee here comes strictly from real rows in Supabase `invoices` and `payments`.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {projects.length > 0 && (
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(true)}
                className="rounded-xl border border-[#D0D5DD] bg-[#ECEFF3] px-4 py-2 text-xs font-bold text-[#151B2B] hover:bg-[#E2E6EC]"
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
              className="rounded-xl bg-[#FF6B35] px-4 py-2 text-xs font-bold text-[#F5F6F8] hover:bg-[#E05220] disabled:opacity-40"
            >
              + Record Payment
            </button>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm font-bold text-[#151B2B]">No Invoices Issued Yet</p>
            <p className="text-xs text-[#525A6B]">
              Onboard your first winning client on the Projects tab to auto-issue their advance invoice.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard/projects"
                className="inline-block rounded-xl bg-[#151B2B] px-5 py-2 text-xs font-bold text-[#F5F6F8] hover:bg-[#2B313C]"
              >
                Go to Client Onboarding &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E4E7EC] text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                  <th className="py-3 px-3">Invoice #</th>
                  <th className="py-3 px-3">Client</th>
                  <th className="py-3 px-3">Service</th>
                  <th className="py-3 px-3">Amount (₹)</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3">Payment Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEFF3]">
                {invoices.map((inv) => {
                  const refText = inv.payments?.[0]?.payment_reference || '—';
                  return (
                    <tr key={inv.id} className="hover:bg-[#F5F6F8]">
                      <td className="py-3 px-3 font-mono font-bold text-[#151B2B]">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#151B2B]">
                        {inv.clients?.organisation_name || 'Client'}
                      </td>
                      <td className="py-3 px-3 text-[#525A6B]">
                        {inv.projects?.service_line || inv.projects?.name || 'Service'}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#151B2B]">
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
                      <td className="py-3 px-3 text-[#525A6B]">{inv.due_date}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#525A6B]">{refText}</td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#151B2B]/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleIssueInvoice}
            className="w-full max-w-sm rounded-2xl border border-[#D0D5DD] bg-[#FFFFFF] p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-black text-[#151B2B]">Issue New Client Invoice</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#151B2B]">Client Project</label>
                <select
                  value={newInvProjectId}
                  onChange={(e) => setNewInvProjectId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-2 text-[#151B2B]"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.clients?.organisation_name || p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-[#151B2B]">Invoice Amount (INR ₹)</label>
                <input
                  type="number"
                  min={100}
                  required
                  value={newInvAmount}
                  onChange={(e) => setNewInvAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-2 text-[#151B2B]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="rounded-xl border border-[#D0D5DD] px-4 py-2 text-xs font-bold text-[#525A6B]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[#151B2B] px-4 py-2 text-xs font-bold text-[#F5F6F8]"
              >
                {busy ? 'Issuing...' : 'Issue Invoice'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#151B2B]/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-sm rounded-2xl border border-[#D0D5DD] bg-[#FFFFFF] p-6 shadow-2xl space-y-4"
          >
            <div>
              <h3 className="text-base font-black text-[#151B2B]">Record Verified Payment</h3>
              <p className="mt-1 text-xs text-[#525A6B]">
                Enter the verified bank or UPI reference received.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#151B2B]">Open Invoice</label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-2 text-[#151B2B]"
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
                <label className="font-bold text-[#151B2B]">UPI / Wire Reference *</label>
                <input
                  type="text"
                  required
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. UPI/63124891024/HDFC"
                  className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-2 text-[#151B2B]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="rounded-xl border border-[#D0D5DD] px-4 py-2 text-xs font-bold text-[#525A6B]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-[#F5F6F8] hover:bg-emerald-800"
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
