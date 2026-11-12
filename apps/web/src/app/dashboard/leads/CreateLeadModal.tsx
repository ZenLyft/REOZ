'use client';

import { useState } from 'react';
import { createLeadAction } from './actions';
import { LeadCreateInput } from '@/lib/crm/leads';

interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeadCreated: () => void;
}

export function CreateLeadModal({ isOpen, onClose, onLeadCreated }: CreateLeadModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<LeadCreateInput>({
    organisation_name: '',
    organisation_type: 'institution',
    category: '',
    location: '',
    website_url: '',
    website_status: 'not_enough_evidence',
    status_evidence_note: '',
    service_interest: 'HOMS & Digital Transformation',
    public_phone: '',
    public_email: '',
    source_url: '',
    next_action: 'Initial audit & outreach',
    next_follow_up: '',
    contact_restriction: 'none',
  });

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await createLeadAction(form);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to create lead');
      return;
    }

    onLeadCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#11100E]/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#DDD4C4] bg-[#FFFDF9] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#EFE7DA] pb-4">
          <h2 className="text-lg font-black text-[#11100E]">Add New Prospect</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[#5A554C] hover:bg-[#F2EBE0] hover:text-[#11100E]"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#11100E]">
              Organisation / Institution Name *
            </label>
            <input
              type="text"
              required
              value={form.organisation_name}
              onChange={(e) => setForm({ ...form, organisation_name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3.5 py-2.5 text-sm text-[#11100E] focus:border-[#11100E] focus:outline-none"
              placeholder="e.g. Regent College & Hostel"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#11100E]">Type</label>
              <select
                value={form.organisation_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    organisation_type: e.target.value as 'local_business' | 'institution',
                  })
                }
                className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2.5 text-sm text-[#11100E]"
              >
                <option value="institution">Institution (HOMS/ERP)</option>
                <option value="local_business">Local Business</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#11100E]">Category *</label>
              <input
                type="text"
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3.5 py-2.5 text-sm text-[#11100E]"
                placeholder="e.g. College, Hostel, Clinic"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#11100E]">Location (City, Country) *</label>
            <input
              type="text"
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3.5 py-2.5 text-sm text-[#11100E]"
              placeholder="e.g. London, UK or Bengaluru, India"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#11100E]">Website URL</label>
            <input
              type="url"
              value={form.website_url}
              onChange={(e) => setForm({ ...form, website_url: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3.5 py-2.5 text-sm text-[#11100E]"
              placeholder="https://example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#11100E]">Website Status *</label>
              <select
                value={form.website_status}
                onChange={(e) => setForm({ ...form, website_status: e.target.value as any })}
                className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2.5 text-sm text-[#11100E]"
              >
                <option value="not_enough_evidence">Not Enough Evidence</option>
                <option value="not_found_in_checked_sources">Not Found in Checked Sources</option>
                <option value="verified">Verified Working</option>
                <option value="appears_outdated">Appears Outdated</option>
                <option value="unavailable_at_check">Unavailable at Check</option>
                <option value="needs_review">Needs Review</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#11100E]">Contact Restriction</label>
              <select
                value={form.contact_restriction}
                onChange={(e) => setForm({ ...form, contact_restriction: e.target.value as any })}
                className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3 py-2.5 text-sm text-[#11100E]"
              >
                <option value="none">None (Standard)</option>
                <option value="do_not_contact">Do Not Contact (DNC)</option>
                <option value="opt_out">Opted Out</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#11100E]">Evidence Note *</label>
            <input
              type="text"
              required
              value={form.status_evidence_note}
              onChange={(e) => setForm({ ...form, status_evidence_note: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3.5 py-2.5 text-sm text-[#11100E]"
              placeholder="e.g. Checked OpenStreetMap & Google Maps; paper outpass desk"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#11100E]">Public Phone</label>
              <input
                type="text"
                value={form.public_phone}
                onChange={(e) => setForm({ ...form, public_phone: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3.5 py-2.5 text-sm text-[#11100E]"
                placeholder="+44 20 7946 0000"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#11100E]">Public Email</label>
              <input
                type="email"
                value={form.public_email}
                onChange={(e) => setForm({ ...form, public_email: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-3.5 py-2.5 text-sm text-[#11100E]"
                placeholder="admissions@college.edu"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#DDD4C4] px-4 py-2.5 text-sm font-bold text-[#5A554C] hover:bg-[#F2EBE0]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[#EA580C] px-5 py-2.5 text-sm font-bold text-[#FAF6EE] hover:bg-[#C2410C] disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Save Prospect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
